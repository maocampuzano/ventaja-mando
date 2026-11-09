-- Pendientes pequeños (después de la fase 8).
-- 1. La importación guarda el correo de la persona (si viene y es válido), para poder enviarle correos (fase 6).
-- 2. Quien se dio de baja no sale en las exportaciones, el líder ve la baja de su propia gente (para no ofrecer el
--    WhatsApp manual) y la base no deja registrar un WhatsApp manual a alguien dado de baja.
-- 3. Los errores del panel se borran solos a los 90 días.

-- 1 -------------------------------------------------------------------------------------------------------------
create or replace function public.importar_personas(
  p_campana uuid,
  p_filas jsonb,          -- [{numero, nombre, documento?, telefono?, correo?, zona_id?, lider_id?, fecha_autorizacion? (aaaa-mm-dd)}]
  p_finalidades text[],
  p_evidencia text,
  p_archivo text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rol text := privado.rol(p_campana);
  f jsonb;
  v_numero int;
  v_id uuid;
  v_doc text;
  v_hash text;
  v_terr uuid;
  v_lider uuid;
  v_fecha date;
  v_creadas int := 0;
  v_existian int := 0;
  v_rechazos jsonb := '[]';
begin
  if v_rol is null or v_rol not in ('administrador', 'gerente', 'coordinador') then
    raise exception 'No tiene permiso para importar personas en esta campaña.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_filas) is distinct from 'array' or jsonb_array_length(p_filas) not between 1 and 1000 then
    raise exception 'Envíe entre 1 y 1.000 filas por lote.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_finalidades), 0) = 0 or length(trim(coalesce(p_evidencia, ''))) = 0 then
    raise exception 'Indique las finalidades y la evidencia de la autorización.' using errcode = '22023';
  end if;

  for f in select value from jsonb_array_elements(p_filas) loop
    v_numero := (f ->> 'numero')::int;
    begin
      v_terr := nullif(f ->> 'zona_id', '')::uuid;
      v_lider := nullif(f ->> 'lider_id', '')::uuid;
      v_doc := privado.normaliza_documento(f ->> 'documento');
      v_fecha := nullif(f ->> 'fecha_autorizacion', '')::date;

      if length(trim(coalesce(f ->> 'nombre', ''))) < 3 then
        v_rechazos := v_rechazos || jsonb_build_object('numero', v_numero, 'motivo', 'Falta el nombre.');
        continue;
      end if;
      if v_doc is not null and length(v_doc) not between 5 and 11 then
        v_rechazos := v_rechazos || jsonb_build_object('numero', v_numero, 'motivo', 'La cédula no es válida.');
        continue;
      end if;
      if v_fecha > (now() at time zone 'America/Bogota')::date then
        v_rechazos := v_rechazos || jsonb_build_object('numero', v_numero, 'motivo', 'La fecha de autorización es posterior a hoy.');
        continue;
      end if;
      -- coalesce: sin zona ni líder, la regla da nulo, y nulo es «no puede» (como en la RLS).
      if not coalesce(privado.puede_ver_persona(p_campana, v_terr, v_lider), false) then
        v_rechazos := v_rechazos || jsonb_build_object('numero', v_numero, 'motivo', 'La zona no está en su territorio.');
        continue;
      end if;

      v_hash := privado.hash_documento(v_doc);
      if v_hash is not null and exists (
        select 1 from public.persona p
        where p.campana_id = p_campana and p.documento_hash = v_hash
          and privado.puede_ver_persona(p.campana_id, p.territorio_trabajo_id, p.lider_id)
      ) then
        v_existian := v_existian + 1;
        v_rechazos := v_rechazos || jsonb_build_object('numero', v_numero, 'motivo', 'Ya está en la base (misma cédula).');
        continue;
      end if;

      insert into public.persona (
        campana_id, nombre, origen, documento_cifrado, documento_hash, telefono, correo, territorio_trabajo_id, lider_id, creado_por
      ) values (
        p_campana, trim(f ->> 'nombre'), 'importacion', privado.cifrar_documento(v_doc), v_hash,
        nullif(trim(f ->> 'telefono'), ''),
        case when lower(trim(f ->> 'correo')) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then lower(trim(f ->> 'correo')) end,
        v_terr, v_lider, auth.uid()
      ) returning id into v_id;

      insert into public.autorizacion (persona_id, campana_id, finalidades, canal, evidencia_url, fecha, registrado_por)
      values (v_id, p_campana, p_finalidades, 'importacion', trim(p_evidencia),
              coalesce(v_fecha::timestamp at time zone 'America/Bogota', now()), auth.uid());

      v_creadas := v_creadas + 1;
    exception when others then
      -- El mensaje de Postgres no incluye la cédula: solo se cifra y se compara su HMAC.
      v_rechazos := v_rechazos || jsonb_build_object('numero', v_numero, 'motivo', 'No se pudo guardar: ' || sqlerrm);
    end;
  end loop;

  perform privado.auditar(p_campana, 'importar_personas', 'persona', null, jsonb_build_object(
    'archivo', p_archivo, 'filas', jsonb_array_length(p_filas), 'creadas', v_creadas,
    'ya_existian', v_existian, 'rechazadas', jsonb_array_length(v_rechazos) - v_existian));

  return jsonb_build_object('creadas', v_creadas, 'ya_existian', v_existian, 'rechazos', v_rechazos);
end;
$$;



-- 2 -------------------------------------------------------------------------------------------------------------
create or replace function public.exportar_personas(
  p_campana uuid, p_finalidad text default 'contacto_campana', p_zonas uuid[] default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ref uuid := gen_random_uuid();
  v_filas jsonb;
  v_usuario text;
begin
  if not privado.es_direccion(p_campana) then
    raise exception 'Solo la dirección de la campaña puede exportar.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'nombre', p.nombre, 'celular', p.telefono, 'zona', t.nombre, 'lider', l.nombre,
      'relacion', p.relacion, 'estado', p.estado_contacto,
      'autorizada_el', to_char(a.fecha at time zone 'America/Bogota', 'DD/MM/YYYY'))
      order by t.nombre nulls last, p.nombre), '[]')
  into v_filas
  from public.persona p
  join lateral (
    select min(x.fecha) as fecha from public.autorizacion x
    where x.persona_id = p.id and x.revocada_en is null and p_finalidad = any (x.finalidades)
  ) a on a.fecha is not null
  left join public.territorio t on t.id = p.territorio_trabajo_id
  left join public.lider l on l.id = p.lider_id
  where p.campana_id = p_campana and (p_zonas is null or p.territorio_trabajo_id = any (p_zonas))
    -- Quien se dio de baja no quiere que lo contacten por ningún medio: no sale en ninguna exportación.
    and not exists (select 1 from public.baja_contacto b where b.persona_id = p.id);

  select coalesce(u.nombre, '') into v_usuario from public.usuario u where u.id = auth.uid();
  perform privado.auditar(p_campana, 'exportar_personas', 'persona', null, jsonb_build_object(
    'referencia', v_ref, 'finalidad', p_finalidad, 'zonas', p_zonas, 'cantidad', jsonb_array_length(v_filas)));

  return jsonb_build_object('referencia', v_ref, 'exportado_por', v_usuario,
    'exportado_en', to_char(now() at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI'), 'finalidad', p_finalidad,
    'filas', v_filas);
end;
$$;

-- El líder (y quien vea a la persona) puede saber si se dio de baja; nada más de la tabla.
create policy ver_si_ve_a_la_persona on public.baja_contacto for select to authenticated
  using (exists (select 1 from public.persona p where p.id = baja_contacto.persona_id));

drop policy crear on public.mensaje;
create policy crear on public.mensaje for insert to authenticated
  with check (creado_por = auth.uid() and (
    privado.es_direccion(campana_id)
    or (canal = 'wa_manual' and exists (select 1 from public.persona p where p.id = persona_id)
        and not exists (select 1 from public.baja_contacto b where b.persona_id = mensaje.persona_id))
  ));

-- 3 -------------------------------------------------------------------------------------------------------------
create index on public.error_panel (en);
create or replace function public.registrar_error(p_campana uuid, p_mensaje text, p_pila text, p_ruta text, p_version text, p_navegador text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return; end if;
  -- Limpieza: lo que tenga más de 90 días se borra (ya no sirve para diagnosticar y es menos que guardar).
  delete from public.error_panel where en < now() - interval '90 days';
  if (select count(*) from public.error_panel where usuario_id = auth.uid() and en > now() - interval '1 hour') >= 30 then return; end if;
  insert into public.error_panel (campana_id, usuario_id, mensaje, pila, ruta, version, navegador)
  values (case when coalesce(privado.es_miembro(p_campana), false) then p_campana end, auth.uid(),
    privado.limpiar_texto(p_mensaje, 500), privado.limpiar_texto(p_pila, 2000), privado.limpiar_texto(split_part(coalesce(p_ruta, ''), '#', 1), 200),
    left(coalesce(p_version, ''), 40), privado.limpiar_texto(p_navegador, 200));
exception when others then
  return;
end;
$$;

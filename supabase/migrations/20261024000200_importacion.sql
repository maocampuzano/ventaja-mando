-- Importación de personas desde Excel o CSV (fase 2), por lotes de hasta 1.000 filas.
-- Cada persona entra con su autorización en la misma operación (regla 3), con canal «importacion», las
-- finalidades y la evidencia que indica quien importa y, si el archivo la trae, la fecha en que se firmó.
-- Corre con privilegios propios para escribir la auditoría; por eso valida ella misma el rol y el territorio
-- de cada fila con la misma regla de la RLS (privado.puede_ver_persona).
-- La cédula repetida solo se detecta entre las personas que quien importa puede ver: así no se revela si una
-- cédula existe en otra zona. Esos casos los encuentra después la dirección con posibles_duplicados.

create or replace function public.importar_personas(
  p_campana uuid,
  p_filas jsonb,          -- [{numero, nombre, documento?, telefono?, zona_id?, lider_id?, fecha_autorizacion? (aaaa-mm-dd)}]
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
        campana_id, nombre, origen, documento_cifrado, documento_hash, telefono, territorio_trabajo_id, lider_id, creado_por
      ) values (
        p_campana, trim(f ->> 'nombre'), 'importacion', privado.cifrar_documento(v_doc), v_hash,
        nullif(trim(f ->> 'telefono'), ''), v_terr, v_lider, auth.uid()
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

revoke all on function public.importar_personas(uuid, jsonb, text[], text, text) from public, anon;
grant execute on function public.importar_personas(uuid, jsonb, text[], text, text) to authenticated;

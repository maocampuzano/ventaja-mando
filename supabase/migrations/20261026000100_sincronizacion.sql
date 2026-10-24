-- Sincronización de la app (fase 3). Cada operación nace en el celular con su propio identificador (UUID) y el
-- servidor lo usa como llave: si la señal se cae después de guardar y antes de que el celular reciba la respuesta,
-- el reintento responde «ya_estaba» y no duplica (ver packages/nucleo/src/sincronizacion.ts).
-- Corren como quien llama (security invoker): la RLS de cada tabla decide qué puede guardar. Si el identificador ya
-- existe pero quien llama no puede ver esa fila, se rechaza sin decir de quién es.

-- Persona registrada por el líder en la calle, con su autorización en la misma operación (regla 3).
create or replace function public.registrar_persona_movil(
  p_id uuid,
  p_campana uuid,
  p_nombre text,
  p_documento text,
  p_telefono text,
  p_zona uuid,
  p_finalidades text[],
  p_canal text,           -- 'presencial' (firma en papel o en pantalla) o 'enlace'
  p_evidencia text,       -- ruta de la foto de la firma o descripción de dónde está el soporte
  p_capturado_en timestamptz
)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_rol text := privado.rol(p_campana);
  v_lider uuid := privado.lider_actual(p_campana);
  v_doc text := privado.normaliza_documento(p_documento);
  v_hash text;
  v_fecha timestamptz := least(coalesce(p_capturado_en, now()), now());
begin
  if p_id is null then
    raise exception 'Falta el identificador de la operación.' using errcode = '22023';
  end if;
  if exists (select 1 from public.persona where id = p_id) then
    return 'ya_estaba';
  end if;
  if exists (select 1 from privado.identificador_usado(p_id)) then
    raise exception 'El identificador de la operación ya está en uso.' using errcode = '23505';
  end if;

  if v_rol is null or v_rol not in ('administrador', 'gerente', 'coordinador', 'lider') then
    raise exception 'No tiene permiso para registrar personas en esta campaña.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'Falta el nombre.' using errcode = '22023';
  end if;
  if v_doc is not null and length(v_doc) not between 5 and 11 then
    raise exception 'La cédula no es válida.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_finalidades), 0) = 0 or length(trim(coalesce(p_evidencia, ''))) = 0 then
    raise exception 'Falta la autorización: finalidades y evidencia.' using errcode = '22023';
  end if;
  if p_canal is null or p_canal not in ('presencial', 'enlace') then
    raise exception 'El canal de la autorización debe ser presencial o enlace.' using errcode = '22023';
  end if;
  -- El líder solo registra en las zonas que tiene asignadas.
  if v_rol = 'lider' and p_zona is not null and not exists (
    select 1 from public.lider l where l.id = v_lider and p_zona = any (l.territorio_ids)
  ) then
    raise exception 'La zona no está en su territorio.' using errcode = '42501';
  end if;

  v_hash := privado.hash_documento(v_doc);
  -- Como en la importación: la cédula repetida solo se busca entre las personas que quien registra puede ver.
  if v_hash is not null and exists (
    select 1 from public.persona p where p.campana_id = p_campana and p.documento_hash = v_hash
  ) then
    raise exception 'Ya está en la base (misma cédula).' using errcode = '23505';
  end if;

  insert into public.persona (
    id, campana_id, nombre, origen, documento_cifrado, documento_hash, telefono, territorio_trabajo_id, lider_id, creado_por, creado_en
  ) values (
    p_id, p_campana, trim(p_nombre), case p_canal when 'enlace' then 'enlace' else 'formulario' end,
    privado.cifrar_documento(v_doc), v_hash, nullif(trim(p_telefono), ''), p_zona,
    case when v_rol = 'lider' then v_lider end, auth.uid(), v_fecha
  );
  insert into public.autorizacion (persona_id, campana_id, finalidades, canal, evidencia_url, fecha, registrado_por)
  values (p_id, p_campana, p_finalidades, p_canal, trim(p_evidencia), v_fecha, auth.uid());
  return 'creada';
end;
$$;

-- ¿El identificador ya existe en alguna tabla que recibe operaciones del celular? Solo dice sí o no, sin datos.
create or replace function privado.identificador_usado(p_id uuid)
returns setof boolean
language sql
stable
security definer
set search_path = ''
as $$
  select true where exists (select 1 from public.persona where id = p_id)
    or exists (select 1 from public.lote_ocr where id = p_id)
    or exists (select 1 from public.incidencia where id = p_id)
    or exists (select 1 from public.acta_e14 where id = p_id)
$$;

-- Foto de planilla subida por el líder. La lectura (OCR) y la revisión humana obligatoria vienen en la fase 4.
create or replace function public.registrar_planilla_movil(p_id uuid, p_campana uuid, p_archivo text)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_lider uuid := privado.lider_actual(p_campana);
begin
  if p_id is null or length(trim(coalesce(p_archivo, ''))) = 0 then
    raise exception 'Falta el identificador o la foto de la planilla.' using errcode = '22023';
  end if;
  if exists (select 1 from public.lote_ocr where id = p_id) then
    return 'ya_estaba';
  end if;
  if exists (select 1 from privado.identificador_usado(p_id)) then
    raise exception 'El identificador de la operación ya está en uso.' using errcode = '23505';
  end if;
  if v_lider is null then
    raise exception 'Solo un líder sube planillas desde la app.' using errcode = '42501';
  end if;
  insert into public.lote_ocr (id, campana_id, lider_id, archivo_url, creado_por)
  values (p_id, p_campana, v_lider, trim(p_archivo), auth.uid());
  return 'creada';
end;
$$;

-- Novedad del testigo en su mesa. La de tipo «apertura» además marca al testigo como presente en la mesa.
create or replace function public.registrar_novedad_movil(
  p_id uuid, p_campana uuid, p_puesto uuid, p_mesa integer, p_tipo text, p_descripcion text,
  p_prioridad text, p_evidencia text, p_hora timestamptz
)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_id is null or length(trim(coalesce(p_tipo, ''))) = 0 then
    raise exception 'Falta el identificador o el tipo de novedad.' using errcode = '22023';
  end if;
  if exists (select 1 from public.incidencia where id = p_id) then
    return 'ya_estaba';
  end if;
  if exists (select 1 from privado.identificador_usado(p_id)) then
    raise exception 'El identificador de la operación ya está en uso.' using errcode = '23505';
  end if;
  if not coalesce(privado.es_mi_mesa(p_campana, p_puesto, p_mesa), false) then
    raise exception 'Solo el testigo de esa mesa reporta sus novedades desde la app.' using errcode = '42501';
  end if;
  insert into public.incidencia (id, campana_id, puesto_id, mesa, tipo, descripcion, prioridad, evidencia_url, reportado_por, hora)
  values (p_id, p_campana, p_puesto, p_mesa, trim(p_tipo), nullif(trim(p_descripcion), ''),
          coalesce(p_prioridad, 'media'), nullif(trim(p_evidencia), ''), auth.uid(), least(coalesce(p_hora, now()), now()));
  if trim(p_tipo) = 'apertura' then
    perform privado.marcar_en_mesa(p_campana, p_puesto, p_mesa);
  end if;
  return 'creada';
end;
$$;

-- El testigo no edita su asignación (eso es de la dirección o el coordinador); solo queda «en mesa» al abrir.
create or replace function privado.marcar_en_mesa(p_campana uuid, p_puesto uuid, p_mesa integer)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.testigo set estado = 'en_mesa'
  where campana_id = p_campana and puesto_id = p_puesto and usuario_id = auth.uid()
    and (mesa is null or mesa = p_mesa) and estado in ('asignado', 'confirmado')
$$;

-- Foto del E-14. Entra como «recibida»; nadie la consolida sin revisión de una persona (regla 7).
create or replace function public.registrar_e14_movil(p_id uuid, p_campana uuid, p_puesto uuid, p_mesa integer, p_foto text)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_id is null or p_mesa is null or length(trim(coalesce(p_foto, ''))) = 0 then
    raise exception 'Falta el identificador, la mesa o la foto del E-14.' using errcode = '22023';
  end if;
  if exists (select 1 from public.acta_e14 where id = p_id) then
    return 'ya_estaba';
  end if;
  if exists (select 1 from privado.identificador_usado(p_id)) then
    raise exception 'El identificador de la operación ya está en uso.' using errcode = '23505';
  end if;
  if not coalesce(privado.es_mi_mesa(p_campana, p_puesto, p_mesa), false) then
    raise exception 'Solo el testigo de esa mesa sube su E-14 desde la app.' using errcode = '42501';
  end if;
  insert into public.acta_e14 (id, campana_id, puesto_id, mesa, foto_url, creado_por)
  values (p_id, p_campana, p_puesto, p_mesa, trim(p_foto), auth.uid());
  return 'creada';
end;
$$;

-- De lo que el celular ya envió, ¿qué revisó una persona? Persona validada o más, planilla aprobada,
-- novedad atendida o cerrada, E-14 revisado o consolidado. Solo devuelve identificadores que quien pregunta puede ver.
create or replace function public.estado_registros_movil(p_ids uuid[])
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select id from public.persona where id = any (p_ids) and estado_contacto in ('validado', 'comprometido')
  union all
  select id from public.lote_ocr where id = any (p_ids) and estado = 'aprobado'
  union all
  select id from public.incidencia where id = any (p_ids) and estado in ('atendida', 'cerrada')
  union all
  select id from public.acta_e14 where id = any (p_ids) and estado in ('revisada', 'consolidada')
$$;

revoke all on function public.registrar_persona_movil(uuid, uuid, text, text, text, uuid, text[], text, text, timestamptz) from public, anon;
revoke all on function public.registrar_planilla_movil(uuid, uuid, text) from public, anon;
revoke all on function public.registrar_novedad_movil(uuid, uuid, uuid, integer, text, text, text, text, timestamptz) from public, anon;
revoke all on function public.registrar_e14_movil(uuid, uuid, uuid, integer, text) from public, anon;
revoke all on function public.estado_registros_movil(uuid[]) from public, anon;
grant execute on function public.registrar_persona_movil(uuid, uuid, text, text, text, uuid, text[], text, text, timestamptz) to authenticated;
grant execute on function public.registrar_planilla_movil(uuid, uuid, text) to authenticated;
grant execute on function public.registrar_novedad_movil(uuid, uuid, uuid, integer, text, text, text, text, timestamptz) to authenticated;
grant execute on function public.registrar_e14_movil(uuid, uuid, uuid, integer, text) to authenticated;
grant execute on function public.estado_registros_movil(uuid[]) to authenticated;
revoke all on function privado.identificador_usado(uuid) from public, anon;
revoke all on function privado.marcar_en_mesa(uuid, uuid, integer) from public, anon;
grant execute on function privado.identificador_usado(uuid) to authenticated;
grant execute on function privado.marcar_en_mesa(uuid, uuid, integer) to authenticated;

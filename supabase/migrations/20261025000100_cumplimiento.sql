-- Datos y cumplimiento (fase 2): plazos de las solicitudes de titulares, resumen y exportaciones auditadas.

-- Días hábiles de Colombia ---------------------------------------------------------------------------
-- Mismo cálculo que packages/nucleo/src/plazos.ts: festivos fijos, trasladables al lunes (Ley 51 de 1983)
-- y los que dependen de la Pascua.

create or replace function privado.pascua(p_anio integer)
returns date language plpgsql immutable set search_path = ''
as $$
declare
  a int := p_anio % 19; b int := p_anio / 100; c int := p_anio % 100; d int := b / 4; e int := b % 4;
  f int := (b + 8) / 25; g int := (b - f + 1) / 3; h int := (19 * a + b - d - g + 15) % 30;
  i int := c / 4; k int := c % 4; l int := (32 + 2 * e + 2 * i - h - k) % 7; m int := (a + 11 * h + 22 * l) / 451;
begin
  return make_date(p_anio, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end;
$$;

create or replace function privado.festivos(p_anio integer)
returns setof date language sql immutable set search_path = ''
as $$
  with p as (select privado.pascua(p_anio) as d),
  trasladables as (
    select x from (values (make_date(p_anio, 1, 6)), (make_date(p_anio, 3, 19)), (make_date(p_anio, 6, 29)),
      (make_date(p_anio, 8, 15)), (make_date(p_anio, 10, 12)), (make_date(p_anio, 11, 1)), (make_date(p_anio, 11, 11))) v(x)
    union all select d + 39 from p union all select d + 60 from p union all select d + 68 from p
  )
  select x from (values (make_date(p_anio, 1, 1)), (make_date(p_anio, 5, 1)), (make_date(p_anio, 7, 20)),
    (make_date(p_anio, 8, 7)), (make_date(p_anio, 12, 8)), (make_date(p_anio, 12, 25))) v(x)
  union select d - 3 from p
  union select d - 2 from p
  -- Al lunes siguiente (isodow: 1 = lunes … 7 = domingo); si ya es lunes, se queda.
  union select x + ((8 - extract(isodow from x)::int) % 7) from trasladables
$$;

create or replace function privado.sumar_dias_habiles(p_fecha date, p_n integer)
returns date language plpgsql stable set search_path = ''
as $$
declare
  d date := p_fecha;
  n int := 0;
begin
  while n < p_n loop
    d := d + 1;
    if extract(isodow from d) < 6 and d not in (select privado.festivos(extract(year from d)::int)) then
      n := n + 1;
    end if;
  end loop;
  return d;
end;
$$;

-- Fin del día en Colombia: el plazo vence a las 23:59:59 de la fecha límite.
create or replace function privado.fin_del_dia(p_fecha date)
returns timestamptz language sql immutable set search_path = ''
as $$ select ((p_fecha + 1)::timestamp at time zone 'America/Bogota') - interval '1 second' $$;

-- Solicitudes de titulares -----------------------------------------------------------------------------

alter table public.solicitud_titular add column prorrogada_en timestamptz;
alter table public.solicitud_titular add column respuesta text;

create or replace function public.registrar_solicitud_titular(
  p_campana uuid, p_tipo text, p_persona uuid default null, p_detalle text default null, p_recibida date default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_recibida date := coalesce(p_recibida, (now() at time zone 'America/Bogota')::date);
  v_dias int := case p_tipo when 'conocer' then 10 when 'actualizar' then 15 when 'suprimir' then 15 when 'revocar' then 15 end;
  v_id uuid;
begin
  if v_dias is null then
    raise exception 'Tipo de solicitud desconocido: %.', p_tipo using errcode = '22023';
  end if;
  if v_recibida > (now() at time zone 'America/Bogota')::date then
    raise exception 'La fecha de recibo no puede ser futura.' using errcode = '22023';
  end if;
  insert into public.solicitud_titular (campana_id, persona_id, tipo, detalle, recibida_en, vence_en)
  values (p_campana, p_persona, p_tipo, nullif(trim(coalesce(p_detalle, '')), ''),
          (v_recibida::timestamp at time zone 'America/Bogota'),
          privado.fin_del_dia(privado.sumar_dias_habiles(v_recibida, v_dias)))
  returning id into v_id;
  return v_id;
end;
$$;

-- Prórroga: una sola vez, por los días que permite la ley. Hay que informar al titular el motivo (art. 14 y 15).
create or replace function public.prorrogar_solicitud_titular(p_solicitud uuid)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  s public.solicitud_titular;
begin
  select * into s from public.solicitud_titular where id = p_solicitud for update;
  if s.id is null then
    raise exception 'La solicitud no existe o no la puede ver.' using errcode = 'P0002';
  end if;
  if s.prorrogada_en is not null then
    raise exception 'La solicitud ya se prorrogó una vez.' using errcode = '22023';
  end if;
  if s.estado in ('resuelta', 'rechazada') then
    raise exception 'La solicitud ya está cerrada.' using errcode = '22023';
  end if;
  update public.solicitud_titular
  set vence_en = privado.fin_del_dia(privado.sumar_dias_habiles((vence_en at time zone 'America/Bogota')::date,
                   case tipo when 'conocer' then 5 else 8 end)),
      prorrogada_en = now()
  where id = p_solicitud
  returning vence_en into s.vence_en;
  return s.vence_en;
end;
$$;

-- Revoca todas las autorizaciones vigentes de una persona (solicitud de revocatoria). Respeta la RLS.
create or replace function public.revocar_autorizaciones_de(p_persona uuid)
returns integer
language sql
set search_path = ''
as $$
  with r as (
    update public.autorizacion set revocada_en = now()
    where persona_id = p_persona and revocada_en is null
    returning 1
  )
  select count(*)::int from r
$$;

-- Busca personas para enlazarlas a una solicitud: por cédula exacta (HMAC) o por nombre o celular. Respeta la RLS.
create or replace function public.buscar_personas(p_campana uuid, p_texto text)
returns table (id uuid, nombre text, telefono text, zona text)
language sql
stable
set search_path = ''
as $$
  select p.id, p.nombre, p.telefono, t.nombre
  from public.persona p left join public.territorio t on t.id = p.territorio_trabajo_id
  where p.campana_id = p_campana and length(trim(coalesce(p_texto, ''))) >= 3
    and (p.documento_hash = privado.hash_documento(p_texto)
      or extensions.unaccent(lower(p.nombre)) like '%' || extensions.unaccent(lower(trim(p_texto))) || '%'
      or privado.normaliza_telefono(p.telefono) = privado.normaliza_telefono(p_texto))
  order by p.nombre
  limit 20
$$;

-- Resumen de cumplimiento -------------------------------------------------------------------------------
-- Solo cifras: lo ven administración, gerencia (con 2FA) y candidato.
create or replace function public.resumen_cumplimiento(p_campana uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rol text := privado.rol(p_campana);
  v_hoy timestamptz := now();
begin
  if v_rol is null or v_rol not in ('administrador', 'gerente', 'candidato') then
    raise exception 'No tiene permiso para ver el resumen de cumplimiento.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'personas', (select count(*) from public.persona where campana_id = p_campana),
    'con_autorizacion_vigente', (select count(distinct a.persona_id) from public.autorizacion a
       where a.campana_id = p_campana and a.revocada_en is null),
    'autorizaciones_revocadas', (select count(*) from public.autorizacion where campana_id = p_campana and revocada_en is not null),
    'por_finalidad', (select coalesce(jsonb_object_agg(f, n), '{}') from (
       select unnest(finalidades) f, count(*) n from public.autorizacion
       where campana_id = p_campana and revocada_en is null group by 1) x),
    'por_canal', (select coalesce(jsonb_object_agg(canal, n), '{}') from (
       select canal, count(*) n from public.autorizacion where campana_id = p_campana and revocada_en is null group by 1) x),
    'solicitudes_abiertas', (select count(*) from public.solicitud_titular
       where campana_id = p_campana and estado in ('recibida', 'en_tramite')),
    'solicitudes_vencidas', (select count(*) from public.solicitud_titular
       where campana_id = p_campana and estado in ('recibida', 'en_tramite') and vence_en < v_hoy),
    'exportaciones_30_dias', (select count(*) from public.auditoria
       where campana_id = p_campana and accion = 'exportar_personas' and en > v_hoy - interval '30 days'),
    'preferencia_politica_activa', (select permite_preferencia_politica from public.campana where id = p_campana)
  );
end;
$$;

-- Exportación con marca y auditoría ----------------------------------------------------------------------
-- Solo la dirección. Solo personas con autorización vigente para la finalidad pedida (regla 3) y nunca la cédula.
-- Cada exportación tiene una referencia única que va en el archivo (marca) y en la auditoría, con quién, cuándo,
-- los filtros y la cantidad.
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
  where p.campana_id = p_campana and (p_zonas is null or p.territorio_trabajo_id = any (p_zonas));

  select coalesce(u.nombre, '') into v_usuario from public.usuario u where u.id = auth.uid();
  perform privado.auditar(p_campana, 'exportar_personas', 'persona', null, jsonb_build_object(
    'referencia', v_ref, 'finalidad', p_finalidad, 'zonas', p_zonas, 'cantidad', jsonb_array_length(v_filas)));

  return jsonb_build_object('referencia', v_ref, 'exportado_por', v_usuario,
    'exportado_en', to_char(now() at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI'), 'finalidad', p_finalidad,
    'filas', v_filas);
end;
$$;

revoke all on function privado.pascua(integer), privado.festivos(integer), privado.sumar_dias_habiles(date, integer),
  privado.fin_del_dia(date) from public, anon;
grant execute on function privado.pascua(integer), privado.festivos(integer), privado.sumar_dias_habiles(date, integer),
  privado.fin_del_dia(date) to authenticated;
revoke all on function public.registrar_solicitud_titular(uuid, text, uuid, text, date),
  public.prorrogar_solicitud_titular(uuid), public.revocar_autorizaciones_de(uuid), public.buscar_personas(uuid, text),
  public.resumen_cumplimiento(uuid), public.exportar_personas(uuid, text, uuid[]) from public, anon;
grant execute on function public.registrar_solicitud_titular(uuid, text, uuid, text, date),
  public.prorrogar_solicitud_titular(uuid), public.revocar_autorizaciones_de(uuid), public.buscar_personas(uuid, text),
  public.resumen_cumplimiento(uuid), public.exportar_personas(uuid, text, uuid[]) to authenticated;

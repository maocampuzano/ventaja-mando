-- Crear una campaña nueva después de una venta (decisión de Mauricio del 12/11/2026: las campañas no se registran
-- solas; las crea XYZ Creatia). Solo la clave de servicio puede llamar a crear_campana: ningún usuario del panel.
--
-- Crea, en una sola transacción:
-- 1. la organización y la campaña (cargo, circunscripción, fecha de la elección, meta y tope de gastos);
-- 2. las zonas de trabajo: en una gobernación, una por municipio del departamento; en una alcaldía, las comunas
--    oficiales si están cargadas o, si no, una zona con todo el municipio. Cada zona lleva una forma ilustrativa
--    (un hexágono alrededor de sus puestos de votación) mientras no se carguen los límites oficiales;
-- 3. la invitación del gerente, que vence en 14 días. Devuelve el código, que va en el enlace de la invitación.

-- Hexágono de radio r (en grados) alrededor de un punto. Solo para dibujar zonas sin límites oficiales.
create or replace function privado.hexagono(p_lon double precision, p_lat double precision, p_r double precision)
returns extensions.geometry
language sql
immutable
set search_path = ''
as $$
  select extensions.st_setsrid(extensions.st_multi(extensions.st_makepolygon(extensions.st_makeline(array(
    select extensions.st_makepoint(p_lon + p_r * cos(pi() / 3 * (i % 6) + pi() / 6) / cos(radians(p_lat)),
                                   p_lat + p_r * sin(pi() / 3 * (i % 6) + pi() / 6))
    from generate_series(0, 6) i order by i
  )))), 4326)
$$;

create or replace function public.crear_campana(
  p_nombre text,
  p_cargo text,
  p_divipole text,
  p_eleccion date,
  p_meta integer,
  p_correo_gerente text,
  p_organizacion text default null,
  p_tope numeric default null
)
returns table (campana_id uuid, zonas integer, codigo_invitacion text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_circ public.territorio;
  v_org uuid;
  v_campana uuid;
  v_zonas integer := 0;
  v_codigo text;
begin
  if coalesce(trim(p_nombre), '') = '' or coalesce(trim(p_cargo), '') = '' then
    raise exception 'Escriba el nombre de la candidatura y el cargo.' using errcode = '22023';
  end if;
  if p_eleccion is null or p_eleccion < current_date then
    raise exception 'La fecha de la elección debe ser hoy o una fecha futura.' using errcode = '22023';
  end if;
  if p_meta is null or p_meta <= 0 then
    raise exception 'La meta de votos debe ser mayor que cero.' using errcode = '22023';
  end if;
  if p_tope is not null and p_tope <= 0 then
    raise exception 'El tope de gastos debe ser mayor que cero (o dejarse en blanco).' using errcode = '22023';
  end if;

  select * into v_circ from public.territorio t
  where t.campana_id is null and t.codigo_divipole = trim(p_divipole);
  if v_circ.id is null then
    raise exception 'No existe el territorio oficial con código %. Revise el código DANE (2 dígitos para un departamento, 5 para un municipio) o cargue los territorios primero.', p_divipole
      using errcode = '22023';
  end if;
  if v_circ.nivel not in ('departamento', 'municipio') then
    raise exception 'La circunscripción debe ser un departamento o un municipio.' using errcode = '22023';
  end if;

  insert into public.organizacion (tipo, nombre) values ('campana', coalesce(nullif(trim(p_organizacion), ''), trim(p_nombre)))
  returning id into v_org;
  insert into public.campana (organizacion_id, nombre, cargo, circunscripcion_divipole, eleccion_fecha, meta_votos, tope_gastos)
  values (v_org, trim(p_nombre), trim(p_cargo), v_circ.codigo_divipole, p_eleccion, p_meta, p_tope)
  returning id into v_campana;

  -- Zonas: los hijos oficiales de la circunscripción (municipios o comunas) o, si no hay, la circunscripción entera.
  with hijos as (
    select h.id, h.nombre, h.geom from public.territorio h where h.campana_id is null and h.padre_id = v_circ.id
    union all
    select v_circ.id, 'Todo ' || v_circ.nombre, v_circ.geom
    where not exists (select 1 from public.territorio h where h.campana_id is null and h.padre_id = v_circ.id)
  ),
  centros as (
    select h.id, h.nombre, h.geom,
      (select extensions.st_centroid(extensions.st_collect(p.geom)) from public.puesto p
        where p.geom is not null and (p.territorio_id = h.id
          or p.territorio_id in (select n.id from public.territorio n where n.padre_id = h.id and n.campana_id is null))) as centro
    from hijos h
  ),
  nuevas as (
    insert into public.territorio (campana_id, nivel, nombre, padre_id, geom, fuente, fecha_fuente)
    select v_campana, 'zona', c.nombre, c.id,
      coalesce(c.geom, case when c.centro is not null then privado.hexagono(extensions.st_x(c.centro), extensions.st_y(c.centro),
        case when v_circ.nivel = 'departamento' then 0.08 else 0.02 end) end),
      case when c.geom is null then 'Zona creada con la campaña (forma ilustrativa)' else 'Zona creada con la campaña' end,
      current_date
    from centros c
    returning 1
  )
  select count(*) into v_zonas from nuevas;

  v_codigo := public.crear_invitacion(v_campana, p_correo_gerente, 'gerente', '{}', 14);
  perform privado.auditar(v_campana, 'crear_campana', 'campana', v_campana,
    jsonb_build_object('cargo', trim(p_cargo), 'circunscripcion', v_circ.codigo_divipole, 'zonas', v_zonas));

  return query select v_campana, v_zonas, v_codigo;
end;
$$;

revoke all on function public.crear_campana(text, text, text, date, integer, text, text, numeric) from public, anon, authenticated;
revoke all on function privado.hexagono(double precision, double precision, double precision) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.crear_campana(text, text, text, date, integer, text, text, numeric) to service_role;
  end if;
end $$;

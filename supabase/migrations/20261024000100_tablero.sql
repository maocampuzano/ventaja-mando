-- Tablero del panel web (fase 2): cifras agregadas por zona y por líder.
-- Nunca devuelve personas una por una; por eso también las puede ver el candidato (que no ve personas).
-- Alcance: administración, gerencia y candidato ven toda la campaña; el coordinador, sus territorios y lo que
-- cuelga de ellos. Líderes, testigos y quien no sea miembro reciben un error de permiso.

-- Meta de votos propia de cada zona de la campaña (las zonas oficiales no tienen meta).
alter table public.territorio add column meta_votos integer check (meta_votos >= 0);

create or replace function privado.zonas_del_tablero(p_campana uuid)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rol text := privado.rol(p_campana);
begin
  if v_rol is null or v_rol not in ('administrador', 'gerente', 'candidato', 'coordinador') then
    raise exception 'No tiene permiso para ver el tablero de esta campaña.' using errcode = '42501';
  end if;
  return query
    select t.id from public.territorio t
    where t.campana_id = p_campana
      and (v_rol <> 'coordinador' or t.id = any (privado.territorios_permitidos(p_campana)));
end;
$$;

-- Por zona: personas registradas, validadas (incluye comprometidas) y comprometidas; líderes; pauta de los
-- últimos 14 días; y el potencial, que es la votación total de la elección más reciente cargada en
-- historico_resultado para esa zona (0 si no hay histórico).
create or replace function public.tablero_zonas(p_campana uuid)
returns table (
  territorio_id uuid, nombre text, padre_id uuid, geojson jsonb, centro jsonb, meta integer, potencial bigint,
  bruto bigint, validados bigint, comprometidos bigint, lideres bigint, alcance bigint, clics bigint, gasto numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with zonas as (select z from privado.zonas_del_tablero(p_campana) z),
  ultima as (
    select h.eleccion from public.historico_resultado h
    where h.territorio_id in (select z from zonas) order by h.eleccion desc limit 1
  )
  select t.id, t.nombre, t.padre_id,
    extensions.st_asgeojson(t.geom)::jsonb,
    extensions.st_asgeojson(extensions.st_pointonsurface(t.geom))::jsonb,
    t.meta_votos,
    coalesce((select sum(h.votos) from public.historico_resultado h
              where h.territorio_id = t.id and h.eleccion = (select eleccion from ultima)), 0),
    (select count(*) from public.persona p where p.campana_id = p_campana and p.territorio_trabajo_id = t.id),
    (select count(*) from public.persona p where p.campana_id = p_campana and p.territorio_trabajo_id = t.id
       and p.estado_contacto in ('validado', 'comprometido')),
    (select count(*) from public.persona p where p.campana_id = p_campana and p.territorio_trabajo_id = t.id
       and p.estado_contacto = 'comprometido'),
    (select count(*) from public.lider l where l.campana_id = p_campana and t.id = any (l.territorio_ids)),
    coalesce((select sum(m.alcance) from public.pauta_metrica m where m.campana_id = p_campana and m.territorio_id = t.id
              and m.fecha > current_date - 14), 0),
    coalesce((select sum(m.clics) from public.pauta_metrica m where m.campana_id = p_campana and m.territorio_id = t.id
              and m.fecha > current_date - 14), 0),
    coalesce((select sum(m.gasto) from public.pauta_metrica m where m.campana_id = p_campana and m.territorio_id = t.id
              and m.fecha > current_date - 14), 0)
  from public.territorio t
  where t.id in (select z from zonas)
  order by t.nombre
$$;

-- Por líder: los componentes del índice del líder (packages/nucleo/src/lider.ts). «Duplicados con otros» cuenta
-- sus personas cuyo documento (HMAC) o teléfono también aparece en una persona de otro líder de la campaña.
create or replace function public.tablero_lideres(p_campana uuid)
returns table (
  lider_id uuid, nombre text, territorio_ids uuid[], meta integer, registrados bigint, validados bigint,
  duplicados_con_otros bigint, tareas_hechas bigint, tareas_asignadas bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with zonas as (select array_agg(z) as ids from privado.zonas_del_tablero(p_campana) z)
  select l.id, l.nombre, l.territorio_ids, l.meta,
    (select count(*) from public.persona p where p.lider_id = l.id),
    (select count(*) from public.persona p where p.lider_id = l.id and p.estado_contacto in ('validado', 'comprometido')),
    (select count(*) from public.persona p where p.lider_id = l.id and exists (
       select 1 from public.persona o
       where o.campana_id = p_campana and o.lider_id is distinct from l.id
         and ((p.documento_hash is not null and o.documento_hash = p.documento_hash)
           or (p.telefono is not null and o.telefono = p.telefono)))),
    (select count(*) from public.tarea ta where ta.campana_id = p_campana and l.usuario_id is not null
       and ta.asignado_a = l.usuario_id and ta.estado = 'hecha'),
    (select count(*) from public.tarea ta where ta.campana_id = p_campana and l.usuario_id is not null
       and ta.asignado_a = l.usuario_id and ta.estado <> 'cancelada')
  from public.lider l, zonas
  where l.campana_id = p_campana and l.territorio_ids && zonas.ids
  order by l.nombre
$$;

revoke all on function privado.zonas_del_tablero(uuid) from public, anon;
revoke all on function public.tablero_zonas(uuid), public.tablero_lideres(uuid) from public, anon;
grant execute on function public.tablero_zonas(uuid), public.tablero_lideres(uuid) to authenticated;

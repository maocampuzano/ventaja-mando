-- Día E (fase 5): centro de mando en tiempo real. Novedades con responsable y escalamiento, alertas del E-14,
-- hora de llegada del testigo, modo simulacro y un tablero agregado por mesa. Aquí no entra ningún dato de personas:
-- el tablero cuenta mesas, testigos, actas y novedades (regla 6 si Strategos lo llega a usar).

alter table public.incidencia
  add column responsable_id uuid references public.usuario (id),
  add column escalada_en timestamptz,
  add column atendida_en timestamptz,
  add column atendida_por uuid references public.usuario (id),
  add column simulacro boolean not null default false;
create index on public.incidencia (campana_id, simulacro, estado);

alter table public.acta_e14
  -- Alertas aritméticas de la lectura (nucleo/lectura.ts → alertasActa). Las revisa una persona (regla 7).
  add column alertas integer not null default 0 check (alertas >= 0),
  add column simulacro boolean not null default false;
create index on public.acta_e14 (campana_id, simulacro);

alter table public.testigo add column llegada_en timestamptz;

-- Simulacros ----------------------------------------------------------------------------------------------------
-- Mientras hay un simulacro activo, las novedades y actas nuevas de la campaña quedan marcadas como simulacro y no se
-- mezclan con las reales. Al terminarlo se borran. El día de la elección no se puede iniciar uno y, si quedó alguno
-- abierto, no marca nada: los datos de ese día siempre son reales.

create table public.simulacro (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  iniciado_por uuid not null references public.usuario (id),
  iniciado_en timestamptz not null default now(),
  terminado_por uuid references public.usuario (id),
  terminado_en timestamptz,
  resumen jsonb
);
create unique index simulacro_uno_activo on public.simulacro (campana_id) where terminado_en is null;
alter table public.simulacro enable row level security;
create policy ver on public.simulacro for select to authenticated using (privado.es_miembro(campana_id));
-- Se crea y se termina solo con las funciones de abajo.

create or replace function privado.es_dia_eleccion(p_campana uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select c.eleccion_fecha = (now() at time zone 'America/Bogota')::date
                   from public.campana c where c.id = p_campana), false)
$$;

create or replace function privado.simulacro_activo(p_campana uuid)
returns uuid language sql stable security definer set search_path = ''
as $$
  select s.id from public.simulacro s
  where s.campana_id = p_campana and s.terminado_en is null and not privado.es_dia_eleccion(p_campana)
$$;

create or replace function privado.marcar_simulacro()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.simulacro := privado.simulacro_activo(new.campana_id) is not null;
  return new;
end;
$$;
create trigger marcar_simulacro before insert on public.incidencia
  for each row execute function privado.marcar_simulacro();
create trigger marcar_simulacro before insert on public.acta_e14
  for each row execute function privado.marcar_simulacro();

-- La llegada del testigo queda con su hora (la marca la novedad de apertura desde el celular).
create or replace function privado.hora_llegada()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.estado = 'en_mesa' and old.estado is distinct from 'en_mesa' then
    new.llegada_en := coalesce(new.llegada_en, now());
  elsif new.estado <> 'en_mesa' then
    new.llegada_en := null;
  end if;
  return new;
end;
$$;
create trigger hora_llegada before update of estado on public.testigo
  for each row execute function privado.hora_llegada();

-- ¿Quién maneja el día E de un puesto? La dirección, o la coordinación si el puesto está en su territorio.
-- Siempre true o false (ver la lección de lectura.sql sobre NULL en funciones security definer).
create or replace function privado.maneja_puesto(p_campana uuid, p_puesto uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(
    privado.es_direccion(p_campana)
    or (privado.rol(p_campana) = 'coordinador' and privado.puesto_en_territorios(p_campana, p_puesto)),
    false)
$$;

create or replace function public.iniciar_simulacro(p_campana uuid)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not coalesce(privado.es_direccion(p_campana), false) then
    raise exception 'Solo la dirección de la campaña inicia un simulacro.' using errcode = '42501';
  end if;
  if privado.es_dia_eleccion(p_campana) then
    raise exception 'Hoy es el día de la elección: no se puede iniciar un simulacro.' using errcode = '22023';
  end if;
  if exists (select 1 from public.simulacro where campana_id = p_campana and terminado_en is null) then
    raise exception 'Ya hay un simulacro en curso.' using errcode = '22023';
  end if;
  insert into public.simulacro (campana_id, iniciado_por) values (p_campana, auth.uid()) returning id into v_id;
  perform privado.auditar(p_campana, 'iniciar_simulacro', 'simulacro', v_id);
  return v_id;
end;
$$;

-- Termina el simulacro y borra lo que se reportó en él. Los testigos que llegaron durante el simulacro vuelven a
-- «confirmado». Las fotos de prueba quedan en el bucket privado hasta la limpieza de evidencias.
create or replace function public.terminar_simulacro(p_campana uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_sim public.simulacro;
  v_novedades integer; v_actas integer; v_testigos integer;
  v_resumen jsonb;
begin
  if not coalesce(privado.es_direccion(p_campana), false) then
    raise exception 'Solo la dirección de la campaña termina un simulacro.' using errcode = '42501';
  end if;
  select * into v_sim from public.simulacro where campana_id = p_campana and terminado_en is null for update;
  if v_sim.id is null then
    raise exception 'No hay un simulacro en curso.' using errcode = '22023';
  end if;
  with b as (delete from public.incidencia where campana_id = p_campana and simulacro returning 1) select count(*) into v_novedades from b;
  with b as (delete from public.acta_e14 where campana_id = p_campana and simulacro returning 1) select count(*) into v_actas from b;
  with b as (
    update public.testigo set estado = 'confirmado'
    where campana_id = p_campana and estado = 'en_mesa' and llegada_en >= v_sim.iniciado_en
    returning 1)
  select count(*) into v_testigos from b;
  v_resumen := jsonb_build_object('novedades', v_novedades, 'actas', v_actas, 'testigos', v_testigos);
  update public.simulacro set terminado_en = now(), terminado_por = auth.uid(), resumen = v_resumen where id = v_sim.id;
  perform privado.auditar(p_campana, 'terminar_simulacro', 'simulacro', v_sim.id, v_resumen);
  return v_resumen;
end;
$$;

-- Novedades: atender, cerrar, reabrir y asignar responsable -----------------------------------------------------

create or replace function public.atender_incidencia(p_id uuid, p_estado text default null, p_responsable uuid default null)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v public.incidencia;
begin
  select * into v from public.incidencia where id = p_id for update;
  if v.id is null or not privado.maneja_puesto(v.campana_id, v.puesto_id) then
    raise exception 'La novedad no existe o no la puede atender.' using errcode = '42501';
  end if;
  if p_estado is not null and p_estado not in ('abierta', 'atendida', 'cerrada') then
    raise exception 'Estado no válido: %.', p_estado using errcode = '22023';
  end if;
  if p_responsable is not null and not exists (
    select 1 from public.membresia m
    where m.usuario_id = p_responsable and m.campana_id = v.campana_id and m.activa
      and m.rol in ('administrador', 'gerente', 'coordinador')) then
    raise exception 'El responsable debe ser de la dirección o la coordinación de la campaña.' using errcode = '22023';
  end if;
  update public.incidencia set
    estado = coalesce(p_estado, estado),
    responsable_id = coalesce(p_responsable, responsable_id),
    atendida_en = case when p_estado in ('atendida', 'cerrada') then now() when p_estado = 'abierta' then null else atendida_en end,
    atendida_por = case when p_estado in ('atendida', 'cerrada') then auth.uid() when p_estado = 'abierta' then null else atendida_por end,
    escalada_en = case when p_estado = 'abierta' then null else escalada_en end
  where id = p_id;
  perform privado.auditar(v.campana_id, 'atender_incidencia', 'incidencia', p_id,
    jsonb_build_object('estado', p_estado, 'responsable', p_responsable));
end;
$$;

-- Escala las novedades abiertas que pasaron su tiempo de espera (alta 15 min, media 45, baja 120: los mismos de
-- nucleo/diaE.ts). Solo toca las de los puestos que quien llama maneja. Devuelve cuántas escaló.
create or replace function public.escalar_incidencias(p_campana uuid)
returns integer language plpgsql volatile security definer set search_path = ''
as $$
declare v_n integer;
begin
  if not coalesce(privado.es_direccion(p_campana) or privado.rol(p_campana) = 'coordinador', false) then
    raise exception 'Solo la dirección o la coordinación escalan novedades.' using errcode = '42501';
  end if;
  with b as (
    update public.incidencia i set estado = 'escalada', escalada_en = now()
    where i.campana_id = p_campana and i.estado = 'abierta' and i.tipo <> 'apertura'
      and now() - i.hora >= make_interval(mins => case i.prioridad when 'alta' then 15 when 'media' then 45 else 120 end)
      and privado.maneja_puesto(p_campana, i.puesto_id)
    returning i.id)
  select count(*) into v_n from b;
  if v_n > 0 then perform privado.auditar(p_campana, 'escalar_incidencias', 'incidencia', null, jsonb_build_object('escaladas', v_n)); end if;
  return v_n;
end;
$$;

-- Revisión del E-14 (regla 7): quien revisa confirma o corrige los números; el acta queda «revisada» con su usuario.
-- p_numeros es el acta corregida ({votos: [...], blancos, nulos, noMarcados, totalVotos, sufragantes}).
create or replace function public.revisar_e14(p_id uuid, p_numeros jsonb, p_alertas integer, p_descartar boolean default false)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v public.acta_e14;
begin
  select * into v from public.acta_e14 where id = p_id for update;
  if v.id is null or not privado.maneja_puesto(v.campana_id, v.puesto_id) then
    raise exception 'El acta no existe o no la puede revisar.' using errcode = '42501';
  end if;
  if v.creado_por = auth.uid() then
    raise exception 'Quien subió el acta no la revisa: la revisa otra persona del centro de mando.' using errcode = '42501';
  end if;
  if v.estado in ('revisada', 'consolidada', 'descartada') then
    raise exception 'El acta ya fue revisada.' using errcode = '22023';
  end if;
  if not coalesce(p_descartar, false) and coalesce(jsonb_typeof(p_numeros -> 'votos'), '') <> 'array' then
    raise exception 'Faltan los números revisados del acta.' using errcode = '22023';
  end if;
  update public.acta_e14 set
    estado = case when coalesce(p_descartar, false) then 'descartada' else 'revisada' end,
    extraccion_json = case when p_descartar then extraccion_json
                           else coalesce(extraccion_json, '{}'::jsonb) || jsonb_build_object('revision', p_numeros) end,
    alertas = greatest(coalesce(p_alertas, 0), 0),
    revisada_por = auth.uid(), revisada_en = now()
  where id = p_id;
  perform privado.auditar(v.campana_id, case when p_descartar then 'descartar_e14' else 'revisar_e14' end, 'acta_e14', p_id,
    jsonb_build_object('alertas', p_alertas));
end;
$$;

-- Tablero del día E: una fila por mesa de los puestos de la circunscripción de la campaña que quien llama maneja.
-- p_simulacro elige si se ven los datos del simulacro o los reales.
create or replace function public.tablero_dia_e(p_campana uuid, p_simulacro boolean default false)
returns table (
  puesto_id uuid, puesto text, mesa integer, mesas_puesto integer, votos_historicos_puesto integer,
  testigo text, llegada_en timestamptz, acta_id uuid, acta text, alertas integer, novedades jsonb
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(privado.es_direccion(p_campana) or privado.rol(p_campana) in ('coordinador', 'candidato'), false) then
    raise exception 'No tiene acceso al tablero del día E de esta campaña.' using errcode = '42501';
  end if;
  return query
  with recursive circ as (
    select t.id from public.territorio t join public.campana c on c.id = p_campana
    where t.campana_id is null and t.codigo_divipole = c.circunscripcion_divipole
    union
    select t.id from public.territorio t join circ on t.padre_id = circ.id where t.campana_id is null
  ),
  puestos as (
    select p.id, p.nombre, p.mesas from public.puesto p
    where p.territorio_id in (select id from circ)
      and coalesce(privado.es_direccion(p_campana) or privado.rol(p_campana) = 'candidato'
           or privado.maneja_puesto(p_campana, p.id), false)
  )
  select p.id, p.nombre, m.n, p.mesas,
    (select coalesce(sum(h.votos), 0)::integer from public.historico_resultado h where h.puesto_id = p.id),
    tg.estado, tg.llegada_en, a.id, a.estado, coalesce(a.alertas, 0),
    coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'tipo', i.tipo, 'prioridad', i.prioridad, 'estado', i.estado,
                'hora', i.hora, 'escalada_en', i.escalada_en, 'responsable_id', i.responsable_id) order by i.hora)
              from public.incidencia i
              where i.campana_id = p_campana and i.puesto_id = p.id and i.mesa = m.n
                and i.simulacro = p_simulacro and i.tipo <> 'apertura'), '[]'::jsonb)
  from puestos p
  cross join lateral generate_series(1, p.mesas) m(n)
  left join lateral (
    select t.estado, t.llegada_en from public.testigo t
    where t.campana_id = p_campana and t.puesto_id = p.id and t.mesa = m.n and t.tipo = 'mesa'
    order by (t.estado = 'retirado'), t.id limit 1) tg on true
  left join lateral (
    select x.id, x.estado, x.alertas from public.acta_e14 x
    where x.campana_id = p_campana and x.puesto_id = p.id and x.mesa = m.n and x.simulacro = p_simulacro
    order by (x.estado = 'descartada'), x.creado_en desc limit 1) a on true
  order by p.nombre, m.n;
end;
$$;

revoke all on function privado.es_dia_eleccion(uuid), privado.simulacro_activo(uuid), privado.maneja_puesto(uuid, uuid)
  from public, anon;
grant execute on function privado.es_dia_eleccion(uuid), privado.simulacro_activo(uuid), privado.maneja_puesto(uuid, uuid)
  to authenticated;
revoke all on function public.iniciar_simulacro(uuid), public.terminar_simulacro(uuid),
  public.atender_incidencia(uuid, text, uuid), public.escalar_incidencias(uuid),
  public.revisar_e14(uuid, jsonb, integer, boolean), public.tablero_dia_e(uuid, boolean) from public, anon;
grant execute on function public.iniciar_simulacro(uuid), public.terminar_simulacro(uuid),
  public.atender_incidencia(uuid, text, uuid), public.escalar_incidencias(uuid),
  public.revisar_e14(uuid, jsonb, integer, boolean), public.tablero_dia_e(uuid, boolean) to authenticated;

-- Tiempo real: el panel escucha cambios de estas tablas. Realtime respeta las políticas RLS de cada tabla.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.incidencia, public.acta_e14, public.testigo, public.simulacro;
  end if;
end;
$$;

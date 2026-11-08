-- IA (fase 4): registro de uso y costo por campaña, y cupo mensual. El uso lo registra solo el servidor (la función
-- «strategos» con la clave de servicio); la dirección de la campaña lo consulta. El cupo es parte del plan contratado
-- (V7): no lo puede cambiar la campaña, solo XYZ Creatia desde el servidor.

create table public.uso_ia (
  id bigint generated always as identity primary key,
  campana_id uuid not null references public.campana (id) on delete cascade,
  usuario_id uuid references public.usuario (id) on delete set null,
  funcion text not null check (funcion in ('strategos', 'lectura_planilla', 'lectura_e14')),
  modelo text not null,
  tokens_entrada integer not null default 0 check (tokens_entrada >= 0),
  tokens_salida integer not null default 0 check (tokens_salida >= 0),
  tokens_cache_lectura integer not null default 0 check (tokens_cache_lectura >= 0),
  costo_usd numeric(12, 6) not null default 0 check (costo_usd >= 0),
  creado_en timestamptz not null default now()
);
create index uso_ia_campana_fecha on public.uso_ia (campana_id, creado_en);

create table public.cupo_ia (
  campana_id uuid primary key references public.campana (id) on delete cascade,
  usd_mes numeric(10, 2) not null check (usd_mes >= 0),
  actualizado_en timestamptz not null default now()
);

alter table public.uso_ia enable row level security;
alter table public.cupo_ia enable row level security;

-- Solo lectura para la dirección. No hay políticas de escritura: escribe el servidor con la clave de servicio.
create policy ver on public.uso_ia for select to authenticated using (privado.es_direccion(campana_id));
create policy ver on public.cupo_ia for select to authenticated using (privado.es_direccion(campana_id));

-- Cupo por defecto mientras no haya uno contratado (decisión de negocio pendiente, V7).
create or replace function privado.cupo_ia_usd(p_campana uuid)
returns numeric language sql stable security definer set search_path = ''
as $$ select coalesce((select c.usd_mes from public.cupo_ia c where c.campana_id = p_campana), 10.00) $$;

-- Gasto del mes calendario en hora de Colombia.
create or replace function privado.gasto_ia_mes(p_campana uuid)
returns numeric language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(u.costo_usd), 0) from public.uso_ia u
  where u.campana_id = p_campana
    and u.creado_en >= (date_trunc('month', now() at time zone 'America/Bogota') at time zone 'America/Bogota')
$$;

-- ¿Puede quien pregunta usar Strategos en esta campaña, y le queda cupo? Strategos está en el Mando, que ven la
-- dirección, la candidatura y la coordinación (cada una con su alcance, que ponen las vistas del tablero).
create or replace function public.estado_strategos(p_campana uuid)
returns table (permitido boolean, gasto_usd numeric, cupo_usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(privado.rol(p_campana) in ('administrador', 'gerente', 'candidato', 'coordinador'), false),
    case when privado.es_direccion(p_campana) then privado.gasto_ia_mes(p_campana) end,
    case when privado.es_direccion(p_campana) then privado.cupo_ia_usd(p_campana) end
$$;

-- Consumo del mes para la dirección (pantalla de uso de la IA).
create or replace function public.consumo_ia_mes(p_campana uuid)
returns table (funcion text, consultas bigint, costo_usd numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.es_direccion(p_campana) then
    raise exception 'Solo la dirección de la campaña ve el consumo de la IA.' using errcode = '42501';
  end if;
  return query
    select u.funcion, count(*), sum(u.costo_usd) from public.uso_ia u
    where u.campana_id = p_campana
      and u.creado_en >= (date_trunc('month', now() at time zone 'America/Bogota') at time zone 'America/Bogota')
    group by u.funcion order by u.funcion;
end;
$$;

-- Para la función «strategos», que mide el cupo con la clave de servicio (la coordinación no ve el gasto).
create or replace function public.gasto_ia_mes_servicio(p_campana uuid)
returns numeric language sql stable security definer set search_path = ''
as $$ select privado.gasto_ia_mes(p_campana) $$;

revoke all on function privado.cupo_ia_usd(uuid), privado.gasto_ia_mes(uuid) from public, anon, authenticated;
revoke all on function public.gasto_ia_mes_servicio(uuid) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.gasto_ia_mes_servicio(uuid) to service_role;
  end if;
end $$;
revoke all on function public.estado_strategos(uuid), public.consumo_ia_mes(uuid) from public, anon;
grant execute on function public.estado_strategos(uuid), public.consumo_ia_mes(uuid) to authenticated;

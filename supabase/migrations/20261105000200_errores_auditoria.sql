-- Fase 8: errores del panel guardados en la propia base (sin servicios externos) y consulta de la auditoría para la
-- dirección. Los errores se limpian de datos personales en el navegador (nucleo/errores.ts) y otra vez aquí.

create table public.error_panel (
  id bigint generated always as identity primary key,
  campana_id uuid references public.campana (id) on delete cascade,
  usuario_id uuid references public.usuario (id) on delete set null,
  en timestamptz not null default now(),
  mensaje text not null,
  pila text,
  ruta text,
  version text,
  navegador text
);
create index on public.error_panel (campana_id, en desc);
create index on public.error_panel (usuario_id, en desc);
alter table public.error_panel enable row level security;
create policy ver on public.error_panel for select to authenticated using (privado.es_direccion(campana_id));

-- Quita correos y números de 6 o más dígitos (celulares, cédulas, NIT), aunque lleven espacios, puntos o guiones.
create or replace function privado.limpiar_texto(p text, p_largo integer)
returns text language sql immutable set search_path = ''
as $$
  select left(regexp_replace(regexp_replace(coalesce(p, ''),
    '[^[:space:]@<>"'']+@[^[:space:]@<>"'']+\.[A-Za-z]{2,}', '‹correo›', 'g'),
    '\+?[0-9](?:[ .()-]?[0-9]){5,}', '‹número›', 'g'), p_largo)
$$;

-- Guarda un error del panel. Nunca falla (un error al registrar un error no debe molestar a nadie) y guarda hasta 30
-- por persona y por hora, para que un error repetido en bucle no llene la base.
create or replace function public.registrar_error(p_campana uuid, p_mensaje text, p_pila text, p_ruta text, p_version text, p_navegador text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return; end if;
  if (select count(*) from public.error_panel where usuario_id = auth.uid() and en > now() - interval '1 hour') >= 30 then return; end if;
  insert into public.error_panel (campana_id, usuario_id, mensaje, pila, ruta, version, navegador)
  values (case when coalesce(privado.es_miembro(p_campana), false) then p_campana end, auth.uid(),
    privado.limpiar_texto(p_mensaje, 500), privado.limpiar_texto(p_pila, 2000), privado.limpiar_texto(split_part(coalesce(p_ruta, ''), '#', 1), 200),
    left(coalesce(p_version, ''), 40), privado.limpiar_texto(p_navegador, 200));
exception when others then
  return;
end;
$$;

-- Errores de la campaña para la dirección, agrupados por mensaje (los últimos 30 días).
create or replace function public.errores_recientes(p_campana uuid)
returns table (mensaje text, veces bigint, personas bigint, ultima timestamptz, ruta text, version text, pila text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(privado.es_direccion(p_campana), false) then
    raise exception 'Solo la dirección ve los errores del panel.' using errcode = '42501';
  end if;
  return query
  select e.mensaje, count(*), count(distinct e.usuario_id), max(e.en),
    (array_agg(e.ruta order by e.en desc))[1], (array_agg(e.version order by e.en desc))[1], (array_agg(e.pila order by e.en desc))[1]
  from public.error_panel e
  where e.campana_id = p_campana and e.en > now() - interval '30 days'
  group by e.mensaje order by max(e.en) desc limit 50;
end;
$$;

-- Lo que la auditoría muestra de una fila: sin teléfono, correo ni cédula (cifrada o en hash).
create or replace function privado.ocultar_contacto(p jsonb)
returns jsonb language sql immutable set search_path = ''
as $$
  select case when p is null or jsonb_typeof(p) <> 'object' then p else
    (p - array['telefono', 'correo', 'documento_cifrado', 'documento_hash', 'cedula', 'documento'])
    || case when p ? 'nuevo' then jsonb_build_object('nuevo', (p -> 'nuevo') - array['telefono', 'correo', 'documento_cifrado', 'documento_hash', 'cedula', 'documento']) else '{}'::jsonb end
    || case when p ? 'anterior' then jsonb_build_object('anterior', (p -> 'anterior') - array['telefono', 'correo', 'documento_cifrado', 'documento_hash', 'cedula', 'documento']) else '{}'::jsonb end
  end
$$;

-- Auditoría de la campaña para la dirección: de la más reciente a la más antigua, por páginas («p_antes»: el id de
-- la última fila de la página anterior), con filtro opcional por acción y por fechas (hora de Bogotá).
create or replace function public.auditoria_campana(
  p_campana uuid, p_accion text default null, p_desde date default null, p_hasta date default null,
  p_antes bigint default null, p_limite integer default 50
)
returns table (id bigint, en timestamptz, usuario text, accion text, entidad text, entidad_id uuid, detalle jsonb)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(privado.es_direccion(p_campana), false) then
    raise exception 'Solo la dirección revisa la auditoría.' using errcode = '42501';
  end if;
  return query
  select a.id, a.en, coalesce(u.nombre, case when a.usuario_id is null then 'Sin sesión (enlace)' else 'Usuario eliminado' end),
    a.accion, a.entidad, a.entidad_id, privado.ocultar_contacto(a.detalle)
  from public.auditoria a left join public.usuario u on u.id = a.usuario_id
  where a.campana_id = p_campana
    and (p_accion is null or a.accion = p_accion)
    and (p_desde is null or (a.en at time zone 'America/Bogota')::date >= p_desde)
    and (p_hasta is null or (a.en at time zone 'America/Bogota')::date <= p_hasta)
    and (p_antes is null or a.id < p_antes)
  order by a.id desc
  limit greatest(1, least(coalesce(p_limite, 50), 200));
end;
$$;

revoke all on function privado.limpiar_texto(text, integer), privado.ocultar_contacto(jsonb) from public, anon, authenticated;
revoke all on function public.registrar_error(uuid, text, text, text, text, text), public.errores_recientes(uuid),
  public.auditoria_campana(uuid, text, date, date, bigint, integer) from public, anon;
grant execute on function public.registrar_error(uuid, text, text, text, text, text), public.errores_recientes(uuid),
  public.auditoria_campana(uuid, text, date, date, bigint, integer) to authenticated;

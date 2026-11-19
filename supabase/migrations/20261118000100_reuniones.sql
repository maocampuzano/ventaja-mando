-- Reuniones y actas (plan de mejora, etapa 4a). La campaña lleva el registro de sus reuniones políticas con líderes,
-- equipo y comunidad, y de cada una queda un acta: resumen, temas que salieron, acuerdos y compromisos. Las actas
-- aprobadas forman la base de conocimiento de la campaña («¿qué pidieron en Solano?»).
--
-- Quién: la dirección y la candidatura ven y registran todas; la coordinación, las de sus zonas. Líder, testigo y
-- operador no ven reuniones.
-- Regla 3: los simpatizantes que asisten se cuentan como número; no se guardan como personas (para eso están las
--          planillas, con su autorización).
-- Regla 4: los compromisos no pueden ofrecer dinero ni beneficios (art. 390 del Código Penal): la base los rechaza.
-- Regla 6: el texto del acta se guarda limpio de teléfonos, correos y números de documento (privado.limpiar_texto).

-- Tablas --------------------------------------------------------------------------------------------------------------
create table public.reunion (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  territorio_id uuid references public.territorio (id),
  titulo text not null check (length(trim(titulo)) between 3 and 160),
  tipo text not null check (tipo in ('lideres', 'comunitaria', 'sectorial', 'equipo', 'otra')),
  fecha timestamptz not null,
  lugar text check (length(lugar) <= 200),
  responsable_id uuid references public.usuario (id),
  estado text not null default 'programada' check (estado in ('programada', 'realizada', 'cancelada')),
  asistentes_comunidad integer not null default 0 check (asistentes_comunidad between 0 and 100000),
  creado_por uuid references public.usuario (id),
  creado_en timestamptz not null default now()
);
create index on public.reunion (campana_id, fecha desc);
create index on public.reunion (territorio_id);

-- Quién del equipo o qué líderes asistieron. Simpatizantes, no: solo su número (regla 3).
create table public.reunion_asistente (
  id uuid primary key default gen_random_uuid(),
  reunion_id uuid not null references public.reunion (id) on delete cascade,
  campana_id uuid not null references public.campana (id) on delete cascade,
  usuario_id uuid references public.usuario (id),
  lider_id uuid references public.lider (id),
  check ((usuario_id is null) <> (lider_id is null))
);
create unique index on public.reunion_asistente (reunion_id, usuario_id) where usuario_id is not null;
create unique index on public.reunion_asistente (reunion_id, lider_id) where lider_id is not null;

create table public.acta (
  id uuid primary key default gen_random_uuid(),
  reunion_id uuid not null unique references public.reunion (id) on delete cascade,
  campana_id uuid not null references public.campana (id) on delete cascade,
  resumen text not null default '',
  temas text[] not null default '{}',
  acuerdos text not null default '',
  estado text not null default 'borrador' check (estado in ('borrador', 'aprobada')),
  origen text not null default 'manual' check (origen in ('manual', 'ia')),
  aprobada_por uuid references public.usuario (id),
  aprobada_en timestamptz,
  actualizada_en timestamptz not null default now(),
  busqueda tsvector
);
create index on public.acta using gin (busqueda);

create table public.acta_compromiso (
  id uuid primary key default gen_random_uuid(),
  acta_id uuid not null references public.acta (id) on delete cascade,
  campana_id uuid not null references public.campana (id) on delete cascade,
  descripcion text not null check (length(trim(descripcion)) between 3 and 500),
  responsable_id uuid references public.usuario (id),
  vence_en date,
  tarea_id uuid references public.tarea (id) on delete set null
);
create index on public.acta_compromiso (acta_id);

create table public.acta_adjunto (
  id uuid primary key default gen_random_uuid(),
  reunion_id uuid not null references public.reunion (id) on delete cascade,
  campana_id uuid not null references public.campana (id) on delete cascade,
  ruta text not null unique,
  tipo text not null check (tipo in ('acta_escrita', 'foto')),
  creado_por uuid references public.usuario (id),
  creado_en timestamptz not null default now()
);

-- Permisos ------------------------------------------------------------------------------------------------------------
-- ¿Puede ver (y registrar) reuniones de ese territorio? Sin territorio, solo la dirección y la candidatura.
create or replace function privado.ve_reunion(p_campana uuid, p_territorio uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(privado.es_direccion(p_campana) or privado.rol(p_campana) = 'candidato'
    or (p_territorio is not null and privado.coordina_territorio(p_campana, p_territorio)), false)
$$;

create or replace function privado.ve_reunion_id(p_reunion uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select privado.ve_reunion(r.campana_id, r.territorio_id) from public.reunion r where r.id = p_reunion), false)
$$;

-- Regla 4: palabras que delatan una oferta de dinero o beneficios en un compromiso.
create or replace function privado.menciona_dinero(p text)
returns boolean language sql immutable set search_path = ''
as $$
  select coalesce(p, '') ~* '(\$|\m(pesos|plata|dinero|efectivo|pago|pagos|pagar|mercado|mercados|bono|bonos|subsidio|regalo|regalos|puesto de trabajo|empleo a cambio)\M)'
$$;

-- Texto que se guarda en el acta: sin teléfonos, correos ni números de documento.
create or replace function privado.texto_acta(p text, p_largo integer)
returns text language sql immutable set search_path = ''
as $$ select trim(privado.limpiar_texto(p, p_largo)) $$;

create or replace function privado.actualizar_busqueda_acta()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.busqueda := to_tsvector('pg_catalog.spanish',
    coalesce(new.resumen, '') || ' ' || coalesce(new.acuerdos, '') || ' ' || array_to_string(new.temas, ' '));
  new.actualizada_en := now();
  return new;
end;
$$;
create trigger busqueda before insert or update on public.acta
  for each row execute function privado.actualizar_busqueda_acta();

alter table public.reunion enable row level security;
alter table public.reunion_asistente enable row level security;
alter table public.acta enable row level security;
alter table public.acta_compromiso enable row level security;
alter table public.acta_adjunto enable row level security;
create policy ver on public.reunion for select to authenticated using (privado.ve_reunion(campana_id, territorio_id));
create policy ver on public.reunion_asistente for select to authenticated using (privado.ve_reunion_id(reunion_id));
create policy ver on public.acta for select to authenticated using (privado.ve_reunion_id(reunion_id));
create policy ver on public.acta_compromiso for select to authenticated
  using (privado.ve_reunion_id((select a.reunion_id from public.acta a where a.id = acta_id)));
create policy ver on public.acta_adjunto for select to authenticated using (privado.ve_reunion_id(reunion_id));
-- Todo se escribe por las funciones de abajo.

create trigger misma_campana before insert or update on public.reunion
  for each row execute function privado.exigir_misma_campana('territorio_id', 'territorio');
create trigger misma_campana before insert or update on public.reunion_asistente
  for each row execute function privado.exigir_misma_campana('reunion_id', 'reunion', 'lider_id', 'lider');
create trigger misma_campana before insert or update on public.acta
  for each row execute function privado.exigir_misma_campana('reunion_id', 'reunion');
create trigger misma_campana before insert or update on public.acta_compromiso
  for each row execute function privado.exigir_misma_campana('acta_id', 'acta', 'tarea_id', 'tarea');
create trigger misma_campana before insert or update on public.acta_adjunto
  for each row execute function privado.exigir_misma_campana('reunion_id', 'reunion');
create trigger auditar after insert or update or delete on public.reunion
  for each row execute function privado.auditar_cambio();
create trigger auditar after update or delete on public.acta
  for each row execute function privado.auditar_cambio();

-- Funciones -----------------------------------------------------------------------------------------------------------

-- Crea (p_id nulo) o actualiza una reunión con sus asistentes del equipo y líderes.
create or replace function public.guardar_reunion(
  p_campana uuid, p_id uuid, p_titulo text, p_tipo text, p_fecha timestamptz, p_lugar text, p_territorio uuid,
  p_estado text, p_asistentes_comunidad integer, p_lideres uuid[] default '{}', p_equipo uuid[] default '{}'
)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare v_id uuid := p_id; v_anterior public.reunion;
begin
  if not privado.ve_reunion(p_campana, p_territorio) then
    raise exception 'No puede registrar reuniones en ese territorio.' using errcode = '42501';
  end if;
  if p_id is not null then
    select * into v_anterior from public.reunion where id = p_id and campana_id = p_campana;
    if v_anterior.id is null or not privado.ve_reunion(p_campana, v_anterior.territorio_id) then
      raise exception 'La reunión no existe o no la puede editar.' using errcode = '42501';
    end if;
    update public.reunion set titulo = trim(p_titulo), tipo = p_tipo, fecha = p_fecha, lugar = nullif(trim(coalesce(p_lugar, '')), ''),
      territorio_id = p_territorio, estado = coalesce(p_estado, estado), asistentes_comunidad = coalesce(p_asistentes_comunidad, 0)
    where id = p_id;
  else
    insert into public.reunion (campana_id, territorio_id, titulo, tipo, fecha, lugar, responsable_id, estado, asistentes_comunidad, creado_por)
    values (p_campana, p_territorio, trim(p_titulo), p_tipo, p_fecha, nullif(trim(coalesce(p_lugar, '')), ''), auth.uid(),
      coalesce(p_estado, 'programada'), coalesce(p_asistentes_comunidad, 0), auth.uid())
    returning id into v_id;
  end if;

  if exists (select 1 from unnest(coalesce(p_equipo, '{}')) u
             where not exists (select 1 from public.membresia m where m.usuario_id = u and m.campana_id = p_campana and m.activa)) then
    raise exception 'Alguien del equipo no pertenece a la campaña.' using errcode = '22023';
  end if;
  delete from public.reunion_asistente where reunion_id = v_id;
  insert into public.reunion_asistente (reunion_id, campana_id, lider_id)
    select v_id, p_campana, l from unnest(coalesce(p_lideres, '{}')) l group by l;
  insert into public.reunion_asistente (reunion_id, campana_id, usuario_id)
    select v_id, p_campana, u from unnest(coalesce(p_equipo, '{}')) u group by u;
  return v_id;
end;
$$;

-- Guarda el acta en borrador, con sus compromisos. p_compromisos: [{descripcion, responsable_id, vence_en}].
create or replace function public.guardar_acta(
  p_reunion uuid, p_resumen text, p_temas text[], p_acuerdos text, p_compromisos jsonb, p_origen text default 'manual'
)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare v_r public.reunion; v_acta uuid; v_c jsonb;
begin
  select * into v_r from public.reunion where id = p_reunion;
  if v_r.id is null or not privado.ve_reunion(v_r.campana_id, v_r.territorio_id) then
    raise exception 'La reunión no existe o no la puede editar.' using errcode = '42501';
  end if;
  if exists (select 1 from public.acta where reunion_id = p_reunion and estado = 'aprobada') then
    raise exception 'El acta ya está aprobada: no se modifica.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_compromisos, '[]')) <> 'array' then
    raise exception 'Los compromisos deben ser una lista.' using errcode = '22023';
  end if;
  for v_c in select * from jsonb_array_elements(coalesce(p_compromisos, '[]')) loop
    if privado.menciona_dinero(v_c ->> 'descripcion') then
      raise exception 'Un compromiso no puede ofrecer dinero, mercados, empleo ni otros beneficios (art. 390 del Código Penal). Revise: «%».',
        left(v_c ->> 'descripcion', 80) using errcode = '22023';
    end if;
    if (v_c ->> 'responsable_id') is not null and not exists (select 1 from public.membresia m
        where m.usuario_id = (v_c ->> 'responsable_id')::uuid and m.campana_id = v_r.campana_id and m.activa) then
      raise exception 'El responsable de un compromiso no pertenece a la campaña.' using errcode = '22023';
    end if;
  end loop;

  insert into public.acta (reunion_id, campana_id, resumen, temas, acuerdos, origen)
  values (p_reunion, v_r.campana_id, privado.texto_acta(p_resumen, 8000),
    coalesce((select array_agg(distinct lower(trim(privado.texto_acta(t, 60)))) from unnest(coalesce(p_temas, '{}')) t where length(trim(t)) > 0), '{}'),
    privado.texto_acta(p_acuerdos, 4000), case when p_origen = 'ia' then 'ia' else 'manual' end)
  on conflict (reunion_id) do update set resumen = excluded.resumen, temas = excluded.temas, acuerdos = excluded.acuerdos,
    origen = case when public.acta.origen = 'ia' then 'ia' else excluded.origen end
  returning id into v_acta;

  delete from public.acta_compromiso where acta_id = v_acta;
  insert into public.acta_compromiso (acta_id, campana_id, descripcion, responsable_id, vence_en)
    select v_acta, v_r.campana_id, privado.texto_acta(c ->> 'descripcion', 500), (c ->> 'responsable_id')::uuid, (c ->> 'vence_en')::date
    from jsonb_array_elements(coalesce(p_compromisos, '[]')) c
    where length(trim(coalesce(c ->> 'descripcion', ''))) >= 3;
  update public.reunion set estado = 'realizada' where id = p_reunion and estado = 'programada';
  return v_acta;
end;
$$;

-- Aprueba el acta: queda en la base de conocimiento y cada compromiso se vuelve una tarea.
create or replace function public.aprobar_acta(p_acta uuid)
returns integer language plpgsql volatile security definer set search_path = ''
as $$
declare v_a public.acta; v_r public.reunion; v_n integer := 0; v_c public.acta_compromiso; v_tarea uuid;
begin
  select * into v_a from public.acta where id = p_acta;
  select * into v_r from public.reunion where id = v_a.reunion_id;
  if v_a.id is null or not privado.ve_reunion(v_r.campana_id, v_r.territorio_id) then
    raise exception 'El acta no existe o no la puede aprobar.' using errcode = '42501';
  end if;
  if v_a.estado = 'aprobada' then return 0; end if;
  if length(trim(v_a.resumen)) < 10 then
    raise exception 'Escriba el resumen de la reunión antes de aprobar el acta.' using errcode = '22023';
  end if;
  for v_c in select * from public.acta_compromiso where acta_id = p_acta loop
    if privado.menciona_dinero(v_c.descripcion) then
      raise exception 'Un compromiso no puede ofrecer dinero ni beneficios (art. 390 del Código Penal).' using errcode = '22023';
    end if;
    insert into public.tarea (campana_id, tipo, titulo, territorio_id, asignado_a, origen, creado_por, vence_en)
    values (v_r.campana_id, 'compromiso', left(v_c.descripcion, 200), v_r.territorio_id, v_c.responsable_id, 'manual', auth.uid(),
      (v_c.vence_en + time '18:00') at time zone 'America/Bogota')
    returning id into v_tarea;
    update public.acta_compromiso set tarea_id = v_tarea where id = v_c.id;
    v_n := v_n + 1;
  end loop;
  update public.acta set estado = 'aprobada', aprobada_por = auth.uid(), aprobada_en = now() where id = p_acta;
  perform privado.auditar(v_r.campana_id, 'aprobar_acta', 'acta', p_acta, jsonb_build_object('compromisos', v_n));
  return v_n;
end;
$$;

-- Registra un adjunto ya subido al bucket «actas» (<campaña>/<reunión>/<archivo>).
create or replace function public.registrar_adjunto_acta(p_reunion uuid, p_ruta text, p_tipo text)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare v_r public.reunion; v_id uuid;
begin
  select * into v_r from public.reunion where id = p_reunion;
  if v_r.id is null or not privado.ve_reunion(v_r.campana_id, v_r.territorio_id) then
    raise exception 'La reunión no existe o no la puede editar.' using errcode = '42501';
  end if;
  if split_part(p_ruta, '/', 1) <> v_r.campana_id::text or split_part(p_ruta, '/', 2) <> p_reunion::text then
    raise exception 'El archivo no está en la carpeta de esta reunión.' using errcode = '22023';
  end if;
  insert into public.acta_adjunto (reunion_id, campana_id, ruta, tipo, creado_por)
  values (p_reunion, v_r.campana_id, p_ruta, p_tipo, auth.uid())
  on conflict (ruta) do update set tipo = excluded.tipo
  returning id into v_id;
  return v_id;
end;
$$;

-- Base de conocimiento: busca en las actas aprobadas que la persona puede ver.
create or replace function public.buscar_actas(
  p_campana uuid, p_texto text default null, p_territorio uuid default null, p_desde date default null, p_hasta date default null
)
returns table (reunion_id uuid, acta_id uuid, titulo text, fecha timestamptz, territorio text, temas text[], extracto text, relevancia real)
language plpgsql stable security definer set search_path = ''
as $$
declare v_q tsquery := case when length(trim(coalesce(p_texto, ''))) > 0 then websearch_to_tsquery('pg_catalog.spanish', p_texto) end;
begin
  if not coalesce(privado.es_miembro(p_campana), false) then
    raise exception 'No tiene acceso a las reuniones de esta campaña.' using errcode = '42501';
  end if;
  return query
  select r.id, a.id, r.titulo, r.fecha, t.nombre, a.temas,
    case when v_q is null then left(a.resumen, 240)
      else ts_headline('pg_catalog.spanish', a.resumen || ' ' || a.acuerdos, v_q, 'StartSel=«, StopSel=», MaxWords=35, MinWords=12') end,
    case when v_q is null then 0::real else ts_rank(a.busqueda, v_q) end
  from public.acta a
  join public.reunion r on r.id = a.reunion_id
  left join public.territorio t on t.id = r.territorio_id
  where a.campana_id = p_campana and a.estado = 'aprobada'
    and privado.ve_reunion(r.campana_id, r.territorio_id)
    and (v_q is null or a.busqueda @@ v_q)
    and (p_territorio is null or r.territorio_id = p_territorio)
    and (p_desde is null or r.fecha >= p_desde)
    and (p_hasta is null or r.fecha < p_hasta + 1)
  order by 8 desc, r.fecha desc
  limit 50;
end;
$$;

-- Agregados por zona para el tablero y el Asesor IA (regla 6): números y temas, sin nombres ni textos.
create or replace function public.resumen_reuniones(p_campana uuid)
returns table (territorio_id uuid, reuniones_30d bigint, actas_aprobadas bigint, actas_por_aprobar bigint,
  compromisos_vencidos bigint, asistentes_comunidad bigint, temas text[])
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(privado.es_miembro(p_campana), false) then
    raise exception 'No tiene acceso a las reuniones de esta campaña.' using errcode = '42501';
  end if;
  return query
  with visibles as (
    select r.* from public.reunion r where r.campana_id = p_campana and privado.ve_reunion(r.campana_id, r.territorio_id)
  )
  select v.territorio_id,
    count(*) filter (where v.fecha > now() - interval '30 days' and v.estado <> 'cancelada'),
    count(a.id) filter (where a.estado = 'aprobada'),
    count(a.id) filter (where a.estado = 'borrador'),
    (select count(*) from public.acta_compromiso c join public.acta a2 on a2.id = c.acta_id join public.tarea ta on ta.id = c.tarea_id
      join visibles v2 on v2.id = a2.reunion_id
      where v2.territorio_id is not distinct from v.territorio_id and ta.estado not in ('hecha', 'cancelada') and ta.vence_en < now()),
    coalesce(sum(v.asistentes_comunidad) filter (where v.estado = 'realizada'), 0),
    (select coalesce(array_agg(x.tema order by x.n desc, x.tema), '{}') from (
      select tm.tema, count(*) n from visibles v3 join public.acta a3 on a3.reunion_id = v3.id and a3.estado = 'aprobada',
        unnest(a3.temas) tm(tema)
      where v3.territorio_id is not distinct from v.territorio_id
      group by tm.tema order by count(*) desc, tm.tema limit 5) x)
  from visibles v left join public.acta a on a.reunion_id = v.id
  group by v.territorio_id;
end;
$$;

-- La IA puede redactar actas (función «lectura», tipo «acta»).
alter table public.uso_ia drop constraint uso_ia_funcion_check;
alter table public.uso_ia add constraint uso_ia_funcion_check
  check (funcion in ('asesor', 'lectura_planilla', 'lectura_e14', 'acta'));

-- Adjuntos en un bucket privado: <campaña>/<reunión>/<archivo>.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Sin Storage en esta base: se omite el bucket de actas.';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('actas', 'actas', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  drop policy if exists actas_ver on storage.objects;
  drop policy if exists actas_subir on storage.objects;
  create policy actas_ver on storage.objects for select to authenticated
    using (bucket_id = 'actas' and privado.ve_reunion_id(nullif(split_part(name, '/', 2), '')::uuid));
  create policy actas_subir on storage.objects for insert to authenticated
    with check (bucket_id = 'actas' and privado.ve_reunion_id(nullif(split_part(name, '/', 2), '')::uuid)
      and split_part(name, '/', 1) = (select r.campana_id::text from public.reunion r where r.id = nullif(split_part(name, '/', 2), '')::uuid));
end $$;

revoke all on function privado.ve_reunion(uuid, uuid), privado.ve_reunion_id(uuid), privado.menciona_dinero(text),
  privado.texto_acta(text, integer), privado.actualizar_busqueda_acta() from public, anon;
grant execute on function privado.ve_reunion(uuid, uuid), privado.ve_reunion_id(uuid) to authenticated;
revoke all on function public.guardar_reunion(uuid, uuid, text, text, timestamptz, text, uuid, text, integer, uuid[], uuid[]),
  public.guardar_acta(uuid, text, text[], text, jsonb, text), public.aprobar_acta(uuid),
  public.registrar_adjunto_acta(uuid, text, text), public.buscar_actas(uuid, text, uuid, date, date),
  public.resumen_reuniones(uuid) from public, anon;
grant execute on function public.guardar_reunion(uuid, uuid, text, text, timestamptz, text, uuid, text, integer, uuid[], uuid[]),
  public.guardar_acta(uuid, text, text[], text, jsonb, text), public.aprobar_acta(uuid),
  public.registrar_adjunto_acta(uuid, text, text), public.buscar_actas(uuid, text, uuid, date, date),
  public.resumen_reuniones(uuid) to authenticated;

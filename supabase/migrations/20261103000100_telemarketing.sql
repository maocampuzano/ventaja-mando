-- Telemarketing (fase 6). La dirección arma colas de llamadas por zona, líder y estado del contacto, con su guion, y
-- asigna operadores. El operador (rol nuevo) no ve la base: pide la siguiente llamada y recibe UNA persona (nombre y
-- celular), registra el resultado y pide la otra.
-- Regla 2: los resultados no registran opinión política ni «apoyo». Regla 3: solo personas con autorización vigente
-- para contacto y sin baja (privado.contactable), verificado al armar la cola y otra vez al entregar cada llamada.

-- Rol nuevo -----------------------------------------------------------------------------------------------------
alter table public.membresia drop constraint membresia_rol_check;
alter table public.membresia add constraint membresia_rol_check
  check (rol in ('administrador', 'gerente', 'candidato', 'coordinador', 'lider', 'testigo', 'operador'));
alter table public.invitacion drop constraint invitacion_rol_check;
alter table public.invitacion add constraint invitacion_rol_check
  check (rol in ('administrador', 'gerente', 'candidato', 'coordinador', 'lider', 'testigo', 'operador'));

alter table public.baja_contacto drop constraint baja_contacto_origen_check;
alter table public.baja_contacto add constraint baja_contacto_origen_check check (origen in ('enlace', 'panel', 'llamada'));

-- Colas -----------------------------------------------------------------------------------------------------------
alter table public.cola_llamadas
  add column segmento jsonb not null default '{}' check (segmento - array['territorio_ids', 'lider_ids', 'estados'] = '{}'::jsonb),
  add column estado text not null default 'activa' check (estado in ('activa', 'pausada', 'cerrada')),
  add column creado_por uuid references public.usuario (id),
  add column creado_en timestamptz not null default now();

create table public.cola_operador (
  cola_id uuid not null references public.cola_llamadas (id) on delete cascade,
  usuario_id uuid not null references public.usuario (id) on delete cascade,
  campana_id uuid not null references public.campana (id) on delete cascade,
  primary key (cola_id, usuario_id)
);

create table public.cola_item (
  id uuid primary key default gen_random_uuid(),
  cola_id uuid not null references public.cola_llamadas (id) on delete cascade,
  campana_id uuid not null references public.campana (id) on delete cascade,
  persona_id uuid not null references public.persona (id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'hecha', 'reintentar', 'descartada')),
  asignado_a uuid references public.usuario (id),
  asignado_en timestamptz,
  intentos integer not null default 0,
  proximo_intento timestamptz,
  ultimo_resultado text,
  unique (cola_id, persona_id)
);
create index on public.cola_item (cola_id, estado, proximo_intento);

alter table public.llamada
  add column item_id uuid references public.cola_item (id) on delete set null,
  add constraint llamada_resultado_check check (resultado in
    ('contesto', 'acepto_actividad', 'volver_a_llamar', 'no_contesto', 'numero_equivocado', 'no_volver_a_llamar'));

alter table public.cola_operador enable row level security;
alter table public.cola_item enable row level security;
create policy ver on public.cola_operador for select to authenticated
  using (privado.es_direccion(campana_id) or usuario_id = auth.uid());
-- Los ítems (personas) solo los ve la dirección; el operador recibe una a la vez por siguiente_llamada.
create policy ver on public.cola_item for select to authenticated using (privado.es_direccion(campana_id));
-- El operador ve las colas que tiene asignadas (nombre y guion), no a quién incluyen.
create policy ver_operador on public.cola_llamadas for select to authenticated
  using (exists (select 1 from public.cola_operador o where o.cola_id = cola_llamadas.id and o.usuario_id = auth.uid()));
-- Las llamadas se registran solo con registrar_llamada.
drop policy crear on public.llamada;

-- Funciones de la dirección ---------------------------------------------------------------------------------------

create or replace function public.crear_cola(p_campana uuid, p_nombre text, p_guion text, p_segmento jsonb)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_id uuid; v_n integer;
begin
  if not coalesce(privado.es_direccion(p_campana), false) then
    raise exception 'Solo la dirección arma colas de llamadas.' using errcode = '42501';
  end if;
  if coalesce(p_segmento, '{}'::jsonb) - array['territorio_ids', 'lider_ids', 'estados'] <> '{}'::jsonb then
    raise exception 'Una cola solo se segmenta por territorio, líder y estado del contacto.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Escriba el nombre de la cola.' using errcode = '22023';
  end if;
  insert into public.cola_llamadas (campana_id, nombre, guion, segmento, creado_por)
  values (p_campana, trim(p_nombre), nullif(trim(p_guion), ''), coalesce(p_segmento, '{}'::jsonb), auth.uid())
  returning id into v_id;
  -- Mismo filtro que los SMS: autorización vigente para contacto, sin baja y con celular.
  insert into public.cola_item (cola_id, campana_id, persona_id)
  select v_id, p_campana, d from privado.destinatarios(p_campana, 'sms', coalesce(p_segmento, '{}'::jsonb)) d;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Nadie del segmento tiene autorización vigente para que lo llamen.' using errcode = '22023';
  end if;
  perform privado.auditar(p_campana, 'crear_cola', 'cola_llamadas', v_id, jsonb_build_object('personas', v_n, 'segmento', p_segmento));
  return jsonb_build_object('id', v_id, 'personas', v_n);
end;
$$;

create or replace function public.asignar_operadores(p_cola uuid, p_usuarios uuid[])
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v_campana uuid;
begin
  select campana_id into v_campana from public.cola_llamadas where id = p_cola;
  if v_campana is null or not coalesce(privado.es_direccion(v_campana), false) then
    raise exception 'La cola no existe o no la puede manejar.' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(p_usuarios, '{}')) u where not exists (
    select 1 from public.membresia m where m.usuario_id = u and m.campana_id = v_campana and m.activa and m.rol = 'operador')) then
    raise exception 'Solo se asignan operadores activos de la campaña.' using errcode = '22023';
  end if;
  delete from public.cola_operador where cola_id = p_cola and usuario_id <> all (coalesce(p_usuarios, '{}'));
  insert into public.cola_operador (cola_id, usuario_id, campana_id)
  select p_cola, u, v_campana from unnest(coalesce(p_usuarios, '{}')) u on conflict do nothing;
  perform privado.auditar(v_campana, 'asignar_operadores', 'cola_llamadas', p_cola, jsonb_build_object('operadores', cardinality(p_usuarios)));
end;
$$;

create or replace function public.cambiar_estado_cola(p_cola uuid, p_estado text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v_campana uuid;
begin
  select campana_id into v_campana from public.cola_llamadas where id = p_cola;
  if v_campana is null or not coalesce(privado.es_direccion(v_campana), false) then
    raise exception 'La cola no existe o no la puede manejar.' using errcode = '42501';
  end if;
  if p_estado not in ('activa', 'pausada', 'cerrada') then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;
  update public.cola_llamadas set estado = p_estado where id = p_cola;
  -- Al pausar o cerrar, lo que estaba en manos de un operador vuelve a quedar pendiente.
  if p_estado <> 'activa' then
    update public.cola_item set estado = 'pendiente', asignado_a = null, asignado_en = null where cola_id = p_cola and estado = 'en_curso';
  end if;
  perform privado.auditar(v_campana, 'cambiar_estado_cola', 'cola_llamadas', p_cola, jsonb_build_object('estado', p_estado));
end;
$$;

-- Avance de una cola, sin personas.
create or replace function public.resumen_cola(p_cola uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_campana uuid;
begin
  select campana_id into v_campana from public.cola_llamadas where id = p_cola;
  if v_campana is null or not coalesce(privado.es_direccion(v_campana) or privado.rol(v_campana) = 'candidato', false) then
    raise exception 'La cola no existe o no la puede ver.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'total', count(*), 'pendientes', count(*) filter (where estado = 'pendiente'),
      'en_curso', count(*) filter (where estado = 'en_curso'), 'hechas', count(*) filter (where estado = 'hecha'),
      'reintentar', count(*) filter (where estado = 'reintentar'), 'descartadas', count(*) filter (where estado = 'descartada'),
      'hoy', (select coalesce(jsonb_object_agg(r, n), '{}'::jsonb) from (
        select l.resultado r, count(*) n from public.llamada l join public.cola_item i on i.id = l.item_id
        where i.cola_id = p_cola and (l.en at time zone 'America/Bogota')::date = (now() at time zone 'America/Bogota')::date
        group by l.resultado) x))
    from public.cola_item where cola_id = p_cola);
end;
$$;

-- Funciones del operador --------------------------------------------------------------------------------------------

-- Lunes a viernes de 8:00 a 19:00 y sábados de 8:00 a 15:00 (hora de Bogotá). Los festivos los controla la pantalla
-- (nucleo/mensajeria.ts); aquí se cierra lo básico para que nadie llame de noche ni en domingo.
create or replace function privado.hora_de_llamar()
returns boolean language sql stable set search_path = ''
as $$
  with b as (select now() at time zone 'America/Bogota' t)
  select case extract(isodow from t)
    when 7 then false
    when 6 then t::time >= '08:00' and t::time < '15:00'
    else t::time >= '08:00' and t::time < '19:00' end
  from b
$$;

-- Entrega la llamada que el operador ya tenía en curso o le asigna la siguiente. Antes de entregarla verifica otra
-- vez que la persona se pueda contactar; si no, la saca de la cola y busca otra.
create or replace function public.siguiente_llamada(p_cola uuid)
returns table (item_id uuid, nombre text, telefono text, intentos integer, guion text)
language plpgsql volatile security definer set search_path = ''
as $$
declare v_cola public.cola_llamadas; v_item public.cola_item;
begin
  select * into v_cola from public.cola_llamadas where id = p_cola;
  if v_cola.id is null or privado.rol(v_cola.campana_id) is distinct from 'operador'
     or not exists (select 1 from public.cola_operador o where o.cola_id = p_cola and o.usuario_id = auth.uid()) then
    raise exception 'La cola no existe o no está asignada a usted.' using errcode = '42501';
  end if;
  if v_cola.estado <> 'activa' then
    raise exception 'Esta cola está %.', case v_cola.estado when 'pausada' then 'pausada' else 'cerrada' end using errcode = '22023';
  end if;
  if not privado.hora_de_llamar() then
    raise exception 'Fuera del horario de llamadas: lunes a viernes de 8:00 a. m. a 7:00 p. m. y sábados de 8:00 a. m. a 3:00 p. m.' using errcode = '22023';
  end if;
  -- Lo que un operador retuvo más de 30 minutos sin registrar vuelve a la cola.
  update public.cola_item set estado = 'pendiente', asignado_a = null, asignado_en = null
  where cola_id = p_cola and estado = 'en_curso' and asignado_en < now() - interval '30 minutes';

  loop
    select * into v_item from public.cola_item
    where cola_id = p_cola and estado = 'en_curso' and asignado_a = auth.uid() limit 1;
    if v_item.id is null then
      select * into v_item from public.cola_item
      where cola_id = p_cola and (estado = 'pendiente' or (estado = 'reintentar' and proximo_intento <= now()))
      order by estado = 'reintentar', proximo_intento nulls first, id
      limit 1 for update skip locked;
      exit when v_item.id is null;
      update public.cola_item set estado = 'en_curso', asignado_a = auth.uid(), asignado_en = now() where id = v_item.id;
    end if;
    exit when privado.contactable(v_item.persona_id, 'sms');
    update public.cola_item set estado = 'descartada', ultimo_resultado = 'sin_autorizacion', asignado_a = null where id = v_item.id;
    v_item := null;
  end loop;

  if v_item.id is null then return; end if;
  return query select v_item.id, p.nombre, p.telefono, v_item.intentos, v_cola.guion
    from public.persona p where p.id = v_item.persona_id;
end;
$$;

create or replace function public.registrar_llamada(p_item uuid, p_resultado text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v public.cola_item;
begin
  select * into v from public.cola_item where id = p_item for update;
  if v.id is null or v.estado <> 'en_curso' or v.asignado_a is distinct from auth.uid() then
    raise exception 'Esta llamada no está en sus manos.' using errcode = '42501';
  end if;
  if p_resultado not in ('contesto', 'acepto_actividad', 'volver_a_llamar', 'no_contesto', 'numero_equivocado', 'no_volver_a_llamar') then
    raise exception 'Resultado no válido.' using errcode = '22023';
  end if;
  insert into public.llamada (cola_id, campana_id, persona_id, resultado, agente_id, item_id)
  values (v.cola_id, v.campana_id, v.persona_id, p_resultado, auth.uid(), v.id);

  update public.cola_item set
    intentos = intentos + 1, ultimo_resultado = p_resultado, asignado_a = null, asignado_en = null,
    estado = case
      when p_resultado in ('contesto', 'acepto_actividad') then 'hecha'
      when p_resultado = 'volver_a_llamar' then 'reintentar'
      when p_resultado = 'no_contesto' and intentos + 1 < 3 then 'reintentar'
      else 'descartada' end,
    proximo_intento = case
      when p_resultado = 'volver_a_llamar' then now() + interval '1 day'
      when p_resultado = 'no_contesto' then now() + interval '2 hours' end
  where id = v.id;

  if p_resultado in ('contesto', 'acepto_actividad') then
    update public.persona set estado_contacto = 'contactado' where id = v.persona_id and estado_contacto = 'sin_contactar';
  elsif p_resultado = 'no_volver_a_llamar' then
    insert into public.baja_contacto (persona_id, campana_id, origen) values (v.persona_id, v.campana_id, 'llamada')
    on conflict (persona_id) do nothing;
    update public.envio_destinatario set estado = 'omitido', error = 'Se dio de baja', procesado_en = now()
    where persona_id = v.persona_id and estado = 'pendiente';
    perform privado.auditar(v.campana_id, 'baja_contacto', 'persona', v.persona_id, '{"origen": "llamada"}');
  end if;
end;
$$;

-- Las colas que el operador tiene asignadas.
create or replace function public.mis_colas(p_campana uuid)
returns table (cola_id uuid, nombre text, estado text, por_llamar bigint)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.nombre, c.estado,
    (select count(*) from public.cola_item i where i.cola_id = c.id
       and (i.estado = 'pendiente' or (i.estado = 'reintentar' and i.proximo_intento <= now())))
  from public.cola_llamadas c join public.cola_operador o on o.cola_id = c.id and o.usuario_id = auth.uid()
  where c.campana_id = p_campana and privado.rol(p_campana) = 'operador'
  order by c.creado_en desc
$$;

revoke all on function privado.hora_de_llamar() from public, anon;
grant execute on function privado.hora_de_llamar() to authenticated;
revoke all on function public.crear_cola(uuid, text, text, jsonb), public.asignar_operadores(uuid, uuid[]),
  public.cambiar_estado_cola(uuid, text), public.resumen_cola(uuid), public.siguiente_llamada(uuid),
  public.registrar_llamada(uuid, text), public.mis_colas(uuid) from public, anon;
grant execute on function public.crear_cola(uuid, text, text, jsonb), public.asignar_operadores(uuid, uuid[]),
  public.cambiar_estado_cola(uuid, text), public.resumen_cola(uuid), public.siguiente_llamada(uuid),
  public.registrar_llamada(uuid, text), public.mis_colas(uuid) to authenticated;

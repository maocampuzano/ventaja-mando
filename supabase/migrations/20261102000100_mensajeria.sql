-- Mensajes masivos por SMS y correo (fase 6). Regla 1: nunca por WhatsApp. Regla 3: solo a personas con autorización
-- vigente para «contacto_campana» y sin baja. La baja se da en un paso (enlace firmado en cada mensaje) y se respeta en
-- todos los canales. La dirección arma el envío, lo aprueba y solo entonces se fijan los destinatarios; al enviar se
-- vuelve a verificar cada persona, por si se dio de baja o revocó entretanto.

-- El correo de la persona (opcional). Lo capturan los formularios y la importación en un PR siguiente.
alter table public.persona
  add column correo text check (correo is null or correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

create table public.baja_contacto (
  persona_id uuid primary key references public.persona (id) on delete cascade,
  campana_id uuid not null references public.campana (id) on delete cascade,
  en timestamptz not null default now(),
  origen text not null check (origen in ('enlace', 'panel'))
);

create table public.envio (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana (id) on delete cascade,
  canal text not null check (canal in ('sms', 'email')),
  nombre text not null check (length(trim(nombre)) > 0),
  asunto text,
  cuerpo text not null check (length(trim(cuerpo)) > 0),
  -- Solo territorio, líder y estado del contacto. Nunca opinión política (regla 2).
  segmento jsonb not null default '{}' check (segmento - array['territorio_ids', 'lider_ids', 'estados'] = '{}'::jsonb),
  estado text not null default 'borrador' check (estado in ('borrador', 'aprobado', 'enviando', 'terminado', 'cancelado')),
  creado_por uuid references public.usuario (id),
  creado_en timestamptz not null default now(),
  aprobado_por uuid references public.usuario (id),
  aprobado_en timestamptz,
  check (canal <> 'email' or length(trim(coalesce(asunto, ''))) > 0),
  check (estado in ('borrador', 'cancelado') or aprobado_por is not null),
  -- Regla 1, también en la base.
  check (cuerpo !~* '(wa\.me|whatsapp)')
);
create index on public.envio (campana_id, creado_en desc);

create table public.envio_destinatario (
  id uuid primary key default gen_random_uuid(),
  envio_id uuid not null references public.envio (id) on delete cascade,
  campana_id uuid not null references public.campana (id) on delete cascade,
  persona_id uuid not null references public.persona (id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'fallido', 'omitido')),
  proveedor_ref text,
  error text,
  procesado_en timestamptz,
  unique (envio_id, persona_id)
);
create index on public.envio_destinatario (envio_id, estado);

alter table public.baja_contacto enable row level security;
alter table public.envio enable row level security;
alter table public.envio_destinatario enable row level security;
-- Se leen con funciones; directo, solo la dirección (y la candidata ve los envíos, no a quién van).
create policy ver on public.envio for select to authenticated
  using (privado.es_direccion(campana_id) or privado.rol(campana_id) = 'candidato');
create policy ver on public.envio_destinatario for select to authenticated using (privado.es_direccion(campana_id));
create policy ver on public.baja_contacto for select to authenticated using (privado.es_direccion(campana_id));

-- ¿Se le puede escribir a esta persona por este canal? Siempre true o false.
create or replace function privado.contactable(p_persona uuid, p_canal text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select (case p_canal when 'sms' then p.telefono is not null when 'email' then p.correo is not null else false end)
      and exists (select 1 from public.autorizacion a where a.persona_id = p.id and a.revocada_en is null
                  and 'contacto_campana' = any (a.finalidades))
      and not exists (select 1 from public.baja_contacto b where b.persona_id = p.id)
    from public.persona p where p.id = p_persona), false)
$$;

-- Personas del segmento a las que se les puede escribir. Solo para la dirección (lo verifican quienes la llaman).
create or replace function privado.destinatarios(p_campana uuid, p_canal text, p_segmento jsonb)
returns setof uuid language sql stable security definer set search_path = ''
as $$
  with recursive zonas as (
    select (jsonb_array_elements_text(p_segmento -> 'territorio_ids'))::uuid id
    union
    select t.id from public.territorio t join zonas z on t.padre_id = z.id
  )
  select p.id from public.persona p
  where p.campana_id = p_campana
    and (not (p_segmento ? 'territorio_ids') or p.territorio_trabajo_id in (select id from zonas))
    and (not (p_segmento ? 'lider_ids') or p.lider_id::text in (select jsonb_array_elements_text(p_segmento -> 'lider_ids')))
    and (not (p_segmento ? 'estados') or p.estado_contacto in (select jsonb_array_elements_text(p_segmento -> 'estados')))
    and privado.contactable(p.id, p_canal)
$$;

create or replace function public.contar_destinatarios(p_campana uuid, p_canal text, p_segmento jsonb)
returns integer language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(privado.es_direccion(p_campana), false) then
    raise exception 'Solo la dirección arma envíos.' using errcode = '42501';
  end if;
  if coalesce(p_segmento, '{}'::jsonb) - array['territorio_ids', 'lider_ids', 'estados'] <> '{}'::jsonb then
    raise exception 'Un envío solo se segmenta por territorio, líder y estado del contacto.' using errcode = '22023';
  end if;
  return (select count(*) from privado.destinatarios(p_campana, p_canal, coalesce(p_segmento, '{}'::jsonb)));
end;
$$;

create or replace function public.crear_envio(p_campana uuid, p_canal text, p_nombre text, p_asunto text, p_cuerpo text, p_segmento jsonb)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not coalesce(privado.es_direccion(p_campana), false) then
    raise exception 'Solo la dirección arma envíos.' using errcode = '42501';
  end if;
  insert into public.envio (campana_id, canal, nombre, asunto, cuerpo, segmento, creado_por)
  values (p_campana, p_canal, trim(p_nombre), nullif(trim(p_asunto), ''), trim(p_cuerpo), coalesce(p_segmento, '{}'::jsonb), auth.uid())
  returning id into v_id;
  perform privado.auditar(p_campana, 'crear_envio', 'envio', v_id, jsonb_build_object('canal', p_canal, 'segmento', p_segmento));
  return v_id;
end;
$$;

-- Aprobar fija los destinatarios en ese momento. Devuelve cuántos son.
create or replace function public.aprobar_envio(p_envio uuid)
returns integer language plpgsql volatile security definer set search_path = ''
as $$
declare v public.envio; v_n integer;
begin
  select * into v from public.envio where id = p_envio for update;
  if v.id is null or not coalesce(privado.es_direccion(v.campana_id), false) then
    raise exception 'El envío no existe o no lo puede aprobar.' using errcode = '42501';
  end if;
  if v.estado <> 'borrador' then
    raise exception 'Solo se aprueba un envío en borrador.' using errcode = '22023';
  end if;
  insert into public.envio_destinatario (envio_id, campana_id, persona_id)
  select v.id, v.campana_id, d from privado.destinatarios(v.campana_id, v.canal, v.segmento) d;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Nadie del segmento tiene autorización vigente para recibir mensajes por este canal.' using errcode = '22023';
  end if;
  update public.envio set estado = 'aprobado', aprobado_por = auth.uid(), aprobado_en = now() where id = v.id;
  perform privado.auditar(v.campana_id, 'aprobar_envio', 'envio', v.id, jsonb_build_object('destinatarios', v_n));
  return v_n;
end;
$$;

create or replace function public.cancelar_envio(p_envio uuid)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v public.envio;
begin
  select * into v from public.envio where id = p_envio for update;
  if v.id is null or not coalesce(privado.es_direccion(v.campana_id), false) then
    raise exception 'El envío no existe o no lo puede cancelar.' using errcode = '42501';
  end if;
  if v.estado not in ('borrador', 'aprobado', 'enviando') then
    raise exception 'Este envío ya terminó.' using errcode = '22023';
  end if;
  update public.envio set estado = 'cancelado' where id = v.id;
  update public.envio_destinatario set estado = 'omitido', error = 'Envío cancelado', procesado_en = now()
  where envio_id = v.id and estado = 'pendiente';
  perform privado.auditar(v.campana_id, 'cancelar_envio', 'envio', v.id);
end;
$$;

-- Resumen del envío, sin personas.
create or replace function public.resumen_envio(p_envio uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v public.envio;
begin
  select * into v from public.envio where id = p_envio;
  if v.id is null or not coalesce(privado.es_direccion(v.campana_id) or privado.rol(v.campana_id) = 'candidato', false) then
    raise exception 'El envío no existe o no lo puede ver.' using errcode = '42501';
  end if;
  return (select jsonb_build_object(
    'total', count(*), 'pendientes', count(*) filter (where estado = 'pendiente'),
    'enviados', count(*) filter (where estado = 'enviado'), 'fallidos', count(*) filter (where estado = 'fallido'),
    'omitidos', count(*) filter (where estado = 'omitido'))
    from public.envio_destinatario where envio_id = p_envio);
end;
$$;

-- Baja --------------------------------------------------------------------------------------------------------
-- El enlace de baja lleva «<id del destinatario>.<firma>». La firma es un HMAC con un secreto de la base: no se
-- guarda ningún token y no se puede inventar uno para dar de baja a otra persona.
create or replace function privado.firma_baja(p_destinatario uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select substr(encode(extensions.hmac('baja:' || p_destinatario::text, privado.secreto('pepper_documento'), 'sha256'), 'hex'), 1, 24)
$$;

create or replace function public.darse_de_baja(p_token text)
returns text language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid; v_firma text; v_d public.envio_destinatario; v_campana text;
begin
  begin
    v_id := split_part(coalesce(p_token, ''), '.', 1)::uuid;
  exception when invalid_text_representation then
    raise exception 'El enlace no es válido.' using errcode = '22023';
  end;
  v_firma := split_part(p_token, '.', 2);
  select * into v_d from public.envio_destinatario where id = v_id;
  if v_d.id is null or v_firma <> privado.firma_baja(v_id) then
    raise exception 'El enlace no es válido.' using errcode = '22023';
  end if;
  insert into public.baja_contacto (persona_id, campana_id, origen) values (v_d.persona_id, v_d.campana_id, 'enlace')
  on conflict (persona_id) do nothing;
  if found then
    insert into public.auditoria (campana_id, usuario_id, accion, entidad, entidad_id, detalle)
    values (v_d.campana_id, null, 'baja_contacto', 'persona', v_d.persona_id, '{"origen": "enlace"}');
  end if;
  update public.envio_destinatario set estado = 'omitido', error = 'Se dio de baja', procesado_en = now()
  where persona_id = v_d.persona_id and estado = 'pendiente';
  select c.nombre into v_campana from public.campana c where c.id = v_d.campana_id;
  return v_campana;
end;
$$;

-- Cuando alguien pide la baja por teléfono o en persona.
create or replace function public.dar_de_baja(p_persona uuid)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v_campana uuid;
begin
  select campana_id into v_campana from public.persona where id = p_persona;
  if v_campana is null or not coalesce(privado.es_direccion(v_campana), false) then
    raise exception 'La persona no existe o no la puede dar de baja.' using errcode = '42501';
  end if;
  insert into public.baja_contacto (persona_id, campana_id, origen) values (p_persona, v_campana, 'panel')
  on conflict (persona_id) do nothing;
  if found then perform privado.auditar(v_campana, 'baja_contacto', 'persona', p_persona, '{"origen": "panel"}'); end if;
  update public.envio_destinatario set estado = 'omitido', error = 'Se dio de baja', procesado_en = now()
  where persona_id = p_persona and estado = 'pendiente';
end;
$$;

-- Envío (solo el servidor) -----------------------------------------------------------------------------------
-- Entrega un lote para enviar: vuelve a verificar a cada persona (si se dio de baja o revocó, queda «omitido») y
-- devuelve el destino y la firma de su enlace de baja. Pasa el envío a «enviando», y a «terminado» cuando no queda nada.
create or replace function public.lote_para_enviar(p_envio uuid, p_limite integer default 100)
returns table (destinatario_id uuid, nombre text, destino text, firma_baja text)
language plpgsql volatile security definer set search_path = ''
as $$
declare v public.envio;
begin
  select * into v from public.envio where id = p_envio for update;
  if v.id is null or v.estado not in ('aprobado', 'enviando') then
    raise exception 'El envío no está aprobado.' using errcode = '22023';
  end if;
  update public.envio_destinatario d set estado = 'omitido', error = 'Ya no tiene autorización vigente o se dio de baja', procesado_en = now()
  where d.envio_id = p_envio and d.estado = 'pendiente' and not privado.contactable(d.persona_id, v.canal);
  update public.envio set estado = case when exists (select 1 from public.envio_destinatario
    where envio_id = p_envio and estado = 'pendiente') then 'enviando' else 'terminado' end where id = p_envio;
  return query
  select d.id, p.nombre, case v.canal when 'sms' then p.telefono else p.correo end, privado.firma_baja(d.id)
  from public.envio_destinatario d join public.persona p on p.id = d.persona_id
  where d.envio_id = p_envio and d.estado = 'pendiente'
  order by d.id limit greatest(1, least(coalesce(p_limite, 100), 500));
end;
$$;

create or replace function public.registrar_resultado_envio(p_destinatario uuid, p_enviado boolean, p_ref text, p_error text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v_envio uuid;
begin
  update public.envio_destinatario
  set estado = case when p_enviado then 'enviado' else 'fallido' end, proveedor_ref = p_ref, error = left(p_error, 300), procesado_en = now()
  where id = p_destinatario and estado = 'pendiente'
  returning envio_id into v_envio;
  if v_envio is not null and not exists (select 1 from public.envio_destinatario where envio_id = v_envio and estado = 'pendiente') then
    update public.envio set estado = 'terminado' where id = v_envio and estado = 'enviando';
  end if;
end;
$$;

revoke all on function privado.contactable(uuid, text), privado.destinatarios(uuid, text, jsonb), privado.firma_baja(uuid)
  from public, anon, authenticated;
revoke all on function public.contar_destinatarios(uuid, text, jsonb), public.crear_envio(uuid, text, text, text, text, jsonb),
  public.aprobar_envio(uuid), public.cancelar_envio(uuid), public.resumen_envio(uuid), public.dar_de_baja(uuid) from public, anon;
grant execute on function public.contar_destinatarios(uuid, text, jsonb), public.crear_envio(uuid, text, text, text, text, jsonb),
  public.aprobar_envio(uuid), public.cancelar_envio(uuid), public.resumen_envio(uuid), public.dar_de_baja(uuid) to authenticated;
-- La baja por enlace la usa cualquiera que reciba el mensaje, sin cuenta.
revoke all on function public.darse_de_baja(text) from public;
grant execute on function public.darse_de_baja(text) to anon, authenticated;
revoke all on function public.lote_para_enviar(uuid, integer), public.registrar_resultado_envio(uuid, boolean, text, text)
  from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.lote_para_enviar(uuid, integer), public.registrar_resultado_envio(uuid, boolean, text, text) to service_role;
  end if;
end $$;

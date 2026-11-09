-- Enlace de baja más corto. Con el id completo del destinatario (36 caracteres) y una firma de 24, el pie de baja
-- hacía que TODO SMS ocupara al menos dos mensajes (el doble de costo). Ahora el enlace lleva un número corto del
-- destinatario y una firma de 12 caracteres hexadecimales (48 bits; adivinarla en línea no es práctico).
alter table public.envio_destinatario add column n bigint generated always as identity;
create unique index envio_destinatario_n on public.envio_destinatario (n);

create or replace function privado.firma_baja_n(p_n bigint)
returns text language sql stable security definer set search_path = ''
as $$
  select substr(encode(extensions.hmac('baja:' || p_n::text, privado.secreto('pepper_documento'), 'sha256'), 'hex'), 1, 12)
$$;
revoke all on function privado.firma_baja_n(bigint) from public, anon, authenticated;

-- La firma anterior (por id) ya no se usa: los envíos todavía no han salido en ningún proyecto.
drop function if exists privado.firma_baja(uuid);

create or replace function public.darse_de_baja(p_token text)
returns text language plpgsql volatile security definer set search_path = ''
as $$
declare v_n bigint; v_d public.envio_destinatario; v_campana text;
begin
  if coalesce(p_token, '') !~ '^[0-9]{1,18}\.[0-9a-f]{12}$' then
    raise exception 'El enlace no es válido.' using errcode = '22023';
  end if;
  v_n := split_part(p_token, '.', 1)::bigint;
  select * into v_d from public.envio_destinatario where n = v_n;
  if v_d.id is null or split_part(p_token, '.', 2) <> privado.firma_baja_n(v_n) then
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

-- El lote devuelve el token de baja ya armado («<n>.<firma>»).
drop function public.lote_para_enviar(uuid, integer);
create function public.lote_para_enviar(p_envio uuid, p_limite integer default 100)
returns table (destinatario_id uuid, nombre text, destino text, token_baja text)
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
  select d.id, p.nombre, case v.canal when 'sms' then p.telefono else p.correo end, d.n::text || '.' || privado.firma_baja_n(d.n)
  from public.envio_destinatario d join public.persona p on p.id = d.persona_id
  where d.envio_id = p_envio and d.estado = 'pendiente'
  order by d.n limit greatest(1, least(coalesce(p_limite, 100), 500));
end;
$$;
revoke all on function public.lote_para_enviar(uuid, integer) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.lote_para_enviar(uuid, integer) to service_role;
  end if;
end $$;

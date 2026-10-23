-- Funciones que usa la aplicación (se llaman por la API de Supabase con «rpc»).
-- Salvo que se diga lo contrario, corren con los permisos de quien llama, así que la RLS aplica.

-- Documento de identidad ------------------------------------------------------------------------

-- Solo dígitos: «1.047.123.218» y «1047123218» son el mismo documento.
create or replace function privado.normaliza_documento(p_documento text)
returns text language sql immutable set search_path = ''
as $$ select nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), '') $$;

create or replace function privado.cifrar_documento(p_documento text)
returns bytea language sql volatile security definer set search_path = ''
as $$
  select extensions.pgp_sym_encrypt(privado.normaliza_documento(p_documento), privado.secreto('clave_documento'))
  where privado.normaliza_documento(p_documento) is not null
$$;

-- HMAC con un secreto aparte: un hash simple de la cédula se podría revertir probando todos los números.
create or replace function privado.hash_documento(p_documento text)
returns text language sql stable security definer set search_path = ''
as $$
  select encode(extensions.hmac(privado.normaliza_documento(p_documento), privado.secreto('pepper_documento'), 'sha256'), 'hex')
  where privado.normaliza_documento(p_documento) is not null
$$;

grant execute on function privado.normaliza_documento(text), privado.cifrar_documento(text), privado.hash_documento(text)
  to authenticated;

-- Solo la dirección ve un documento completo, y cada consulta queda en la auditoría.
create or replace function public.ver_documento(p_persona uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campana uuid;
  v_cifrado bytea;
begin
  select campana_id, documento_cifrado into v_campana, v_cifrado from public.persona where id = p_persona;
  if v_campana is null or not privado.es_direccion(v_campana) then
    raise exception 'No tiene permiso para ver este documento.' using errcode = '42501';
  end if;
  perform privado.auditar(v_campana, 'ver_documento', 'persona', p_persona);
  return extensions.pgp_sym_decrypt(v_cifrado, privado.secreto('clave_documento'));
end;
$$;
revoke all on function public.ver_documento(uuid) from public, anon;
grant execute on function public.ver_documento(uuid) to authenticated;

-- Personas y autorizaciones (regla 3) --------------------------------------------------------------

-- Crea a la persona y su autorización en un solo paso. Si es un líder quien registra y no indica líder,
-- la persona queda a su cargo.
create or replace function public.registrar_persona(
  p_campana uuid,
  p_nombre text,
  p_origen text,
  p_finalidades text[],
  p_canal text,
  p_evidencia_url text,
  p_documento text default null,
  p_telefono text default null,
  p_territorio uuid default null,
  p_lider uuid default null,
  p_relacion text default 'simpatizante',
  p_fila_ocr uuid default null,
  p_puesto uuid default null,
  p_mesa integer default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.persona (
    campana_id, nombre, origen, documento_cifrado, documento_hash, telefono, territorio_trabajo_id,
    lider_id, relacion, fila_ocr_id, puesto_id, mesa, creado_por
  ) values (
    p_campana, trim(p_nombre), p_origen, privado.cifrar_documento(p_documento), privado.hash_documento(p_documento),
    nullif(trim(p_telefono), ''), p_territorio, coalesce(p_lider, privado.lider_actual(p_campana)),
    p_relacion, p_fila_ocr, p_puesto, p_mesa, auth.uid()
  ) returning id into v_id;

  insert into public.autorizacion (persona_id, campana_id, finalidades, canal, evidencia_url, registrado_por)
  values (v_id, p_campana, p_finalidades, p_canal, p_evidencia_url, auth.uid());

  return v_id;
end;
$$;

create or replace function public.revocar_autorizacion(p_autorizacion uuid)
returns void language plpgsql set search_path = ''
as $$
begin
  update public.autorizacion set revocada_en = now() where id = p_autorizacion and revocada_en is null;
  if not found then
    raise exception 'La autorización no existe, no la puede ver o ya estaba revocada.' using errcode = 'P0002';
  end if;
end;
$$;

-- ¿La persona tiene una autorización vigente para esta finalidad? (para colas de contacto y envíos)
create or replace function public.autorizada_para(p_persona uuid, p_finalidad text)
returns boolean language sql stable set search_path = ''
as $$
  select exists (
    select 1 from public.autorizacion a
    where a.persona_id = p_persona and a.revocada_en is null and p_finalidad = any (a.finalidades)
  )
$$;

-- Posibles duplicados (diseño §7.1; misma regla que packages/nucleo/src/duplicados.ts) ----------------

create or replace function privado.normaliza_telefono(p_telefono text)
returns text language sql immutable set search_path = ''
as $$
  select case
    when length(d) = 12 and left(d, 2) = '57' then substr(d, 3)
    else nullif(d, '')
  end
  from (select regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g') as d) x
$$;

create or replace function privado.palabras_nombre(p_nombre text)
returns text[] language sql stable set search_path = ''
as $$
  select coalesce(array_agg(distinct palabra), '{}')
  from unnest(regexp_split_to_array(lower(extensions.unaccent(coalesce(p_nombre, ''))), '\s+')) as palabra
  where palabra <> ''
$$;

-- Es una SUGERENCIA para revisión: solo compara personas que quien llama puede ver.
create or replace function public.posibles_duplicados(p_campana uuid)
returns table (a uuid, b uuid, puntaje numeric, razones text[])
language sql
stable
set search_path = ''
as $$
  with p as (
    select id, documento_hash, privado.normaliza_telefono(telefono) as tel,
           privado.palabras_nombre(nombre) as palabras, territorio_trabajo_id as territorio
    from public.persona
    where campana_id = p_campana
  ),
  claves as (
    select id, 'd:' || documento_hash as clave from p where documento_hash is not null
    union select id, 't:' || tel from p where tel is not null
    union select id, 'n:' || unnest(palabras) from p
  ),
  pares as (
    select distinct x.id as a, y.id as b from claves x join claves y on x.clave = y.clave and x.id < y.id
  ),
  evaluados as (
    select pa.a, pa.b,
      (pa1.documento_hash is not null and pa1.documento_hash = pb.documento_hash) as mismo_doc,
      (pa1.tel is not null and pa1.tel = pb.tel) as mismo_tel,
      (pa1.territorio is not null and pa1.territorio = pb.territorio) as mismo_territorio,
      case when cardinality(pa1.palabras) = 0 or cardinality(pb.palabras) = 0 then 0
        else (select count(*) from unnest(pa1.palabras) w where w = any (pb.palabras))::numeric
             / greatest(cardinality(pa1.palabras), cardinality(pb.palabras))
      end as sim
    from pares pa join p pa1 on pa1.id = pa.a join p pb on pb.id = pa.b
  ),
  puntuados as (
    select a, b,
      (case when mismo_doc then 0.7 else 0 end)
      + (case when mismo_tel then 0.2 else 0 end)
      + (case when sim >= 0.75 then 0.2 * sim else 0 end)
      + (case when mismo_territorio then 0.05 else 0 end) as total,
      array_remove(array[
        case when mismo_doc then 'mismo documento' end,
        case when mismo_tel then 'mismo teléfono' end,
        case when sim >= 0.75 then 'nombre similar (' || round(sim * 100) || ' %)' end,
        case when mismo_territorio then 'mismo territorio' end
      ], null) as razones
    from evaluados
  )
  select a, b, least(1, round(total, 4)) as puntaje, razones
  from puntuados
  where total >= 0.5
  order by puntaje desc, a, b
$$;

-- Fusión de duplicados, con auditoría --------------------------------------------------------------

-- Pasa todo lo de «p_eliminar» a «p_conservar» y borra «p_eliminar». Las autorizaciones no se mueven
-- (son inmutables): se copian a la persona que queda, con su fecha y evidencia originales.
-- Corre con privilegios propios para poder escribir la auditoría; por eso valida ella misma a quien llama.
create or replace function public.fusionar_personas(p_conservar uuid, p_eliminar uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.persona;
  e public.persona;
begin
  select * into c from public.persona where id = p_conservar;
  select * into e from public.persona where id = p_eliminar;
  if c.id is null or e.id is null or c.id = e.id or c.campana_id <> e.campana_id
     or not privado.es_direccion(c.campana_id) then
    raise exception 'No puede fusionar estas personas: deben ser distintas, de la misma campaña, y usted debe ser de su dirección.'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indique el motivo de la fusión.' using errcode = '23514';
  end if;

  update public.persona set
    documento_cifrado = coalesce(c.documento_cifrado, e.documento_cifrado),
    documento_hash = coalesce(c.documento_hash, e.documento_hash),
    telefono = coalesce(c.telefono, e.telefono),
    territorio_trabajo_id = coalesce(c.territorio_trabajo_id, e.territorio_trabajo_id),
    puesto_id = coalesce(c.puesto_id, e.puesto_id),
    mesa = coalesce(c.mesa, e.mesa),
    necesidades = array(select distinct unnest(c.necesidades || e.necesidades))
  where id = c.id;

  insert into public.autorizacion (persona_id, campana_id, finalidades, sensible, canal, evidencia_url, fecha, revocada_en, registrado_por)
  select c.id, campana_id, finalidades, sensible, canal, evidencia_url, fecha, revocada_en, auth.uid()
  from public.autorizacion where persona_id = e.id;

  update public.respuesta set persona_id = c.id where persona_id = e.id;
  update public.llamada set persona_id = c.id where persona_id = e.id;
  update public.mensaje set persona_id = c.id where persona_id = e.id;
  update public.solicitud_ciudadana set persona_id = c.id where persona_id = e.id;
  update public.solicitud_titular set persona_id = c.id where persona_id = e.id;
  update public.finanza_movimiento set aportante_id = c.id where aportante_id = e.id;
  update public.testigo set persona_id = c.id where persona_id = e.id;
  -- La preferencia política de la persona eliminada no se traslada: depende de su propia autorización sensible.

  perform privado.auditar(c.campana_id, 'fusionar', 'persona', c.id,
    jsonb_build_object('eliminada', e.id, 'motivo', p_motivo));
  delete from public.persona where id = e.id;
end;
$$;

-- Invitaciones por rol ------------------------------------------------------------------------------

-- Devuelve el código de invitación una sola vez; en la base solo queda su hash.
create or replace function public.crear_invitacion(
  p_campana uuid, p_correo text, p_rol text, p_territorios uuid[] default '{}', p_dias integer default 7
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_codigo text := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
begin
  insert into public.invitacion (campana_id, correo, rol, territorio_ids, token_hash, expira_en, creado_por)
  values (p_campana, lower(trim(p_correo)), p_rol, p_territorios,
          encode(extensions.digest(v_codigo, 'sha256'), 'hex'), now() + make_interval(days => p_dias), auth.uid());
  return v_codigo;
end;
$$;

-- La acepta el usuario que inició sesión con el mismo correo de la invitación.
create or replace function public.aceptar_invitacion(p_codigo text, p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invitacion;
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesión para aceptar la invitación.' using errcode = '42501';
  end if;
  select * into inv from public.invitacion
  where token_hash = encode(extensions.digest(p_codigo, 'sha256'), 'hex')
  for update;
  if inv.id is null or inv.aceptada_en is not null or inv.expira_en < now() then
    raise exception 'La invitación no existe, ya se usó o venció.' using errcode = 'P0002';
  end if;
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> inv.correo then
    raise exception 'La invitación es para otro correo.' using errcode = '42501';
  end if;

  insert into public.usuario (id, nombre) values (auth.uid(), trim(p_nombre))
  on conflict (id) do nothing;
  insert into public.membresia (usuario_id, campana_id, rol, territorio_ids)
  values (auth.uid(), inv.campana_id, inv.rol, inv.territorio_ids)
  on conflict (usuario_id, campana_id) do update set rol = excluded.rol, territorio_ids = excluded.territorio_ids, activa = true;
  update public.invitacion set aceptada_en = now(), aceptada_por = auth.uid() where id = inv.id;
  return inv.campana_id;
end;
$$;
revoke all on function public.aceptar_invitacion(text, text) from public, anon;
grant execute on function public.aceptar_invitacion(text, text) to authenticated;

-- Nadie anónimo ejecuta funciones de la aplicación.
revoke execute on function
  public.registrar_persona(uuid, text, text, text[], text, text, text, text, uuid, uuid, text, uuid, uuid, integer),
  public.revocar_autorizacion(uuid),
  public.autorizada_para(uuid, text),
  public.posibles_duplicados(uuid),
  public.fusionar_personas(uuid, uuid, text),
  public.crear_invitacion(uuid, text, text, uuid[], integer)
  from public, anon;
grant execute on function
  public.registrar_persona(uuid, text, text, text[], text, text, text, text, uuid, uuid, text, uuid, uuid, integer),
  public.revocar_autorizacion(uuid),
  public.autorizada_para(uuid, text),
  public.posibles_duplicados(uuid),
  public.fusionar_personas(uuid, uuid, text),
  public.crear_invitacion(uuid, text, text, uuid[], integer)
  to authenticated;

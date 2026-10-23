-- Equipo e invitaciones (fase 2).
--
-- 1. Registro solo por invitación. Supabase llama a privado.antes_de_crear_usuario antes de crear cualquier cuenta
--    (hook «before user created», se activa en la configuración de Auth; ver supabase/LEEME.md). Solo deja pasar
--    correos con una invitación vigente. Así el registro puede seguir abierto para que el invitado cree su cuenta,
--    sin que cualquiera pueda crearse una.
-- 2. crear_invitacion valida lo que recibe: zonas de la misma campaña, zonas obligatorias para coordinación y
--    liderazgo, y una vigencia razonable.

create or replace function privado.antes_de_crear_usuario(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_correo text := lower(trim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if v_correo <> '' and exists (
    select 1 from public.invitacion i
    where i.correo = v_correo and i.aceptada_en is null and i.expira_en > now()
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Para crear una cuenta necesita una invitación vigente de su campaña.'));
end;
$$;
revoke all on function privado.antes_de_crear_usuario(jsonb) from public, anon, authenticated;
do $$
begin
  -- En Supabase, Auth corre como supabase_auth_admin. En la base local de pruebas ese rol no existe.
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema privado to supabase_auth_admin;
    grant execute on function privado.antes_de_crear_usuario(jsonb) to supabase_auth_admin;
  end if;
end;
$$;

create or replace function public.crear_invitacion(
  p_campana uuid, p_correo text, p_rol text, p_territorios uuid[] default '{}', p_dias integer default 7
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_codigo text := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  v_correo text := lower(trim(coalesce(p_correo, '')));
begin
  if v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'El correo «%» no es válido.', p_correo using errcode = '22023';
  end if;
  if p_dias is null or p_dias not between 1 and 30 then
    raise exception 'La invitación debe vencer entre 1 y 30 días.' using errcode = '22023';
  end if;
  if p_rol in ('coordinador', 'lider') and coalesce(cardinality(p_territorios), 0) = 0 then
    raise exception 'Indique al menos una zona para el rol %.', p_rol using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_territorios, '{}')) z
    where not exists (select 1 from public.territorio t where t.id = z and t.campana_id = p_campana)
  ) then
    raise exception 'Alguna zona no pertenece a la campaña.' using errcode = '22023';
  end if;

  -- Una invitación vigente por correo y campaña: la nueva reemplaza a la anterior.
  delete from public.invitacion
  where campana_id = p_campana and correo = v_correo and aceptada_en is null;

  insert into public.invitacion (campana_id, correo, rol, territorio_ids, token_hash, expira_en, creado_por)
  values (p_campana, v_correo, p_rol, coalesce(p_territorios, '{}'),
          encode(extensions.digest(v_codigo, 'sha256'), 'hex'), now() + make_interval(days => p_dias), auth.uid());
  return v_codigo;
end;
$$;

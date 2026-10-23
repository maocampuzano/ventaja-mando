-- SOLO PARA PRUEBAS LOCALES: funciones para actuar como un usuario de la semilla.
create schema if not exists pruebas;
grant usage on schema pruebas to authenticated, anon;

-- Id del usuario de la semilla por su clave corta («lider_a1», «gerente_a», ...).
create or replace function pruebas.uid(p_clave text) returns uuid language sql stable security definer as $$
  select id from auth.users where email = p_clave || '@ejemplo.co'
$$;

-- Actúa como ese usuario hasta el siguiente «reset role». aal2 = sesión con dos factores.
create or replace function pruebas.como(p_clave text, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', pruebas.uid(p_clave), 'aal', p_aal, 'email', p_clave || '@ejemplo.co', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function pruebas.como_anonimo() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;

grant execute on all functions in schema pruebas to authenticated, anon;

-- Extensiones y esquemas base.
-- En Supabase las extensiones viven en el esquema «extensions»; aquí se referencian siempre con ese prefijo.

create schema if not exists extensions;
-- Igual que en Supabase: los roles de la API pueden usar las funciones de las extensiones.
grant usage on schema extensions to anon, authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists unaccent with schema extensions;

-- «privado» guarda funciones de apoyo que no se exponen por la API de Supabase (solo se expone «public»).
create schema if not exists privado;
revoke all on schema privado from public;
grant usage on schema privado to authenticated, service_role;

-- Lee un secreto: primero del Vault de Supabase y, si no existe (entorno local), de la variable «app.<nombre>».
-- Solo la usan otras funciones de «privado»; nadie más puede ejecutarla.
create or replace function privado.secreto(nombre text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  valor text;
begin
  if to_regclass('vault.decrypted_secrets') is not null then
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into valor using nombre;
  end if;
  if valor is null then
    valor := nullif(current_setting('app.' || nombre, true), '');
  end if;
  if valor is null then
    raise exception 'Falta el secreto «%». Ver docs/DESARROLLO.md.', nombre;
  end if;
  return valor;
end;
$$;
revoke all on function privado.secreto(text) from public, anon, authenticated;

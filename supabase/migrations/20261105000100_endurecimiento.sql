-- Endurecimiento (fase 8). La seguridad la pone la RLS, pero una sola capa no basta: aquí se quitan permisos que
-- nadie usa, para que un error futuro en una política no deje datos al aire.
--
-- 1. El rol «anon» (quien no ha iniciado sesión) no tiene ningún permiso sobre las tablas. Supabase se los da por
--    defecto y hasta ahora solo los frenaba la RLS. Lo único que anon puede hacer es darse de baja con su enlace.
-- 2. Las funciones del esquema «privado» dejan de ser ejecutables por PUBLIC (y, con ello, por anon). Quien inició
--    sesión conserva exactamente lo que tenía: antes de quitarle el permiso a PUBLIC, se le da de forma explícita a
--    «authenticated» en cada función que ya podía ejecutar.
-- 3. Lo mismo para lo que se cree en el futuro (privilegios por defecto): cada migración da sus permisos a mano.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

do $$
declare f record;
begin
  for f in
    select p.oid, p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'privado'
  loop
    if has_function_privilege('authenticated', f.oid, 'execute') then
      execute format('grant execute on function %s to authenticated', f.firma);
    end if;
    execute format('revoke execute on function %s from public, anon', f.firma);
  end loop;
end $$;
revoke usage on schema privado from anon;
alter default privileges in schema privado revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public, anon;

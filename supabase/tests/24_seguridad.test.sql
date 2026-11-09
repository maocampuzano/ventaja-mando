-- Revisión de seguridad automática (fase 8). Recorre TODA la base, así que una tabla o función nueva que olvide sus
-- protecciones hace fallar la integración continua.
begin;
select plan(11);

select is((select string_agg(c.relname, ', ' order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity), null, 'Todas las tablas tienen RLS');
select is((select string_agg(c.relname, ', ' order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)), null,
  'Todas las tablas tienen al menos una política (sin política nadie la lee, pero tampoco se nota el olvido)');
select is((select string_agg(c.relname, ', ' order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
    -- Las vistas de extensiones (pgTAP en la integración continua) no son de la aplicación.
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
    and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
      or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))), null,
  'Quien no inició sesión no tiene ningún permiso sobre las tablas');
select is((select string_agg(tablename || '.' || policyname, ', ') from pg_policies
  where schemaname = 'public' and not (roles <@ array['authenticated']::name[])), null, 'Ninguna política es para anon ni para PUBLIC');
select is((select string_agg(p.proname, ', ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') and p.proname <> 'darse_de_baja'
    -- Fuera de la revisión: las funciones de extensiones (pgTAP en la integración continua) y las de apoyo de las
    -- pruebas locales (supabase/local/pgtap-minimo.sql), que no existen en el proyecto real.
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and p.proname not in ('_tap', '_tap_sig', 'plan', 'finish', 'ok', 'is', 'lives_ok', 'throws_ok', 'throws_like', 'results_eq')), null,
  'Sin sesión solo se puede usar el enlace de baja');
select is((select string_agg(p.proname, ', ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'privado' and has_function_privilege('anon', p.oid, 'execute')), null, 'Sin sesión no se ejecuta nada interno');
select is((select string_agg(n.nspname || '.' || p.proname, ', ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'privado') and p.prosecdef
    and not coalesce(array_to_string(p.proconfig, ',') like '%search_path=%', false)), null,
  'Toda función con privilegios propios fija su search_path');
select ok(not has_function_privilege('authenticated', 'privado.secreto(text)', 'execute'), 'Nadie con sesión lee los secretos del Vault');
select ok(not has_function_privilege('authenticated', 'privado.auditar(uuid, text, text, uuid, jsonb)', 'execute'), 'Ni escribe la auditoría a mano');
select is((select string_agg(x, ', ') from unnest(array[
    'public.lote_para_enviar(uuid,integer)', 'public.registrar_resultado_envio(uuid,boolean,text,text)',
    'public.guardar_lectura_planilla(uuid,jsonb)', 'public.guardar_lectura_e14(uuid,jsonb,integer)']) x
  where has_function_privilege('authenticated', x::regprocedure, 'execute')), null,
  'Las funciones del servidor no las usa nadie con sesión');
select is((select string_agg(id, ', ') from storage.buckets where public), null, 'Ningún bucket de archivos es público');

select * from finish();
rollback;

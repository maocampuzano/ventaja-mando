-- Estructura: RLS en todas las tablas, nada para anónimos y reglas que dependen del esquema.
begin;
select plan(8);

select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  '{}'::text[],
  'Regla 8: todas las tablas de public tienen RLS activada'
);

select is(
  (select coalesce(array_agg(column_name::text), '{}') from information_schema.columns
   where table_schema = 'public' and table_name = 'solicitud_ciudadana'
     and (column_name ~* '(valor|monto|precio|pesos|costo|cuantia)' or data_type in ('numeric', 'money'))),
  '{}'::text[],
  'Regla 4: la solicitud ciudadana no tiene ningún campo de valor monetario'
);

select is(
  (select coalesce(array_agg(column_name::text), '{}') from information_schema.columns
   where table_schema = 'public' and table_name = 'solicitud_ciudadana'
     and column_name ~* '(preferencia|intencion|voto|compromiso)'),
  '{}'::text[],
  'Regla 4: la solicitud ciudadana no se relaciona con la intención de voto'
);

select is(
  (select coalesce(array_agg(column_name::text), '{}') from information_schema.columns
   where table_schema = 'public' and table_name = 'persona' and column_name ~* '(cedula|^documento$)'),
  '{}'::text[],
  'La persona no tiene la cédula en claro, solo cifrada y como hash'
);

select ok(not has_function_privilege('authenticated', 'privado.secreto(text)', 'execute'),
  'Un usuario no puede leer los secretos de cifrado');

select ok(not has_table_privilege('authenticated', 'public.auditoria', 'insert, update, delete'),
  'Nadie escribe ni borra la auditoría desde la API');

select pruebas.como_anonimo();
select is((select count(*) from public.persona)::int, 0, 'Un anónimo no ve ninguna persona');
select is((select count(*) from public.campana)::int, 0, 'Un anónimo no ve ninguna campaña');
reset role;

select * from finish();
rollback;

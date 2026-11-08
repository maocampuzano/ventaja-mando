-- Subconjunto mínimo de pgTAP para correr las pruebas en PGlite, sin instalar PostgreSQL (supabase/scripts/probar-pglite.mjs).
-- Solo para verificar en un computador: la integración continua corre el pgTAP real (npm run test:db).
create or replace function _tap_sig() returns int language sql as $$
  select coalesce(nullif(current_setting('tap.n', true), ''), '0')::int + 1 $$;
create or replace function _tap(okv boolean, descr text, extra text default null) returns text language plpgsql as $$
declare n int := _tap_sig();
begin
  perform set_config('tap.n', n::text, false);
  if not okv then perform set_config('tap.fallas', (coalesce(nullif(current_setting('tap.fallas', true), ''), '0')::int + 1)::text, false); end if;
  return case when okv then 'ok ' else 'not ok ' end || n || ' - ' || coalesce(descr, '') || case when not okv and extra is not null then E'\n#   ' || extra else '' end;
end $$;
create or replace function plan(n int) returns text language plpgsql as $$
begin perform set_config('tap.n', '0', false); perform set_config('tap.fallas', '0', false); perform set_config('tap.plan', n::text, false); return '1..' || n; end $$;
create or replace function finish() returns setof text language plpgsql as $$
declare n int := coalesce(nullif(current_setting('tap.n', true), ''), '0')::int; p int := current_setting('tap.plan')::int;
begin if n <> p then return next '# PLAN: se esperaban ' || p || ' pruebas y corrieron ' || n; perform set_config('tap.fallas', '999', false); end if; end $$;
create or replace function ok(v boolean, descr text default null) returns text language sql as $$ select _tap(coalesce(v, false), descr) $$;
create or replace function "is"(a anyelement, b anyelement, descr text default null) returns text language sql as $$
  select _tap(a is not distinct from b, descr, 'obtenido: ' || coalesce(a::text, 'NULL') || ' / esperado: ' || coalesce(b::text, 'NULL')) $$;
create or replace function lives_ok(q text, descr text default null) returns text language plpgsql as $$
begin execute q; return _tap(true, descr);
exception when others then return _tap(false, descr, 'error: ' || sqlstate || ' ' || sqlerrm); end $$;
create or replace function throws_ok(q text, a text, b text default null, c text default null) returns text language plpgsql as $$
declare codigo text; msg text; descr text;
begin
  if a ~ '^[0-9A-Z]{5}$' then codigo := a; msg := b; descr := c; else msg := a; descr := b; end if;
  begin execute q;
  exception when others then
    if (codigo is null or sqlstate = codigo) and (msg is null or sqlerrm = msg) then return _tap(true, descr); end if;
    return _tap(false, descr, 'lanzó ' || sqlstate || ': ' || sqlerrm || ' / esperado ' || coalesce(codigo, '*') || ': ' || coalesce(msg, '*'));
  end;
  return _tap(false, descr, 'no lanzó error');
end $$;
create or replace function throws_like(q text, patron text, descr text default null) returns text language plpgsql as $$
begin execute q; return _tap(false, descr, 'no lanzó error');
exception when others then return _tap(sqlerrm like patron, descr, 'lanzó: ' || sqlerrm); end $$;
create or replace function results_eq(q1 text, q2 text, descr text default null) returns text language plpgsql as $$
declare d1 bigint; d2 bigint;
begin
  execute format('select count(*) from ((%s) except all (%s)) x', q1, q2) into d1;
  execute format('select count(*) from ((%s) except all (%s)) x', q2, q1) into d2;
  return _tap(d1 = 0 and d2 = 0, descr, 'diferencias: ' || d1 || ' y ' || d2);
exception when others then return _tap(false, descr, 'error: ' || sqlerrm); end $$;
grant execute on function _tap_sig(), _tap(boolean, text, text), plan(int), finish(), ok(boolean, text), "is"(anyelement, anyelement, text),
  lives_ok(text, text), throws_ok(text, text, text, text), throws_like(text, text, text), results_eq(text, text, text) to public;

import { test } from "node:test";
import assert from "node:assert/strict";
import { HOOK_REGISTRO, SQL_SECRETOS, dividirSentencias, lotes, refDelProyecto, sqlMigracion } from "./aplicar-remoto.mjs";

test("saca el identificador del proyecto aunque la URL traiga /rest/v1", () => {
  assert.equal(refDelProyecto("https://abcdefghijklmnopqrst.supabase.co"), "abcdefghijklmnopqrst");
  assert.equal(refDelProyecto("https://abcdefghijklmnopqrst.supabase.co/rest/v1/"), "abcdefghijklmnopqrst");
  assert.equal(refDelProyecto("cualquier cosa", "otroref"), "otroref");
  assert.throws(() => refDelProyecto("https://ejemplo.com"), /SUPABASE_URL/);
});

test("divide sentencias sin cortar textos, comentarios ni bloques $$", () => {
  const sql = "begin;\ninsert into t values ('a;b''c'); -- nota; con punto y coma\n" +
    "create function f() returns int as $$ select 1; $$ language sql;\ncommit;\n";
  assert.deepEqual(dividirSentencias(sql), [
    "insert into t values ('a;b''c')",
    "create function f() returns int as $$ select 1; $$ language sql",
  ]);
});

test("cada lote es una transacción completa", () => {
  const l = lotes(["select 1", "select 2", "select 3"], 2);
  assert.equal(l.length, 2);
  assert.equal(l[0], "begin;\nselect 1;\nselect 2;\ncommit;");
  assert.equal(l[1], "begin;\nselect 3;\ncommit;");
});

test("la migración queda registrada en la misma transacción, como la CLI de Supabase", () => {
  const sql = sqlMigracion("20261023000200_modelo.sql", "create table x ();");
  assert.match(sql, /^begin;/);
  assert.match(sql, /values \('20261023000200', 'modelo', array\[\]::text\[\]\);\ncommit;$/);
});

test("los secretos se generan dentro de la base y no se crean dos veces", () => {
  assert.match(SQL_SECRETOS, /gen_random_bytes\(32\)/);
  assert.equal((SQL_SECRETOS.match(/where not exists/g) ?? []).length, 2);
  assert.doesNotMatch(SQL_SECRETOS, /seed/);
});

test("el registro por invitación apunta a la función de la migración", () => {
  assert.equal(HOOK_REGISTRO.hook_before_user_created_uri, "pg-functions://postgres/privado/antes_de_crear_usuario");
  assert.equal(HOOK_REGISTRO.hook_before_user_created_enabled, true);
});

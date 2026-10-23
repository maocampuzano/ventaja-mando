#!/usr/bin/env node
// Aplica la base al proyecto real de Supabase por la API de administración (HTTPS), sin conexión directa a
// Postgres: el entorno de nube no permite conexiones al puerto 5432.
//
//   node supabase/scripts/aplicar-remoto.mjs verificar          ¿hay conexión? ¿qué falta?
//   node supabase/scripts/aplicar-remoto.mjs migrar             migraciones pendientes + secretos del Vault
//   node supabase/scripts/aplicar-remoto.mjs cargar archivo.sql salida de cargar-territorios.mjs, por lotes
//
// Necesita SUPABASE_ACCESS_TOKEN (token personal de la cuenta de Supabase) y SUPABASE_URL (o
// SUPABASE_PROJECT_REF). Nunca carga seed.sql: la semilla ficticia es solo para pruebas locales.
// Las migraciones quedan anotadas en supabase_migrations.schema_migrations, la misma tabla que usa la
// CLI de Supabase, para que después «supabase db push» no las repita.
import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CARPETA_MIGRACIONES = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const SECRETOS = ["clave_documento", "pepper_documento"];

/** El identificador del proyecto sale de la URL; tolera que la URL traiga /rest/v1 al final. */
export function refDelProyecto(url, ref) {
  if (ref) return ref.trim();
  const m = /^https:\/\/([a-z0-9]{20})\.supabase\.co(\/.*)?$/.exec(String(url ?? "").trim());
  if (!m) throw new Error("SUPABASE_URL debe ser de la forma https://<proyecto>.supabase.co (o indique SUPABASE_PROJECT_REF).");
  return m[1];
}

/** Separa un archivo SQL en sentencias por «;», sin cortar dentro de textos entre comillas ni de bloques $$. */
export function dividirSentencias(sql) {
  const sentencias = [];
  let actual = "", comilla = false, dolar = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (!comilla && c === "$" && sql[i + 1] === "$") { dolar = !dolar; actual += "$$"; i++; continue; }
    if (!dolar && c === "'") comilla = !comilla; // '' dentro de un texto abre y cierra: queda bien
    if (!comilla && !dolar && c === "-" && sql[i + 1] === "-") { const fin = sql.indexOf("\n", i); i = fin < 0 ? sql.length : fin; actual += "\n"; continue; }
    if (!comilla && !dolar && c === ";") {
      if (actual.trim()) sentencias.push(actual.trim());
      actual = "";
      continue;
    }
    actual += c;
  }
  if (actual.trim()) sentencias.push(actual.trim());
  return sentencias.filter((s) => !/^(begin|commit)$/i.test(s));
}

/** Agrupa sentencias en lotes, cada uno en su propia transacción. */
export function lotes(sentencias, tamano) {
  const r = [];
  for (let i = 0; i < sentencias.length; i += tamano) r.push(`begin;\n${sentencias.slice(i, i + tamano).join(";\n")};\ncommit;`);
  return r;
}

const texto = (v) => `'${String(v).replace(/'/g, "''")}'`;

export function sqlMigracion(archivo, contenido) {
  const version = basename(archivo).split("_")[0];
  const nombre = basename(archivo, ".sql").slice(version.length + 1);
  return `begin;
${contenido}
;
insert into supabase_migrations.schema_migrations (version, name, statements) values (${texto(version)}, ${texto(nombre)}, array[]::text[]);
commit;`;
}

export const SQL_REGISTRO = `create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
select version from supabase_migrations.schema_migrations order by version;`;

// Los valores se generan dentro de la base; nunca pasan por aquí ni quedan en ningún registro.
export const SQL_SECRETOS = SECRETOS.map((n) =>
  `select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), ${texto(n)})
   where not exists (select 1 from vault.secrets where name = ${texto(n)});`).join("\n");

export const SQL_VERIFICAR = `select json_build_object(
  'migraciones', (select coalesce(json_agg(version order by version), '[]') from supabase_migrations.schema_migrations),
  'extensiones', (select json_agg(extname order by extname) from pg_extension where extname in ('pgcrypto', 'postgis', 'unaccent')),
  'secretos', (select coalesce(json_agg(name order by name), '[]') from vault.secrets where name in (${SECRETOS.map(texto).join(", ")})),
  'tablas_public', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'),
  'tablas_sin_rls', (select coalesce(json_agg(c.relname), '[]') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  'politicas', (select count(*) from pg_policies where schemaname = 'public'),
  'authenticated_lee_persona', (select has_table_privilege('authenticated', 'public.persona', 'select') where to_regclass('public.persona') is not null),
  'cifrado_ok', (select privado.normaliza_documento(extensions.pgp_sym_decrypt(privado.cifrar_documento('1.000.000.001'), privado.secreto('clave_documento'))) = '1000000001'
                 where to_regprocedure('privado.cifrar_documento(text)') is not null and (select count(*) from vault.secrets where name in (${SECRETOS.map(texto).join(", ")})) = ${SECRETOS.length}),
  'hmac_ok', (select length(privado.hash_documento('1000000001')) = 64
              where to_regprocedure('privado.hash_documento(text)') is not null and (select count(*) from vault.secrets where name in (${SECRETOS.map(texto).join(", ")})) = ${SECRETOS.length}),
  'personas', (select count(*) from public.persona where to_regclass('public.persona') is not null),
  'campanas', (select count(*) from public.campana where to_regclass('public.campana') is not null),
  'territorios_oficiales', (select count(*) from public.territorio where campana_id is null and to_regclass('public.territorio') is not null),
  'puestos', (select count(*) from public.puesto where to_regclass('public.puesto') is not null),
  'puestos_con_ubicacion', (select count(geom) from public.puesto where to_regclass('public.puesto') is not null)
) as estado;`;

async function consulta(ref, token, query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const cuerpo = await r.text();
  if (!r.ok) {
    if (r.status === 401) throw new Error("Supabase rechazó el token (401). Revise SUPABASE_ACCESS_TOKEN.");
    throw new Error(`Supabase respondió HTTP ${r.status}: ${cuerpo.slice(0, 500)}`);
  }
  return cuerpo ? JSON.parse(cuerpo) : [];
}

async function estado(ref, token) {
  const migraciones = (await consulta(ref, token, SQL_REGISTRO)).map((f) => f.version);
  try {
    return (await consulta(ref, token, SQL_VERIFICAR))[0].estado;
  } catch {
    // Antes de la primera migración las tablas no existen y la verificación completa no aplica.
    return { migraciones, nota: "Las tablas de Ventaja Mando todavía no existen en el proyecto." };
  }
}

async function principal([orden, archivo, ...resto]) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error("Falta SUPABASE_ACCESS_TOKEN (ver supabase/LEEME.md, «Pasar esto a su proyecto de Supabase»).");
    process.exit(1);
  }
  const ref = refDelProyecto(process.env.SUPABASE_URL, process.env.SUPABASE_PROJECT_REF);

  if (orden === "verificar") {
    console.log(JSON.stringify(await estado(ref, token), null, 2));
  } else if (orden === "migrar") {
    const aplicadas = new Set((await consulta(ref, token, SQL_REGISTRO)).map((f) => f.version));
    for (const f of readdirSync(CARPETA_MIGRACIONES).filter((x) => x.endsWith(".sql")).sort()) {
      if (aplicadas.has(f.split("_")[0])) { console.error(`= ${f} (ya estaba)`); continue; }
      console.error(`→ ${f}`);
      await consulta(ref, token, sqlMigracion(f, readFileSync(join(CARPETA_MIGRACIONES, f), "utf8")));
    }
    console.error("→ Secretos del Vault (solo se crean si no existen)");
    await consulta(ref, token, SQL_SECRETOS);
    console.log(JSON.stringify(await estado(ref, token), null, 2));
  } else if (orden === "cargar" && archivo) {
    const i = resto.indexOf("--lote");
    const tamano = i >= 0 ? Number(resto[i + 1]) : 500;
    const partes = lotes(dividirSentencias(readFileSync(archivo, "utf8")), tamano);
    for (let n = 0; n < partes.length; n++) {
      await consulta(ref, token, partes[n]);
      console.error(`  lote ${n + 1} de ${partes.length}`);
    }
    console.log(JSON.stringify(await estado(ref, token), null, 2));
  } else {
    console.error("Uso: aplicar-remoto.mjs <verificar|migrar|cargar archivo.sql [--lote 500]>");
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) principal(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });

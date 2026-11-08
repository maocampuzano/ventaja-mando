// Corre las pruebas de la base en PGlite (Postgres en WASM), sin instalar PostgreSQL. Solo verificación local.
// Uso, desde la raíz: npm run test:db:pglite  (o con un filtro: npm run test:db:pglite -- 13_planillas)
// La integración continua sigue corriendo el pgTAP real sobre PostgreSQL 16 (npm run test:db).
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { postgis } from "@electric-sql/pglite-postgis";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sb = join(repo, "supabase");
const db = await PGlite.create({ extensions: { pgcrypto, unaccent, postgis } });
const correr = async (nombre, sql) => {
  try { return await db.exec(sql); } catch (e) { console.error(`✗ ${nombre}: ${e.message}`); throw e; }
};

await db.exec("select set_config('app.clave_documento', 'clave-solo-para-pruebas-locales', false), set_config('app.pepper_documento', 'pepper-solo-para-pruebas-locales', false)");
await db.exec("alter database template1 set app.clave_documento = 'clave-solo-para-pruebas-locales'").catch(() => {});
await correr("auth-simulado", readFileSync(join(sb, "local/auth-simulado.sql"), "utf8"));
for (const m of readdirSync(join(sb, "migrations")).filter((f) => f.endsWith(".sql")).sort()) {
  await correr(m, readFileSync(join(sb, "migrations", m), "utf8"));
}
await correr("seed", readFileSync(join(sb, "seed.sql"), "utf8"));
await correr("pgtap-minimo", readFileSync(join(sb, "local/pgtap-minimo.sql"), "utf8"));
await correr("pruebas-apoyo", readFileSync(join(sb, "local/pruebas-apoyo.sql"), "utf8"));

let total = 0, fallas = 0;
const solo = process.argv[2];
for (const t of readdirSync(join(sb, "tests")).filter((f) => f.endsWith(".sql") && (!solo || f.includes(solo))).sort()) {
  let lineas = [];
  try {
    const res = await db.exec(readFileSync(join(sb, "tests", t), "utf8"));
    lineas = res.flatMap((r) => r.rows.map((row) => String(Object.values(row)[0] ?? ""))).filter((l) => /^(ok|not ok|1\.\.|#)/.test(l));
  } catch (e) {
    console.log(`✗ ${t}: ERROR ${e.message}`);
    await db.exec("rollback").catch(() => {});
    fallas++; continue;
  }
  const malas = lineas.filter((l) => l.startsWith("not ok") || l.startsWith("#"));
  const buenas = lineas.filter((l) => l.startsWith("ok")).length;
  total += buenas + malas.filter((l) => l.startsWith("not ok")).length;
  fallas += malas.length;
  console.log(`${malas.length ? "✗" : "✓"} ${t}: ${buenas} bien${malas.length ? `, ${malas.length} mal` : ""}`);
  for (const m of malas) console.log("   " + m.replace(/\n/g, "\n   "));
}
console.log(`\n${total} pruebas, ${fallas} con problemas`);
process.exit(fallas ? 1 : 0);

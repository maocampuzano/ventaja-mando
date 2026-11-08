// Prueba de carga del día E (criterio de la fase 5): un simulacro con 100 mesas y 20 usuarios simultáneos.
// 18 testigos reportan apertura, novedades y E-14 desde «el celular» (las mismas funciones de la app), mientras la
// gerencia revisa actas, atiende y escala novedades, y la candidata mira el tablero. Cada usuario usa su propia
// conexión y cada operación va en su transacción, con la identidad del usuario: la RLS actúa como en producción.
//
// Uso, desde la raíz, después de `npm run test:db` (usa la misma base, con la semilla ficticia):
//   npm run test:carga
// Variables: PGHOST, PGPORT, PGUSER, PGPASSWORD (como probar.sh) y BASE_PRUEBAS (por defecto, ventaja_pruebas).
// SOLO para la base local de pruebas: crea una campaña, puestos y usuarios ficticios y los borra al empezar.
import pg from "pg";
import { randomUUID } from "node:crypto";

const MESAS = 100, PUESTOS = 5, TESTIGOS = 18;
const LIMITE_P95_MS = 1500; // tablero del día E
const LIMITE_TOTAL_MS = 120_000;

const conexion = () => new pg.Client({
  host: process.env.PGHOST ?? "localhost", port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? "postgres", password: process.env.PGPASSWORD ?? "postgres",
  database: process.env.BASE_PRUEBAS ?? "ventaja_pruebas",
});
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const errores = [];
const tiempos = [];

/** Una operación como un usuario: su propia transacción con su identidad (pruebas.como). */
async function como(cliente, clave, sql, params = [], aal = "aal1") {
  await cliente.query("begin");
  try {
    await cliente.query("select pruebas.como($1, $2)", [clave, aal]);
    const r = await cliente.query(sql, params);
    await cliente.query("commit");
    return r.rows;
  } catch (e) {
    await cliente.query("rollback").catch(() => {});
    throw e;
  }
}

async function preparar(admin) {
  await admin.query("begin");
  await admin.query("delete from public.campana where nombre = 'Carga Día E (ficticia)'");
  await admin.query("delete from public.puesto where codigo like 'CARGA-%'");
  await admin.query(`delete from auth.users where email like 'carga\\_%@ejemplo.co'`);
  const { rows: [c] } = await admin.query(`
    insert into public.campana (organizacion_id, nombre, cargo, circunscripcion_divipole, eleccion_fecha)
    values ((select id from public.organizacion order by id limit 1), 'Carga Día E (ficticia)', 'Alcaldía de Turbaco', '13836', '2027-10-31')
    returning id`);
  const { rows: puestos } = await admin.query(`
    insert into public.puesto (codigo, nombre, territorio_id, mesas, fuente)
    select 'CARGA-' || n, 'Puesto de carga ' || n,
      (select id from public.territorio where codigo_divipole = '13836' and campana_id is null), $1, 'Prueba de carga'
    from generate_series(1, $2) n returning id`, [MESAS / PUESTOS, PUESTOS]);
  const claves = ["carga_gerente", "carga_candidata", ...Array.from({ length: TESTIGOS }, (_, i) => `carga_testigo_${String(i + 1).padStart(2, "0")}`)];
  for (const clave of claves) {
    const { rows: [u] } = await admin.query("insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id", [`${clave}@ejemplo.co`]);
    await admin.query("insert into public.usuario (id, nombre, mfa_activo) values ($1, $2, $3)", [u.id, clave, clave === "carga_gerente"]);
    const rol = clave === "carga_gerente" ? "gerente" : clave === "carga_candidata" ? "candidato" : "testigo";
    await admin.query("insert into public.membresia (usuario_id, campana_id, rol) values ($1, $2, $3)", [u.id, c.id, rol]);
  }
  // Mesa i → testigo i % 18. Todos confirmados, ninguno en la mesa todavía.
  const mesas = puestos.flatMap((p) => Array.from({ length: MESAS / PUESTOS }, (_, k) => ({ puesto: p.id, mesa: k + 1 })));
  const asignadas = new Map();
  for (const [i, m] of mesas.entries()) {
    const clave = claves[2 + (i % TESTIGOS)];
    await admin.query(`insert into public.testigo (campana_id, usuario_id, puesto_id, mesa, tipo, estado)
      values ($1, (select id from auth.users where email = $2), $3, $4, 'mesa', 'confirmado')`, [c.id, `${clave}@ejemplo.co`, m.puesto, m.mesa]);
    asignadas.set(clave, [...(asignadas.get(clave) ?? []), m]);
  }
  await admin.query("commit");
  return { campana: c.id, asignadas };
}

async function testigo(clave, campana, mesas) {
  const cli = conexion(); await cli.connect();
  const uid = (await cli.query("select pruebas.uid($1) id", [clave])).rows[0].id;
  try {
    for (const m of mesas) {
      try {
        await como(cli, clave, "select public.registrar_novedad_movil($1, $2, $3, $4, 'apertura', 'Mesa instalada', 'baja', null, now())",
          [randomUUID(), campana, m.puesto, m.mesa]);
        if (Math.random() < 0.25) {
          const prioridad = ["alta", "media", "baja"][Math.floor(Math.random() * 3)];
          await como(cli, clave, "select public.registrar_novedad_movil($1, $2, $3, $4, 'Novedad de carga', 'Ficticia', $5, null, now())",
            [randomUUID(), campana, m.puesto, m.mesa, prioridad]);
        }
        const id = randomUUID();
        await como(cli, clave, "select public.registrar_e14_movil($1, $2, $3, $4, $5)",
          [id, campana, m.puesto, m.mesa, `${campana}/${uid}/e14-${id}.jpg`]);
        // Reintento del celular sin señal: no duplica.
        const [r] = await como(cli, clave, "select public.registrar_e14_movil($1, $2, $3, $4, $5) estado",
          [id, campana, m.puesto, m.mesa, `${campana}/${uid}/e14-${id}.jpg`]);
        if (r.estado !== "ya_estaba") errores.push(`${clave}: el reintento del E-14 no fue idempotente`);
      } catch (e) { errores.push(`${clave}, mesa ${m.mesa}: ${e.message}`); }
      await esperar(Math.random() * 30);
    }
  } finally { await cli.end(); }
}

const ACTA = { votos: [{ opcion: "Candidata ficticia", votos: 80 }], blancos: 2, nulos: 1, noMarcados: 0, totalVotos: 83, sufragantes: 90 };

async function tablero(cli, clave, campana, aal) {
  const t0 = performance.now();
  const filas = await como(cli, clave, "select * from public.tablero_dia_e($1, true)", [campana], aal);
  tiempos.push(performance.now() - t0);
  return filas;
}

async function gerencia(campana, hasta) {
  const cli = conexion(); await cli.connect();
  try {
    while (Date.now() < hasta) {
      try {
        const filas = await tablero(cli, "carga_gerente", campana, "aal2");
        await como(cli, "carga_gerente", "select public.escalar_incidencias($1)", [campana], "aal2");
        for (const f of filas.filter((x) => x.acta === "recibida")) {
          await como(cli, "carga_gerente", "select public.revisar_e14($1, $2, 0)", [f.acta_id, ACTA], "aal2");
        }
        for (const n of filas.flatMap((x) => x.novedades).filter((x) => x.estado === "abierta" || x.estado === "escalada")) {
          await como(cli, "carga_gerente", "select public.atender_incidencia($1, 'atendida')", [n.id], "aal2");
        }
        if (filas.length === MESAS && filas.every((x) => x.acta === "revisada" && x.testigo === "en_mesa")) return;
      } catch (e) { errores.push(`gerencia: ${e.message}`); }
      await esperar(50);
    }
    errores.push("La gerencia no alcanzó a revisar todas las actas a tiempo.");
  } finally { await cli.end(); }
}

async function candidata(campana, listo) {
  const cli = conexion(); await cli.connect();
  try {
    while (!listo()) {
      try {
        const filas = await tablero(cli, "carga_candidata", campana);
        if (filas.length !== MESAS) errores.push(`La candidata vio ${filas.length} mesas y no ${MESAS}.`);
      } catch (e) { errores.push(`candidata: ${e.message}`); }
      await esperar(100);
    }
  } finally { await cli.end(); }
}

const percentil = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];

async function principal() {
  const admin = conexion(); await admin.connect();
  const inicio = Date.now();
  try {
    const { campana, asignadas } = await preparar(admin);
    await como(admin, "carga_gerente", "select public.iniciar_simulacro($1)", [campana], "aal2");
    console.log(`→ Simulacro con ${MESAS} mesas en ${PUESTOS} puestos y ${TESTIGOS + 2} usuarios simultáneos`);

    let listo = false;
    const g = gerencia(campana, inicio + LIMITE_TOTAL_MS).finally(() => { listo = true; });
    await Promise.all([
      ...[...asignadas].map(([clave, mesas]) => testigo(clave, campana, mesas)),
      candidata(campana, () => listo),
      g,
    ]);

    // Comprobaciones finales, con la vista de quien administra la base.
    const { rows: [c] } = await admin.query(`select
      (select count(*) from public.acta_e14 where campana_id = $1 and simulacro and estado = 'revisada')::int actas,
      (select count(*) from public.acta_e14 where campana_id = $1 and not simulacro)::int actas_reales,
      (select count(*) from public.testigo where campana_id = $1 and estado = 'en_mesa')::int en_mesa,
      (select count(*) from public.incidencia where campana_id = $1 and estado in ('abierta', 'escalada') and tipo <> 'apertura')::int pendientes`, [campana]);
    if (c.actas !== MESAS) errores.push(`Quedaron ${c.actas} actas revisadas y no ${MESAS}.`);
    if (c.actas_reales !== 0) errores.push(`${c.actas_reales} actas del simulacro quedaron como reales.`);
    if (c.en_mesa !== MESAS) errores.push(`${c.en_mesa} testigos en la mesa y no ${MESAS}.`);
    if (c.pendientes !== 0) errores.push(`Quedaron ${c.pendientes} novedades sin atender.`);

    const [resumen] = await como(admin, "carga_gerente", "select public.terminar_simulacro($1) r", [campana], "aal2");
    if (resumen.r.actas !== MESAS || resumen.r.testigos !== MESAS) errores.push(`Al terminar: ${JSON.stringify(resumen.r)}`);
    const { rows: [quedan] } = await admin.query(
      "select (select count(*) from public.acta_e14 where campana_id = $1)::int + (select count(*) from public.incidencia where campana_id = $1)::int n", [campana]);
    if (quedan.n !== 0) errores.push(`Al terminar el simulacro quedaron ${quedan.n} registros de prueba.`);

    const p50 = percentil(tiempos, 50), p95 = percentil(tiempos, 95);
    console.log(`  ${tiempos.length} lecturas del tablero: mediana ${p50.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms`);
    console.log(`  ${resumen.r.novedades} novedades y ${resumen.r.actas} actas, todas revisadas; ${((Date.now() - inicio) / 1000).toFixed(1)} s en total`);
    if (p95 > LIMITE_P95_MS) errores.push(`El tablero tardó ${p95.toFixed(0)} ms en el p95 (límite: ${LIMITE_P95_MS} ms).`);
  } finally { await admin.end(); }

  if (errores.length) {
    console.error(`✗ ${errores.length} errores:\n  ` + [...new Set(errores)].slice(0, 20).join("\n  "));
    process.exit(1);
  }
  console.log("✓ Prueba de carga del día E sin errores");
}

principal().catch((e) => { console.error(e); process.exit(1); });

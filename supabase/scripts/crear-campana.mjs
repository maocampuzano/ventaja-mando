#!/usr/bin/env node
// Crea una campaña nueva en el proyecto de Supabase, después de una venta. Las campañas no se registran solas: las
// crea XYZ Creatia (decisión de Mauricio del 12/11/2026). Ver docs/CREAR-CAMPANA.md.
//
//   node --env-file=.env supabase/scripts/crear-campana.mjs \
//     --nombre "Nombre de la candidatura" --cargo "Gobernación del Caquetá" --dane 18 \
//     --eleccion 31/10/2027 --meta 74000 --gerente correo@campana.co [--tope 450000000] [--organizacion "Partido"]
//
// Usa SUPABASE_URL y SUPABASE_SECRET_KEY (la clave de servicio: nunca sale de este computador). Devuelve el enlace
// de la invitación del gerente, que vence en 14 días, y un texto listo para enviárselo desde su propio WhatsApp.
import { pathToFileURL } from "node:url";

const AYUDA = `Uso: node --env-file=.env supabase/scripts/crear-campana.mjs --nombre "…" --cargo "…" --dane 18 --eleccion 31/10/2027 --meta 74000 --gerente correo@campana.co [--tope 450000000] [--organizacion "…"]`;

/** Lee los argumentos --clave valor. Fecha en dd/mm/aaaa; números con o sin puntos de miles. */
export function leerArgumentos(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z]+)$/.exec(argv[i]);
    if (!m) throw new Error(`No entiendo «${argv[i]}».\n${AYUDA}`);
    if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) throw new Error(`Falta el valor de --${m[1]}.`);
    a[m[1]] = argv[++i];
  }
  for (const k of ["nombre", "cargo", "dane", "eleccion", "meta", "gerente"]) {
    if (!a[k]) throw new Error(`Falta --${k}.\n${AYUDA}`);
  }
  const f = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(a.eleccion.trim());
  if (!f) throw new Error("La fecha de la elección va en dd/mm/aaaa, por ejemplo 31/10/2027.");
  const numero = (t) => Number(String(t).replace(/[.\s$]/g, ""));
  const meta = numero(a.meta), tope = a.tope ? numero(a.tope) : null;
  if (!Number.isInteger(meta) || meta <= 0) throw new Error("La meta de votos debe ser un número entero mayor que cero.");
  if (tope !== null && !(tope > 0)) throw new Error("El tope de gastos debe ser un número mayor que cero.");
  return {
    p_nombre: a.nombre.trim(), p_cargo: a.cargo.trim(), p_divipole: a.dane.trim(),
    p_eleccion: `${f[3]}-${f[2].padStart(2, "0")}-${f[1].padStart(2, "0")}`, p_meta: meta,
    p_correo_gerente: a.gerente.trim(), p_organizacion: a.organizacion?.trim() || null, p_tope: tope,
  };
}

export const enlaceInvitacion = (panel, codigo) => `${panel.replace(/\/$/, "")}/?invitacion=${encodeURIComponent(codigo)}`;

async function principal() {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/$/, "");
  const clave = process.env.SUPABASE_SECRET_KEY;
  if (!url || !clave) throw new Error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en el archivo .env.");
  const datos = leerArgumentos(process.argv.slice(2));
  const r = await fetch(`${url}/rest/v1/rpc/crear_campana`, {
    method: "POST",
    headers: { apikey: clave, Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });
  const cuerpo = await r.json().catch(() => null);
  if (!r.ok) throw new Error(cuerpo?.message ?? `La base respondió ${r.status}.`);
  const [fila] = cuerpo;
  const enlace = enlaceInvitacion(process.env.PANEL_URL || "https://ventaja-mando-prueba.pages.dev", fila.codigo_invitacion);
  console.log(`\nCampaña creada: ${datos.p_nombre}, ${datos.p_cargo}.`);
  console.log(`Zonas de trabajo: ${fila.zonas}.`);
  console.log(`\nEnlace para el gerente (vence en 14 días, solo sirve con ${datos.p_correo_gerente}):\n${enlace}`);
  console.log(`\nTexto para enviárselo desde su WhatsApp:\nHola. Ya está lista la campaña de ${datos.p_nombre} en Comando. Entre con este enlace y cree su cuenta con el correo ${datos.p_correo_gerente}: ${enlace}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((e) => { console.error(`\nNo se creó la campaña: ${e.message}`); process.exit(1); });
}

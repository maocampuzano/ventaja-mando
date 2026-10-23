#!/usr/bin/env node
// Descarga de www.datos.gov.co los municipios oficiales (DANE, DIVIPOLA) y los puestos de votación
// (Registraduría, Divipole de las elecciones territoriales de 2023) y los deja en el formato que espera
// cargar-territorios.mjs, junto con un informe de lo que no cuadró.
//
//   node supabase/scripts/preparar-datos-abiertos.mjs carpeta-de-salida
//
// Por qué hace falta: el catálogo de puestos de la Registraduría trae el nombre del municipio, pero no su
// código DIVIPOLA, ni el código del puesto, ni el número de mesas. El municipio se cruza por nombre con el
// DANE (y, si hay varios candidatos, por cercanía a la cabecera); el código del puesto se genera estable a
// partir de sus datos, para que recargar el mismo archivo actualice en vez de duplicar. Las mesas quedan en 0
// (sin dato) hasta que la Registraduría publique la Divipole de 2027.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const FUENTES = {
  municipios: { id: "gdxc-w37w", fuente: "DANE, DIVIPOLA - Códigos municipios (datos.gov.co gdxc-w37w)" },
  puestos: { id: "mv2e-prx5", fuente: "Registraduría, Divipole territoriales 2023 con georreferenciación (datos.gov.co mv2e-prx5)" },
};

// Nombres de departamento que la Registraduría abrevia.
const DEPARTAMENTOS = {
  "NORTE DE SAN": "NORTE DE SANTANDER",
  VALLE: "VALLE DEL CAUCA",
  "SAN ANDRES": "ARCHIPIELAGO DE SAN ANDRES PROVIDENCIA Y SANTA CATALINA",
};
// Municipios que ni el nombre ni las palabras permiten cruzar. Revisados a mano contra el mapa del DANE.
const MUNICIPIOS = {
  "BOLIVAR|MOMPOS": "13468", // Santa Cruz de Mompox
  "VAUPES|MORICHAL PAPUNAGUA": "97777", // Papunahua (área no municipalizada)
};
const SIN_PESO = new Set(["DE", "DEL", "LA", "LAS", "LOS", "EL", "Y"]);
const DISTANCIA_MAXIMA_KM = 80;

export const normalizar = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const palabras = (s) => normalizar(s).split(" ").filter((p) => p && !SIN_PESO.has(p)).map((p) => (p === "PTO" ? "PUERTO" : p));
export const numero = (v) => {
  const n = Number(String(v ?? "").trim().replace(",", "."));
  return String(v ?? "").trim() !== "" && Number.isFinite(n) ? n : null;
};
export const enColombia = (lat, lon) => lat !== null && lon !== null && lat > -4.3 && lat < 13.6 && lon > -82 && lon < -66.8;

function km(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const x = (lon2 - lon1) * r * Math.cos(((lat1 + lat2) / 2) * r), y = (lat2 - lat1) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}
const mediana = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null;
};

/**
 * Busca el municipio del DANE que corresponde a un municipio de la Registraduría.
 * `dane`: filas con cod_dpto, dpto, cod_mpio, nom_mpio, latitud, longitud. `puntos`: [lat, lon] de sus puestos.
 * Devuelve { codigo, nombre, metodo, km } o null si no hay un candidato confiable.
 */
export function cruzarMunicipio(dane, departamento, municipio, puntos = []) {
  const dpto = DEPARTAMENTOS[normalizar(departamento)] ?? normalizar(departamento);
  const mpio = normalizar(municipio);
  const delDpto = dane.filter((d) => normalizar(d.dpto) === dpto);
  const validos = puntos.filter(([a, o]) => enColombia(a, o));
  const centro = validos.length ? [mediana(validos.map((p) => p[0])), mediana(validos.map((p) => p[1]))] : null;
  const distancia = (d) => {
    const lat = numero(d.latitud), lon = numero(d.longitud);
    return centro && lat !== null && lon !== null ? km(centro[0], centro[1], lat, lon) : null;
  };
  const resultado = (d, metodo) => ({ codigo: d.cod_mpio.padStart(5, "0"), nombre: d.nom_mpio, metodo, km: distancia(d) });

  const exacto = delDpto.find((d) => normalizar(d.nom_mpio) === mpio);
  if (exacto) return resultado(exacto, "nombre exacto");
  const alias = MUNICIPIOS[`${dpto}|${mpio}`];
  if (alias) {
    const d = delDpto.find((x) => x.cod_mpio.padStart(5, "0") === alias);
    if (d) return resultado(d, "alias revisado");
  }
  const compacto = delDpto.find((d) => normalizar(d.nom_mpio).replace(/ /g, "") === mpio.replace(/ /g, ""));
  if (compacto) return resultado(compacto, "nombre sin espacios");

  const p = palabras(municipio);
  let candidatos = delDpto.filter((d) => {
    const q = palabras(d.nom_mpio);
    return q.every((w) => p.includes(w)) || p.every((w) => q.includes(w));
  });
  if (!candidatos.length) candidatos = delDpto.filter((d) => palabras(d.nom_mpio)[0] === p[0]);
  if (!candidatos.length) return null;
  const ordenados = candidatos.map((d) => ({ d, km: distancia(d) })).sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
  // Con un solo candidato basta el nombre; con varios, decide la cercanía y tiene que ser clara.
  if (ordenados.length > 1 && (ordenados[0].km === null || ordenados[0].km > DISTANCIA_MAXIMA_KM)) return null;
  if (ordenados[0].km !== null && ordenados[0].km > DISTANCIA_MAXIMA_KM) return null;
  return resultado(ordenados[0].d, ordenados.length > 1 ? "palabras y cercanía" : "palabras");
}

/** Código estable del puesto: no existe en el archivo de la Registraduría, se deriva de sus datos. */
export function codigoPuesto(codMunicipio, p) {
  const llave = [p.departamento, p.municipio, p.comuna, p.puesto, p.direccion].map(normalizar).join("|");
  return `RNEC23-${codMunicipio}-${createHash("sha1").update(llave).digest("hex").slice(0, 8)}`;
}

const csv = (filas) => filas.map((f) => f.map((v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(",")).join("\n") + "\n";

/** Une las dos fuentes. Devuelve los CSV y el informe; no toca la red. */
export function preparar(dane, rnec) {
  const municipios = [["cod_dpto", "dpto", "cod_mpio", "mpio"],
    ...dane.map((d) => [d.cod_dpto.padStart(2, "0"), d.dpto, d.cod_mpio.padStart(5, "0"), d.nom_mpio])];

  const grupos = new Map();
  for (const r of rnec) {
    const k = `${r.departamento}|${r.municipio}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(r);
  }
  const puestos = [["codigo", "nombre", "cod_mpio", "mesas", "latitud", "longitud"]];
  const cruces = [], sinCruce = [], sinUbicacion = [], codigos = new Set();
  for (const [k, filas] of grupos) {
    const [dpto, mpio] = k.split("|");
    const m = cruzarMunicipio(dane, dpto, mpio, filas.map((f) => [numero(f.latitud), numero(f.longitud)]));
    if (!m) { sinCruce.push({ dpto, mpio, puestos: filas.length }); continue; }
    if (m.metodo !== "nombre exacto") cruces.push({ dpto, mpio, ...m, puestos: filas.length });
    for (const f of filas) {
      const lat = numero(f.latitud), lon = numero(f.longitud);
      const ok = enColombia(lat, lon);
      if (!ok) sinUbicacion.push({ dpto, mpio, puesto: f.puesto, latitud: f.latitud, longitud: f.longitud });
      let codigo = codigoPuesto(m.codigo, f);
      while (codigos.has(codigo)) codigo += "b"; // filas idénticas en la fuente: se conservan las dos
      codigos.add(codigo);
      puestos.push([codigo, f.puesto, m.codigo, "", ok ? lat : "", ok ? lon : ""]);
    }
  }
  return { municipiosCsv: csv(municipios), puestosCsv: csv(puestos), cruces, sinCruce, sinUbicacion, total: { municipios: dane.length, puestos: puestos.length - 1, fuente: rnec.length } };
}

const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** `fecha` en aaaa-mm-dd; el informe la muestra en dd/mm/aaaa. */
export function informe(r, fecha) {
  const l = [`# Informe de preparación de datos abiertos (${fecha.split("-").reverse().join("/")})`, "",
    `- Municipios del DANE: ${miles(r.total.municipios)}.`,
    `- Puestos de la Registraduría: ${miles(r.total.fuente)}; preparados para cargar: ${miles(r.total.puestos)}.`,
    `- Municipios de la Registraduría que no se pudieron cruzar (sus puestos NO se cargan): ${r.sinCruce.length}.`,
    `- Puestos con coordenadas imposibles (se cargan sin ubicación): ${r.sinUbicacion.length}.`,
    "- El número de mesas no viene en la fuente: queda en 0 (sin dato).", "",
    "## Municipios cruzados sin nombre exacto (revisar)", "",
    "| Registraduría | DANE | Código | Método | Distancia a la cabecera | Puestos |", "|---|---|---|---|---|---|",
    ...r.cruces.map((c) => `| ${c.dpto} / ${c.mpio} | ${c.nombre} | ${c.codigo} | ${c.metodo} | ${c.km === null ? "—" : `${c.km.toFixed(0)} km`} | ${c.puestos} |`), ""];
  if (r.sinCruce.length) l.push("## Sin cruzar", "", ...r.sinCruce.map((s) => `- ${s.dpto} / ${s.mpio} (${s.puestos} puestos)`), "");
  if (r.sinUbicacion.length) l.push("## Puestos sin ubicación", "", ...r.sinUbicacion.map((s) => `- ${s.dpto} / ${s.mpio}: ${s.puesto} (latitud ${s.latitud}, longitud ${s.longitud})`), "");
  return l.join("\n");
}

async function descargar(id) {
  const url = `https://www.datos.gov.co/resource/${id}.json?$limit=100000`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo descargar ${url}: HTTP ${r.status}. ¿Está permitido www.datos.gov.co en la red del entorno?`);
  return r.json();
}

async function principal([carpeta]) {
  if (!carpeta) {
    console.error("Uso: preparar-datos-abiertos.mjs <carpeta-de-salida>");
    process.exit(1);
  }
  mkdirSync(carpeta, { recursive: true });
  const [dane, rnec] = await Promise.all([descargar(FUENTES.municipios.id), descargar(FUENTES.puestos.id)]);
  const r = preparar(dane, rnec);
  const hoy = new Date().toISOString().slice(0, 10);
  writeFileSync(join(carpeta, "municipios.csv"), r.municipiosCsv);
  writeFileSync(join(carpeta, "puestos.csv"), r.puestosCsv);
  writeFileSync(join(carpeta, "informe.md"), informe(r, hoy));
  console.error(`Listo: ${r.total.municipios} municipios y ${r.total.puestos} puestos en ${carpeta}. Revise ${join(carpeta, "informe.md")}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) principal(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });

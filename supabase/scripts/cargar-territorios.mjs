#!/usr/bin/env node
// Convierte un CSV de datos abiertos en SQL para cargar territorios oficiales o puestos de votación.
// El SQL sale por la salida estándar; se aplica con psql (local) o con el editor SQL de Supabase.
//
//   node supabase/scripts/cargar-territorios.mjs municipios archivo.csv --fuente "DANE DIVIPOLA" --fecha 2026-10-01 > municipios.sql
//   node supabase/scripts/cargar-territorios.mjs puestos archivo.csv --fuente "Registraduría" --fecha 2026-10-01 > puestos.sql
//
// Los nombres de columna por defecto están abajo; si el archivo oficial usa otros, se indican con
// --columna clave=NombreEnElArchivo (por ejemplo --columna cod_mpio="Código Municipio").
// Es idempotente: volver a cargar el mismo archivo actualiza en vez de duplicar.
import { readFileSync } from "node:fs";

const COLUMNAS = {
  municipios: { cod_dpto: "cod_dpto", dpto: "dpto", cod_mpio: "cod_mpio", mpio: "mpio" },
  puestos: { codigo: "codigo", nombre: "nombre", cod_mpio: "cod_mpio", mesas: "mesas", latitud: "latitud", longitud: "longitud" },
};

export function leerCsv(texto) {
  const filas = [];
  let fila = [], campo = "", comillas = false;
  const separador = (texto.split(/\r?\n/, 1)[0].match(/;/g) ?? []).length > (texto.split(/\r?\n/, 1)[0].match(/,/g) ?? []).length ? ";" : ",";
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === separador) { fila.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      if (fila.some((x) => x.trim() !== "")) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some((x) => x.trim() !== "")) filas.push(fila);
  const [encabezado, ...datos] = filas;
  const nombres = encabezado.map((h) => h.replace(/^﻿/, "").trim());
  return datos.map((f) => Object.fromEntries(nombres.map((n, i) => [n, (f[i] ?? "").trim()])));
}

const texto = (v) => (v === null || v === undefined || v === "" ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const numero = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return "null";
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? String(n) : "null";
};

export function sqlMunicipios(filas, col, fuente, fecha) {
  const dptos = new Map();
  for (const f of filas) dptos.set(f[col.cod_dpto].padStart(2, "0"), f[col.dpto]);
  const lineas = ["begin;"];
  for (const [codigo, nombre] of dptos) {
    lineas.push(`insert into public.territorio (codigo_divipole, nivel, nombre, fuente, fecha_fuente) values (${texto(codigo)}, 'departamento', ${texto(nombre)}, ${texto(fuente)}, ${texto(fecha)})
  on conflict (codigo_divipole) where campana_id is null do update set nombre = excluded.nombre, fuente = excluded.fuente, fecha_fuente = excluded.fecha_fuente;`);
  }
  for (const f of filas) {
    const codigo = f[col.cod_mpio].padStart(5, "0");
    const dpto = f[col.cod_dpto].padStart(2, "0");
    lineas.push(`insert into public.territorio (codigo_divipole, nivel, nombre, padre_id, fuente, fecha_fuente)
  select ${texto(codigo)}, 'municipio', ${texto(f[col.mpio])}, id, ${texto(fuente)}, ${texto(fecha)} from public.territorio where codigo_divipole = ${texto(dpto)} and campana_id is null
  on conflict (codigo_divipole) where campana_id is null do update set nombre = excluded.nombre, padre_id = excluded.padre_id, fuente = excluded.fuente, fecha_fuente = excluded.fecha_fuente;`);
  }
  lineas.push("commit;");
  return lineas.join("\n") + "\n";
}

export function sqlPuestos(filas, col, fuente, fecha) {
  const lineas = ["begin;"];
  for (const f of filas) {
    const lat = numero(f[col.latitud]), lon = numero(f[col.longitud]);
    const geom = lat === "null" || lon === "null" ? "null" : `extensions.st_setsrid(extensions.st_makepoint(${lon}, ${lat}), 4326)`;
    lineas.push(`insert into public.puesto (codigo, nombre, territorio_id, geom, mesas, fuente, fecha_fuente)
  values (${texto(f[col.codigo])}, ${texto(f[col.nombre])},
    (select id from public.territorio where codigo_divipole = ${texto(f[col.cod_mpio].padStart(5, "0"))} and campana_id is null),
    ${geom}, coalesce(${numero(f[col.mesas])}, 0)::integer, ${texto(fuente)}, ${texto(fecha)})
  on conflict (codigo) do update set nombre = excluded.nombre, territorio_id = excluded.territorio_id, geom = excluded.geom,
    mesas = excluded.mesas, fuente = excluded.fuente, fecha_fuente = excluded.fecha_fuente;`);
  }
  lineas.push("commit;");
  return lineas.join("\n") + "\n";
}

function principal(args) {
  const [tipo, archivo, ...resto] = args;
  if (!COLUMNAS[tipo] || !archivo) {
    console.error("Uso: cargar-territorios.mjs <municipios|puestos> <archivo.csv> --fuente \"...\" --fecha aaaa-mm-dd [--columna clave=Nombre]");
    process.exit(1);
  }
  const col = { ...COLUMNAS[tipo] };
  let fuente = "", fecha = "";
  for (let i = 0; i < resto.length; i++) {
    if (resto[i] === "--fuente") fuente = resto[++i];
    else if (resto[i] === "--fecha") fecha = resto[++i];
    else if (resto[i] === "--columna") { const [k, ...v] = resto[++i].split("="); col[k] = v.join("="); }
  }
  if (!fuente || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    console.error("Indique --fuente y --fecha (aaaa-mm-dd): cada territorio debe mostrar de dónde salió y de cuándo es.");
    process.exit(1);
  }
  const filas = leerCsv(readFileSync(archivo, "utf8"));
  const faltan = Object.values(col).filter((c) => filas.length && !(c in filas[0]));
  if (faltan.length) {
    console.error(`El archivo no tiene estas columnas: ${faltan.join(", ")}. Columnas encontradas: ${Object.keys(filas[0]).join(", ")}`);
    process.exit(1);
  }
  process.stdout.write(tipo === "municipios" ? sqlMunicipios(filas, col, fuente, fecha) : sqlPuestos(filas, col, fuente, fecha));
}

if (import.meta.url === `file://${process.argv[1]}`) principal(process.argv.slice(2));

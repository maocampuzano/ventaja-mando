#!/usr/bin/env node
// Prepara la carga de los límites oficiales de los municipios (DANE, Marco Geoestadístico Nacional) en los
// territorios oficiales que ya existen. No crea territorios: solo les pone la forma a los municipios que ya cargó
// cargar-territorios.mjs, y la del departamento como la unión de sus municipios.
//
// 1. Descargue del geoportal del DANE «Versión MGN2025-Nivel Municipio» (MGN2025_MPIO_GRAFICO.zip, unos 72 MB) y
//    descomprímalo en una carpeta aparte.
// 2. Aligérelo con mapshaper (gratuito):
//      npx mapshaper@0.6.113 -i MGN_ADM_MPIO_GRAFICO.shp -filter-fields mpio_cdpmp,mpio_cnmbr,dpto_ccdgo \
//        -simplify 4% keep-shapes -o municipios-colombia.json format=geojson precision=0.0001
// 3. node supabase/scripts/cargar-limites.mjs municipios-colombia.json > limites.sql
// 4. node --env-file=.env supabase/scripts/aplicar-remoto.mjs cargar limites.sql --lote 50
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const texto = (v) => `'${String(v).replace(/'/g, "''")}'`;

/** Una sentencia por municipio, más la unión por departamento. Ignora lo que no tenga código de 5 dígitos. */
export function sqlLimites(geojson, fuente = "DANE, MGN 2025 (límites simplificados)") {
  const lineas = [];
  const dptos = new Set();
  for (const f of geojson.features ?? []) {
    const codigo = String(f.properties?.mpio_cdpmp ?? "").trim();
    if (!/^\d{5}$/.test(codigo) || !f.geometry) continue;
    if (!["Polygon", "MultiPolygon"].includes(f.geometry.type)) continue;
    dptos.add(codigo.slice(0, 2));
    lineas.push(`update public.territorio set geom = extensions.st_multi(extensions.st_makevalid(extensions.st_setsrid(extensions.st_geomfromgeojson(${texto(JSON.stringify(f.geometry))}), 4326))), fuente = ${texto(fuente)}
  where campana_id is null and nivel = 'municipio' and codigo_divipole = ${texto(codigo)}`);
  }
  for (const d of [...dptos].sort()) {
    lineas.push(`update public.territorio t set geom = (select extensions.st_multi(extensions.st_union(h.geom)) from public.territorio h
    where h.campana_id is null and h.padre_id = t.id and h.geom is not null), fuente = ${texto(fuente)}
  where t.campana_id is null and t.nivel = 'departamento' and t.codigo_divipole = ${texto(d)}`);
  }
  return lineas.map((l) => `${l};`).join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const archivo = process.argv[2];
  if (!archivo) { console.error("Uso: node supabase/scripts/cargar-limites.mjs municipios-colombia.json > limites.sql"); process.exit(1); }
  process.stdout.write(`${sqlLimites(JSON.parse(readFileSync(archivo, "utf8")))}\n`);
}

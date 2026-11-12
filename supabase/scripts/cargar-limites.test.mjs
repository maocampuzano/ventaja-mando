import { test } from "node:test";
import assert from "node:assert/strict";
import { sqlLimites } from "./cargar-limites.mjs";

const cuadro = { type: "Polygon", coordinates: [[[-75, 1], [-74, 1], [-74, 2], [-75, 1]]] };

test("una actualización por municipio y la unión de su departamento", () => {
  const sql = sqlLimites({ features: [
    { properties: { mpio_cdpmp: "18001" }, geometry: cuadro },
    { properties: { mpio_cdpmp: "18029" }, geometry: { ...cuadro, type: "MultiPolygon", coordinates: [cuadro.coordinates] } },
  ] });
  assert.equal(sql.match(/nivel = 'municipio'/g).length, 2);
  assert.equal(sql.match(/nivel = 'departamento'/g).length, 1);
  assert.match(sql, /codigo_divipole = '18001'/);
  assert.match(sql, /codigo_divipole = '18'/);
});

test("ignora lo que no sirve y escapa las comillas", () => {
  const sql = sqlLimites({ features: [
    { properties: { mpio_cdpmp: "123" }, geometry: cuadro },
    { properties: { mpio_cdpmp: "18001" }, geometry: null },
    { properties: { mpio_cdpmp: "18002" }, geometry: { type: "Point", coordinates: [0, 0] } },
  ] }, "Fuente d'prueba");
  assert.equal(sql.trim(), "");
  assert.match(sqlLimites({ features: [{ properties: { mpio_cdpmp: "18001" }, geometry: cuadro }] }, "d'x"), /'d''x'/);
});

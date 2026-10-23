import { test } from "node:test";
import assert from "node:assert/strict";
import { leerCsv, sqlMunicipios, sqlPuestos } from "./cargar-territorios.mjs";

test("lee CSV con punto y coma, comillas, comillas dobles y BOM", () => {
  const filas = leerCsv('﻿cod_dpto;mpio\r\n13;"CARTAGENA; DE ""INDIAS"""\r\n');
  assert.deepEqual(filas, [{ cod_dpto: "13", mpio: 'CARTAGENA; DE "INDIAS"' }]);
});

test("ignora líneas vacías al final", () => {
  assert.equal(leerCsv("a,b\n1,2\n\n\n").length, 1);
});

test("los municipios cuelgan de su departamento y completan ceros a la izquierda", () => {
  const sql = sqlMunicipios([{ cod_dpto: "5", dpto: "ANTIOQUIA", cod_mpio: "5001", mpio: "MEDELLÍN" }],
    { cod_dpto: "cod_dpto", dpto: "dpto", cod_mpio: "cod_mpio", mpio: "mpio" }, "Fuente", "2026-10-23");
  assert.match(sql, /'05', 'departamento', 'ANTIOQUIA'/);
  assert.match(sql, /'05001', 'municipio', 'MEDELLÍN'.*codigo_divipole = '05'/s);
});

test("escapa comillas simples para que el SQL no se rompa", () => {
  const sql = sqlPuestos([{ codigo: "X1", nombre: "Escuela D'Arco", cod_mpio: "13836", mesas: "3", latitud: "", longitud: "" }],
    { codigo: "codigo", nombre: "nombre", cod_mpio: "cod_mpio", mesas: "mesas", latitud: "latitud", longitud: "longitud" }, "F", "2026-10-23");
  assert.match(sql, /'Escuela D''Arco'/);
});

test("un puesto sin coordenadas queda sin ubicación, no en (0, 0)", () => {
  const sql = sqlPuestos([{ codigo: "X1", nombre: "Sin coordenadas", cod_mpio: "13836", mesas: "3", latitud: "", longitud: " " }],
    { codigo: "codigo", nombre: "nombre", cod_mpio: "cod_mpio", mesas: "mesas", latitud: "latitud", longitud: "longitud" }, "F", "2026-10-23");
  assert.doesNotMatch(sql, /st_makepoint/);
});

test("acepta coordenadas con coma decimal", () => {
  const sql = sqlPuestos([{ codigo: "X1", nombre: "P", cod_mpio: "13836", mesas: "3", latitud: "10,3345", longitud: "-75,4115" }],
    { codigo: "codigo", nombre: "nombre", cod_mpio: "cod_mpio", mesas: "mesas", latitud: "latitud", longitud: "longitud" }, "F", "2026-10-23");
  assert.match(sql, /st_makepoint\(-75\.4115, 10\.3345\)/);
});

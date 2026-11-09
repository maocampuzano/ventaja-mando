import { describe, expect, it } from "vitest";
import { CODIGOS_FINANZAS, FUENTES_PROHIBIDAS, libroCsv, resumenCsv, resumenFinanzas, revisarAporte, type AporteParticular } from "./finanzas";

const todas = Object.fromEntries(FUENTES_PROHIBIDAS.map((f) => [f.id, true]));
const aporte = (a: Partial<AporteParticular> = {}): AporteParticular =>
  ({ valor: 1_000_000, tipoPersona: "natural", documento: "1.047.000.001", verificaciones: todas, ...a });

describe("códigos del formulario 5B", () => {
  it("tiene los ingresos 101 a 107 (sin el 106, que es del partido) y los gastos 201 a 211", () => {
    expect(CODIGOS_FINANZAS.filter((c) => c.tipo === "ingreso").map((c) => c.codigo)).toEqual([101, 102, 103, 104, 105, 107]);
    expect(CODIGOS_FINANZAS.filter((c) => c.tipo === "gasto").map((c) => c.codigo)).toEqual([201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211]);
  });
});

describe("aportes de particulares (código 102)", () => {
  it("acepta un aporte completo y dentro del 10 % del tope", () => {
    expect(revisarAporte(aporte(), 0, 100_000_000)).toEqual([]);
  });

  it("rechaza pasar el 10 % del tope sumando lo que ya dio el aportante", () => {
    expect(revisarAporte(aporte({ valor: 3_000_000 }), 8_000_000, 100_000_000)[0]).toMatch(/máximo por aportante es el 10 % del tope \(\$ 10\.000\.000\)/);
    expect(revisarAporte(aporte({ valor: 2_000_000 }), 8_000_000, 100_000_000)).toEqual([]);
  });

  it("no permite aportes anónimos, ni de jurídicas sin acta, ni sin verificar las fuentes prohibidas", () => {
    expect(revisarAporte(aporte({ documento: "" }), 0, 1e8)[0]).toMatch(/no puede ser anónimo/);
    expect(revisarAporte(aporte({ tipoPersona: "juridica" }), 0, 1e8)[0]).toMatch(/número del acta/);
    expect(revisarAporte(aporte({ tipoPersona: "juridica", acta: "Acta 12 de 2027" }), 0, 1e8)).toEqual([]);
    expect(revisarAporte(aporte({ verificaciones: { extranjero: true } }), 0, 1e8)[0]).toMatch(/Confirme las 5 verificaciones/);
  });

  it("sin tope configurado no deja registrar aportes de particulares", () => {
    expect(revisarAporte(aporte(), 0, null)[0]).toMatch(/configure el tope/);
  });
});

describe("resumen y alertas", () => {
  const m = (tipo: "ingreso" | "gasto", codigo: number, valor: number) => ({ tipo, codigo, valor, fecha: "2027-09-01" });

  it("suma por código y calcula el uso del tope", () => {
    const r = resumenFinanzas([m("ingreso", 101, 30e6), m("ingreso", 105, 10e6), m("gasto", 208, 25e6), m("gasto", 201, 5e6)], 40e6);
    expect(r).toMatchObject({ ingresos: 40e6, privados: 30e6, gastos: 30e6, saldo: 10e6, usoTope: 0.75 });
    expect(r.porCodigo[208]).toBe(25e6);
    expect(r.alertas).toEqual([]);
  });

  it("avisa al 80 %, al 95 % y al pasar el tope, y si los privados lo superan", () => {
    expect(resumenFinanzas([m("ingreso", 101, 50e6), m("gasto", 208, 33e6)], 40e6).alertas.map((a) => a.nivel)).toEqual(["ambar", "rojo"]);
    expect(resumenFinanzas([m("ingreso", 101, 39e6), m("gasto", 208, 38e6)], 40e6).alertas[0]).toMatchObject({ nivel: "rojo", texto: expect.stringMatching(/95 %/) });
    expect(resumenFinanzas([m("ingreso", 101, 39e6), m("gasto", 208, 41e6)], 40e6).alertas[0].texto).toMatch(/pérdida del cargo/);
    expect(resumenFinanzas([], null).alertas[0].texto).toMatch(/Falta el tope/);
  });
});

describe("exportación para el contador", () => {
  it("arma el libro en CSV para Excel en español, con la marca de la exportación", () => {
    const csv = libroCsv([
      { fecha: "2027-09-02", tipo: "gasto", codigo: 208, concepto: "Pendones; 200 unidades", forma: "dinero", valor: 1_500_000, tercero: "Litografía Ficticia S.A.S.", tipoPersona: "juridica", documento: "900000001", soporte: true },
      { fecha: "2027-09-01", tipo: "ingreso", codigo: 101, concepto: "Aporte de la candidata", forma: "dinero", valor: 20_000_000, soporte: false },
    ], "Exportado por Gerente Demo el 09/11/2026 · ref. ABC123");
    const lineas = csv.split("\r\n");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lineas[0]).toBe("﻿Exportado por Gerente Demo el 09/11/2026 · ref. ABC123");
    expect(lineas[2]).toBe("01/09/2027;Ingreso;101;Recursos propios y de familiares;Aporte de la candidata;Dinero;20000000;;;;;;No");
    expect(lineas[3]).toBe('02/09/2027;Gasto;208;Propaganda electoral;"Pendones; 200 unidades";Dinero;1500000;Litografía Ficticia S.A.S.;Jurídica;900000001;;;Sí');
  });

  it("arma los totales por código como el formulario 5B", () => {
    const r = resumenFinanzas([{ tipo: "ingreso", codigo: 101, valor: 5, fecha: "x" }, { tipo: "gasto", codigo: 208, valor: 3, fecha: "x" }], 100);
    const csv = resumenCsv(r, "m");
    expect(csv).toContain("100;Total de ingresos;5");
    expect(csv).toContain("208;Propaganda electoral;3");
    expect(csv).toContain("200;Total de gastos;3");
  });
});

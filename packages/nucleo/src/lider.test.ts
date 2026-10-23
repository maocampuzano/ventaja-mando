import { describe, expect, it } from "vitest";
import { indiceLider, type StatsLider } from "./lider";

const base: StatsLider = { registrados: 200, validados: 150, duplicadosConOtros: 10, tareasHechas: 8, tareasAsignadas: 10, meta: 300 };

describe("indiceLider", () => {
  it("calcula los cuatro componentes", () => {
    const { componentes } = indiceLider(base);
    expect(componentes.calidad).toBeCloseTo(0.75);
    expect(componentes.limpieza).toBeCloseTo(0.95);
    expect(componentes.ejecucion).toBeCloseTo(0.8);
    expect(componentes.avanceMeta).toBeCloseTo(0.5);
  });

  it("pondera 35 / 25 / 20 / 20", () => {
    expect(indiceLider(base).total).toBeCloseTo(0.35 * 0.75 + 0.25 * 0.95 + 0.2 * 0.8 + 0.2 * 0.5);
  });

  it("da 1 a un líder perfecto", () => {
    const perfecto = { registrados: 100, validados: 100, duplicadosConOtros: 0, tareasHechas: 5, tareasAsignadas: 5, meta: 100 };
    expect(indiceLider(perfecto).total).toBeCloseTo(1);
  });

  it("no divide por cero cuando el líder no tiene registros, tareas ni meta", () => {
    const vacio = { registrados: 0, validados: 0, duplicadosConOtros: 0, tareasHechas: 0, tareasAsignadas: 0, meta: 0 };
    const r = indiceLider(vacio);
    expect(r.componentes).toEqual({ calidad: 0, limpieza: 1, ejecucion: 0, avanceMeta: 0 });
    expect(r.total).toBeCloseTo(0.25);
  });

  it("limita el avance de meta a 100 %", () => {
    expect(indiceLider({ ...base, validados: 600, registrados: 600 }).componentes.avanceMeta).toBe(1);
  });

  it("castiga las listas infladas con duplicados", () => {
    const inflado = indiceLider({ ...base, duplicadosConOtros: 80 });
    expect(inflado.componentes.limpieza).toBeCloseTo(0.6);
    expect(inflado.total).toBeLessThan(indiceLider(base).total);
  });
});

import { describe, expect, it } from "vitest";
import { cumplimientoPost, indiceLider, votosDeOpcion, type StatsLider } from "./lider";

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

describe("cumplimiento contra el E-14", () => {
  const mesa = (apoyos: number, votos: number, historico: number | null = 50) =>
    ({ apoyosRegistrados: apoyos, votosCandidatoE14: votos, votosCandidatoHistorico: historico });

  it("no se calcula con menos de 3 mesas o 10 apoyos, para no insinuar votos de nadie", () => {
    const pocasMesas = cumplimientoPost([mesa(20, 10), mesa(20, 10)]);
    expect(pocasMesas.suficiente).toBe(false);
    expect(pocasMesas).not.toHaveProperty("cobertura");
    expect(pocasMesas).not.toHaveProperty("votos");
    expect(cumplimientoPost([mesa(3, 2), mesa(3, 2), mesa(3, 2)]).suficiente).toBe(false);
  });

  it("compara votos con apoyos en las mesas del líder, con tope de 100 %", () => {
    const r = cumplimientoPost([mesa(10, 8, 6), mesa(10, 5, 4), mesa(5, 2, 2), mesa(0, 90, 80)]);
    expect(r).toMatchObject({ suficiente: true, mesas: 3, apoyos: 25, votos: 15, cobertura: 0.6 });
    if (r.suficiente) expect(r.crecimiento).toBeCloseTo(0.25);
    expect(cumplimientoPost([mesa(4, 40), mesa(4, 40), mesa(4, 40)])).toMatchObject({ cobertura: 1 });
  });

  it("sin histórico en alguna mesa no calcula el crecimiento y siempre lleva la advertencia", () => {
    const r = cumplimientoPost([mesa(5, 4), mesa(5, 4, null), mesa(5, 4)]);
    expect(r).toMatchObject({ suficiente: true, crecimiento: null });
    expect(r.advertencia).toMatch(/no identifica votos individuales/);
  });

  it("encuentra la opción del candidato sin importar tildes ni mayúsculas", () => {
    const votos = [{ opcion: "Laura  Méndez (Partido Demo)", votos: 80 }, { opcion: "Otro", votos: 3 }];
    expect(votosDeOpcion(votos, "laura mendez (partido demo)")).toBe(80);
    expect(votosDeOpcion(votos, "Nadie")).toBeNull();
    // Las actas traen el número del tarjetón delante del nombre.
    for (const conNumero of ["01 · Laura Méndez (Partido Demo)", "1. Laura Mendez (Partido Demo)", "001 - LAURA MÉNDEZ (PARTIDO DEMO)"]) {
      expect(votosDeOpcion([{ opcion: conNumero, votos: 118 }], "Laura Méndez (Partido Demo)")).toBe(118);
    }
  });
});

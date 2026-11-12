import { describe, expect, it } from "vitest";
import { avanceArranque, pasosArranque } from "./arranque";

describe("arranque guiado", () => {
  it("una campaña nueva tiene los siete pasos por hacer, en orden", () => {
    const p = pasosArranque({});
    expect(p.map((x) => x.id)).toEqual(["tope", "coordinadores", "base", "planillas", "formulario", "asesor", "diae"]);
    expect(avanceArranque(p)).toEqual({ hechos: 0, total: 7 });
  });

  it("cada paso se da por hecho con su dato", () => {
    const p = pasosArranque({ tope: 450_000_000, coordinadores: 1, registrados: 10, lotesPlanilla: 2, formularios: 1, tareasAprobadas: 1, opcionE14: "Laura Méndez" });
    expect(avanceArranque(p)).toEqual({ hechos: 7, total: 7 });
    expect(pasosArranque({ tope: null, opcionE14: null }).filter((x) => x.hecho)).toEqual([]);
  });

  it("cada paso lleva a una pantalla y explica para qué sirve", () => {
    for (const x of pasosArranque({})) {
      expect(x.vista).toMatch(/\w/);
      expect(x.porque.length).toBeGreaterThan(20);
    }
  });
});

import { describe, expect, it } from "vitest";
import { recomendar, textoAccion, type Senal } from "./territorio";

const s = (territorioId: string, alcanceDigital: number, validados: number, potencial: number): Senal =>
  ({ territorioId, alcanceDigital, validados, potencial });

describe("recomendar", () => {
  it("normaliza cada señal contra el máximo del grupo", () => {
    const [a, b] = recomendar([s("a", 1000, 50, 400), s("b", 500, 100, 200)]);
    expect(a).toMatchObject({ digital: 1, tierra: 0.5, brecha: 1 });
    expect(b).toMatchObject({ digital: 0.5, tierra: 1, brecha: 0.5 });
  });

  it("pide brigada donde hay atención digital sin estructura", () => {
    const r = recomendar([s("a", 1000, 10, 100), s("ref", 100, 100, 100)]);
    expect(r[0].accion).toBe("brigada");
  });

  it("pide pauta donde hay estructura sin visibilidad", () => {
    const r = recomendar([s("a", 10, 100, 100), s("ref", 100, 10, 100)]);
    expect(r[0].accion).toBe("pauta");
  });

  it("marca oportunidad donde hay potencial sin pauta ni tierra", () => {
    const r = recomendar([s("a", 10, 10, 100), s("ref", 100, 100, 10)]);
    expect(r[0].accion).toBe("oportunidad");
  });

  it("mantiene donde tierra y pauta están parejas", () => {
    const r = recomendar([s("a", 100, 100, 100)]);
    expect(r[0].accion).toBe("mantener");
  });

  it("no divide por cero si todas las señales están en cero", () => {
    const [r] = recomendar([s("a", 0, 0, 0)]);
    expect(r).toMatchObject({ digital: 0, tierra: 0, brecha: 0, accion: "mantener" });
  });

  it("devuelve una lista vacía para una entrada vacía", () => {
    expect(recomendar([])).toEqual([]);
  });

  it("tiene un texto en español para cada acción", () => {
    for (const r of recomendar([s("a", 1000, 10, 100), s("b", 10, 1000, 100)])) {
      expect(textoAccion[r.accion]).toMatch(/\S/);
    }
  });
});

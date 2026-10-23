import { describe, expect, it } from "vitest";
import { porcentajeCobertura, prioridadCobertura, type Mesa } from "./cobertura";

const mesas: Mesa[] = [
  { puestoId: "p1", mesa: 1, testigoId: "t1", votosHistoricos: 300 },
  { puestoId: "p1", mesa: 2, votosHistoricos: 120 },
  { puestoId: "p1", mesa: 3, votosHistoricos: 280 },
  { puestoId: "p2", mesa: 1, testigoId: "t2", votosHistoricos: 200 },
];

describe("cobertura de mesas", () => {
  it("calcula el porcentaje de mesas con testigo", () => {
    expect(porcentajeCobertura(mesas)).toBe(0.5);
  });

  it("da 0 cuando no hay mesas", () => {
    expect(porcentajeCobertura([])).toBe(0);
  });

  it("prioriza las mesas sin testigo con más votos en juego", () => {
    expect(prioridadCobertura(mesas).map((m) => m.mesa)).toEqual([3, 2]);
  });

  it("no cambia el arreglo original", () => {
    const copia = structuredClone(mesas);
    prioridadCobertura(mesas);
    expect(mesas).toEqual(copia);
  });
});

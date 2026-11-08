import { describe, expect, it } from "vitest";
import {
  COLUMNAS_PLANILLA, codigoHoja, leerCodigoHoja, MAX_HOJAS_POR_LOTE, nombreArchivoPlanilla, referenciaHoja,
} from "./planilla";

const LOTE = "3f2b6c1e-8a4d-4f0b-9c7e-1d2a3b4c5d6e";

describe("código QR de la hoja", () => {
  it("ida y vuelta", () => {
    const texto = codigoHoja({ loteId: LOTE, hoja: 3, hojas: 10 });
    expect(texto).toBe(`VMP1:${LOTE}:3/10`);
    expect(leerCodigoHoja(texto)).toEqual({ loteId: LOTE, hoja: 3, hojas: 10 });
  });

  it("normaliza mayúsculas y espacios alrededor", () => {
    expect(leerCodigoHoja(`  VMP1:${LOTE.toUpperCase()}:1/1 \n`)).toEqual({ loteId: LOTE, hoja: 1, hojas: 1 });
  });

  it("rechaza textos que no son de una planilla", () => {
    for (const t of ["", "https://wa.me/573000000000", `VMP2:${LOTE}:1/1`, `VMP1:${LOTE}:0/3`, `VMP1:${LOTE}:4/3`,
      `VMP1:no-es-un-uuid-pero-tiene-36-caract:1/1`, `VMP1:${LOTE}:1/${MAX_HOJAS_POR_LOTE + 1}`, `VMP1:${LOTE}:1/1:extra`]) {
      expect(leerCodigoHoja(t), t).toBeNull();
    }
  });

  it("no genera códigos inválidos", () => {
    expect(() => codigoHoja({ loteId: "x", hoja: 1, hojas: 1 })).toThrow();
    expect(() => codigoHoja({ loteId: LOTE, hoja: 2, hojas: 1 })).toThrow();
    expect(() => codigoHoja({ loteId: LOTE, hoja: 1.5, hojas: 2 })).toThrow();
  });

  it("no lleva datos de personas: solo el prefijo, el lote y la hoja", () => {
    expect(codigoHoja({ loteId: LOTE, hoja: 1, hojas: 1 }).split(":")).toHaveLength(3);
  });
});

describe("columnas de la planilla", () => {
  it("los anchos suman 1", () => {
    expect(COLUMNAS_PLANILLA.reduce((a, c) => a + c.ancho, 0)).toBeCloseTo(1, 5);
  });

  it("reglas 2 y 4: sin opinión política ni valores en pesos", () => {
    const textos = COLUMNAS_PLANILLA.map((c) => `${c.id} ${c.titulo}`.toLowerCase());
    for (const t of textos) expect(t).not.toMatch(/voto|vota|preferencia|partido|intenci|valor|monto|pesos|ayuda|\$/);
  });

  it("regla 3: trae la columna de firma de autorización", () => {
    expect(COLUMNAS_PLANILLA.some((c) => c.id === "firma" && /autorizo/i.test(c.titulo))).toBe(true);
  });
});

describe("textos de la hoja", () => {
  it("referencia legible", () => {
    expect(referenciaHoja(14, 2, 5)).toBe("Lote 14 · hoja 2 de 5");
  });

  it("nombre de archivo sin tildes ni espacios", () => {
    expect(nombreArchivoPlanilla(14, "Álvaro Puello Núñez")).toBe("planilla-lote-14-alvaro-puello-nunez.pdf");
    expect(nombreArchivoPlanilla(3, "***")).toBe("planilla-lote-3.pdf");
  });
});

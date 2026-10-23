import { describe, expect, it } from "vitest";
import {
  buscarDuplicados, evaluarPar, normaliza, normalizaTelefono, similitudNombre, type PersonaComparable,
} from "./duplicados";

// Datos ficticios.
const p = (id: string, nombre: string, extra: Partial<PersonaComparable> = {}): PersonaComparable =>
  ({ id, nombre, territorioId: "z1", ...extra });

describe("normalización", () => {
  it("quita tildes, mayúsculas y espacios de más", () => {
    expect(normaliza("  MARÍA   José  Peña ")).toBe("maria jose pena");
  });

  it("reconoce el mismo celular con o sin indicativo de Colombia", () => {
    expect(normalizaTelefono("+57 300 123 4567")).toBe("3001234567");
    expect(normalizaTelefono("300-123-4567")).toBe("3001234567");
  });
});

describe("similitudNombre", () => {
  it("da 1 para el mismo nombre escrito distinto", () => {
    expect(similitudNombre("María José Peña", "PEÑA MARIA JOSE")).toBe(1);
  });

  it("mide la proporción de palabras compartidas", () => {
    expect(similitudNombre("Luz Dary Gómez Ruiz", "Luz Dary Gómez")).toBe(0.75);
  });

  it("da 0 si algún nombre está vacío", () => {
    expect(similitudNombre("", "")).toBe(0);
    expect(similitudNombre("   ", "Ana")).toBe(0);
  });
});

describe("evaluarPar", () => {
  it("marca como duplicado el mismo documento y explica por qué", () => {
    const c = evaluarPar(p("a", "José Luis Ortiz", { documentoHash: "h1" }), p("b", "Carlos Díaz", { documentoHash: "h1", territorioId: "z2" }));
    expect(c).toEqual({ a: "a", b: "b", puntaje: 0.7, razones: ["mismo documento"] });
  });

  it("suma todas las razones y no pasa de 1", () => {
    const c = evaluarPar(
      p("a", "Ana Ruiz", { documentoHash: "h1", telefono: "+57 300 000 0001" }),
      p("b", "ANA RUÍZ", { documentoHash: "h1", telefono: "3000000001" }),
    );
    expect(c?.puntaje).toBe(1);
    expect(c?.razones).toEqual(["mismo documento", "mismo teléfono", "nombre similar (100 %)", "mismo territorio"]);
  });

  it("no marca a dos personas que solo comparten territorio", () => {
    expect(evaluarPar(p("a", "Ana Ruiz"), p("b", "Edilberto Cabarcas"))).toBeNull();
  });

  it("mismo teléfono y mismo nombre sin documento sí llegan al umbral", () => {
    // 0,3 (teléfono) + 0,2 (nombre) + 0,05 (territorio) = 0,55 ≥ 0,5 (pesos del 24/10/2026).
    const c = evaluarPar(p("a", "Ana Ruiz", { telefono: "3001112233" }), p("b", "ANA RUÍZ", { telefono: "+57 300 111 2233" }));
    expect(c?.puntaje).toBeCloseTo(0.55);
    expect(c?.razones).toEqual(["mismo teléfono", "nombre similar (100 %)", "mismo territorio"]);
  });

  it("el mismo teléfono con otro nombre no basta: puede ser un celular de la familia", () => {
    expect(evaluarPar(p("a", "Ana Ruiz", { telefono: "3001112233" }), p("b", "Pedro Gil", { telefono: "3001112233" }))).toBeNull();
  });

  it("no compara a una persona consigo misma", () => {
    const x = p("a", "Ana Ruiz", { documentoHash: "h1" });
    expect(evaluarPar(x, x)).toBeNull();
  });

  it("no cuenta teléfonos vacíos como iguales", () => {
    const c = evaluarPar(p("a", "Ana Ruiz", { documentoHash: "h1", telefono: "" }), p("b", "Pedro Gil", { documentoHash: "h1", telefono: "" }));
    expect(c?.razones).not.toContain("mismo teléfono");
  });
});

describe("buscarDuplicados", () => {
  const personas = [
    p("1", "José Luis Ortiz", { documentoHash: "h73", telefono: "3110000921" }),
    p("2", "María José Peña", { documentoHash: "h10" }),
    p("3", "Carlos Díaz M.", { documentoHash: "h73", territorioId: "z2" }),
    p("4", "Ana Ruiz", { documentoHash: "h99", telefono: "+57 311 000 0921" }),
    p("5", "Edilberto Cabarcas", { documentoHash: "h55" }),
  ];

  it("encuentra los pares con el mismo documento", () => {
    expect(buscarDuplicados(personas)).toEqual([{ a: "1", b: "3", puntaje: 0.7, razones: ["mismo documento"] }]);
  });

  it("no repite un par aunque coincida en varios grupos", () => {
    const r = buscarDuplicados([
      p("1", "Ana María Ruiz", { documentoHash: "h1", telefono: "3001" }),
      p("2", "Ana María Ruiz", { documentoHash: "h1", telefono: "3001" }),
    ]);
    expect(r).toHaveLength(1);
  });

  it("ordena de mayor a menor puntaje", () => {
    const r = buscarDuplicados([
      p("1", "Ana Ruiz", { documentoHash: "h1" }),
      p("2", "Pedro Gil", { documentoHash: "h1", territorioId: "z9" }),
      p("3", "Luz Gómez", { documentoHash: "h2", telefono: "3002" }),
      p("4", "Luz Gómez", { documentoHash: "h2", telefono: "3002" }),
    ]);
    expect(r.map((c) => [c.a, c.b])).toEqual([["3", "4"], ["1", "2"]]);
  });

  it("devuelve lo mismo que comparar todos contra todos", () => {
    const muestra: PersonaComparable[] = Array.from({ length: 60 }, (_, i) =>
      p(`p${i}`, ["Ana Ruiz", "Ana María Ruiz", "Pedro Gil", "Luz Dary Gómez", "Luz Gómez"][i % 5], {
        documentoHash: `h${i % 17}`,
        telefono: i % 4 === 0 ? `300${i % 6}` : undefined,
        territorioId: `z${i % 3}`,
      }));
    const fuerzaBruta = [];
    for (let i = 0; i < muestra.length; i++)
      for (let j = i + 1; j < muestra.length; j++) {
        const c = evaluarPar(muestra[i], muestra[j]);
        if (c) fuerzaBruta.push(`${c.a}-${c.b}`);
      }
    const agrupado = buscarDuplicados(muestra).map((c) => `${c.a}-${c.b}`);
    expect(agrupado.sort()).toEqual(fuerzaBruta.sort());
  });

  it("devuelve una lista vacía si no hay personas", () => {
    expect(buscarDuplicados([])).toEqual([]);
  });
});

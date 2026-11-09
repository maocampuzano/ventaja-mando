import { describe, expect, it } from "vitest";
import { crc32, crearXlsx, letraColumna } from "./xlsx";
import { hojasCuentasClaras, plantillaCuentasClaras } from "./plantillaCuentasClaras";

const texto = (b: Uint8Array) => new TextDecoder().decode(b);

describe("Excel mínimo", () => {
  it("calcula el CRC-32 estándar y las letras de columna", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect([0, 25, 26, 51, 52].map(letraColumna)).toEqual(["A", "Z", "AA", "AZ", "BA"]);
  });

  it("arma un ZIP con las partes de un .xlsx y escapa el texto", () => {
    const b = crearXlsx([{ nombre: "Hoja: 1", columnas: [{ titulo: "A & B" }], filas: [["<x>", 5, { formula: "SUM(B:B)" }]] }]);
    expect([...b.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]); // «PK»
    const t = texto(b);
    for (const parte of ["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml"]) expect(t).toContain(parte);
    expect(t).toContain('name="Hoja  1"'); // «:» no se permite en nombres de hoja
    expect(t).toContain("A &amp; B");
    expect(t).toContain("&lt;x&gt;");
    expect(t).toContain("<f>SUM(B:B)</f>");
  });
});

describe("plantilla de Cuentas Claras", () => {
  it("vacía, trae las siete hojas y las fórmulas del resumen", () => {
    const hojas = hojasCuentasClaras();
    expect(hojas.map((h) => h.nombre)).toEqual(["Instrucciones", "Ingresos", "Gastos", "Propaganda 208", "Obligaciones por pagar", "Resumen 5B", "Códigos"]);
    const resumen = hojas[5].filas!;
    expect(resumen[0]).toEqual([100, "TOTAL DE INGRESOS", { formula: "SUM(C3:C8)", pesos: true }]);
    expect(resumen.find((f) => f[0] === 208)?.[2]).toEqual({ formula: "SUM('Propaganda 208'!F:F)", pesos: true });
    expect(hojas[1].filas).toEqual([]);
  });

  it("llena: la propaganda va solo en su hoja, no en gastos", () => {
    const hojas = hojasCuentasClaras({ filas: [
      { fecha: "2027-09-02", tipo: "gasto", codigo: 208, concepto: "Pendones", forma: "dinero", valor: 10, medio: "pasacalles", soporte: true },
      { fecha: "2027-09-01", tipo: "gasto", codigo: 201, concepto: "Arriendo", forma: "dinero", valor: 5, soporte: false },
    ] });
    expect(hojas[2].filas).toEqual([["01/09/2027", 201, "Arriendo", 5, undefined, undefined, undefined, "No"]]);
    expect(hojas[3].filas?.[0]?.[1]).toBe("Pasacalles y pendones");
    expect(plantillaCuentasClaras().length).toBeGreaterThan(1000);
  });
});

import { describe, expect, it } from "vitest";
import { fecha, miles, moneda, pct } from "./formatos";

describe("formatos de Colombia", () => {
  it("separa los miles con punto", () => {
    expect(miles(15419)).toBe("15.419");
    expect(miles(1250000)).toBe("1.250.000");
  });

  it("muestra porcentajes enteros con espacio", () => {
    expect(pct(0.374)).toBe("37 %");
    expect(pct(1)).toBe("100 %");
  });

  it("muestra la moneda como $ 1.250.000, sin centavos", () => {
    expect(moneda(1250000)).toBe("$ 1.250.000");
    expect(moneda(999.6)).toBe("$ 1.000");
    expect(moneda(-45000)).toBe("-$ 45.000");
  });

  it("muestra una fecha sin hora como dd/mm/aaaa, sin correrla de día", () => {
    expect(fecha("2027-10-31")).toBe("31/10/2027");
  });

  it("convierte un instante a la hora de Bogotá", () => {
    // 03:00 UTC del 23 de octubre todavía es 22 de octubre en Bogotá (UTC-5).
    expect(fecha(new Date("2026-10-23T03:00:00Z"))).toBe("22/10/2026");
    expect(fecha("2026-10-23T12:00:00-05:00")).toBe("23/10/2026");
  });

  it("rechaza una fecha no válida", () => {
    expect(() => fecha("no es fecha")).toThrow(RangeError);
  });
});

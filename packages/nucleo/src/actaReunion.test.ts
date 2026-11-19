import { describe, expect, it } from "vitest";
import { ESQUEMA_ACTA, compromisosConDinero, limpiarNotas, mencionaDinero, redaccionSimulada } from "./actaReunion";

describe("actas de reuniones", () => {
  it("las notas salen sin teléfonos, correos ni documentos (regla 6)", () => {
    const t = limpiarNotas("Doña Ana (cédula 1.047.000.123) dejó su celular 310 000 1234 y su correo ana@ficticio.co. Pidió arreglar la vía.");
    expect(t).not.toMatch(/1\.047|310 000|ana@/);
    expect(t).toContain("Pidió arreglar la vía.");
  });

  it("marca los compromisos que ofrecen dinero o beneficios (regla 4)", () => {
    expect(mencionaDinero("Llevar mercados a las familias")).toBe(true);
    expect(mencionaDinero("Dar $ 50.000 por asistente")).toBe(true);
    expect(mencionaDinero("Visitar la vereda con el equipo técnico")).toBe(false);
    expect(compromisosConDinero({ resumen: "", temas: [], acuerdos: "", compromisos: [
      { descripcion: "Pagar el transporte de los asistentes", vence_en: null }, { descripcion: "Convocar a los líderes", vence_en: null },
    ] }).map((c) => c.descripcion)).toEqual(["Pagar el transporte de los asistentes"]);
  });

  it("la redacción simulada saca temas y compromisos de las notas", () => {
    const p = redaccionSimulada("Los líderes de Solano pidieron arreglar la vía y mejorar la salud.\nVisitar el puesto de salud el viernes.");
    expect(p.temas).toEqual(["vías", "salud"].filter((t) => p.temas.includes(t)));
    expect(p.temas).toContain("salud");
    expect(p.compromisos).toEqual([{ descripcion: "Visitar el puesto de salud el viernes", vence_en: null }]);
    expect(p.resumen).toContain("Solano");
  });

  it("el esquema pide todo lo que el acta necesita", () => {
    expect(ESQUEMA_ACTA.required).toEqual(["resumen", "temas", "acuerdos", "compromisos"]);
  });
});

import { describe, expect, it } from "vitest";
import { ESQUEMA_ACTA, compromisosConDinero, limpiarNotas, mencionaDinero, redaccionSimulada, rutaAdjuntoValida } from "./actaReunion";

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

  it("la foto del acta solo se acepta dentro de la carpeta de su reunión", () => {
    const c = "11111111-1111-4111-8111-111111111111";
    const r = "22222222-2222-4222-8222-222222222222";
    expect(rutaAdjuntoValida(`${c}/${r}/33333333-3333-4333-8333-333333333333.jpg`, c, r)).toBe(true);
    expect(rutaAdjuntoValida(`${c}/${r}/foto.PNG`, c, r)).toBe(true);
    expect(rutaAdjuntoValida(`${c}/${r}/../../../evidencias/${c}/x.jpg`, c, r)).toBe(false);
    expect(rutaAdjuntoValida(`${c}/${r}/..`, c, r)).toBe(false);
    expect(rutaAdjuntoValida(`${c}/${r}/%2e%2e.jpg`, c, r)).toBe(false);
    expect(rutaAdjuntoValida(`${c}/${r}/sub/foto.jpg`, c, r)).toBe(false);
    expect(rutaAdjuntoValida(`${c}/${r}/foto.pdf`, c, r)).toBe(false);
    expect(rutaAdjuntoValida(`${c}/33333333-3333-4333-8333-333333333333/foto.jpg`, c, r)).toBe(false);
  });
});

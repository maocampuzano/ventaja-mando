import { describe, expect, it } from "vitest";
import { armarMensaje, dentroDeHorario, revisarPlantilla, segmentosSms } from "./mensajeria";
import { festivosColombia } from "./plazos";

describe("segmentos de SMS", () => {
  it("cuenta en GSM-7 hasta 160 y luego de a 153", () => {
    expect(segmentosSms("a".repeat(160))).toMatchObject({ codificacion: "GSM-7", segmentos: 1 });
    expect(segmentosSms("a".repeat(161))).toMatchObject({ segmentos: 2 });
    expect(segmentosSms("€".repeat(80))).toMatchObject({ caracteres: 160, segmentos: 1 }); // la extensión cuenta doble
  });

  it("con tildes que no están en GSM pasa a UCS-2: 70 y luego de a 67", () => {
    const r = segmentosSms("Reunión " + "a".repeat(62));
    expect(r).toMatchObject({ codificacion: "UCS-2", caracteres: 70, segmentos: 1, fueraDeGsm: ["ó"] });
    expect(segmentosSms("ó".repeat(71)).segmentos).toBe(2);
    expect(segmentosSms("ñandú é").fueraDeGsm).toEqual(["ú"]); // ñ y é sí están en GSM
  });
});

describe("armar y revisar el mensaje", () => {
  it("pone el primer nombre y el pie con el enlace de baja", () => {
    const sms = armarMensaje("sms", "Hola {nombre}, te esperamos el sábado.", { nombre: "MARÍA JOSÉ PEÑA", campana: "Laura Méndez", enlaceBaja: "https://x.co/b/1" });
    expect(sms).toBe("Hola María, te esperamos el sábado.\nLaura Méndez. Para dejar de recibir mensajes: https://x.co/b/1");
    expect(armarMensaje("sms", "Hola {nombre}, hola.", { nombre: "", campana: "C", enlaceBaja: "e" })).toMatch(/^Hola, hola\./);
    expect(armarMensaje("email", "Texto", { nombre: "Ana", campana: "C", enlaceBaja: "https://e" })).toMatch(/no recibir más mensajes por ningún medio, abra este enlace: https:\/\/e$/);
  });

  it("rechaza vacíos, correos sin asunto, WhatsApp y SMS de más de 3 mensajes", () => {
    expect(revisarPlantilla("sms", "  ", "C").errores).toContain("Escriba el texto del mensaje.");
    expect(revisarPlantilla("email", "Hola", "C", "").errores).toContain("El correo necesita un asunto.");
    expect(revisarPlantilla("sms", "Escríbenos a wa.me/573000000000", "C").errores[0]).toMatch(/regla 1/);
    expect(revisarPlantilla("sms", "a".repeat(450), "C").errores[0]).toMatch(/ocuparía 4 mensajes/);
    expect(revisarPlantilla("sms", "Te esperamos el sabado en el parque.", "Laura Méndez")).toMatchObject({ errores: [], advertencias: [] });
    // El pie no obliga a UCS-2: un texto sin tildes raras se queda en GSM-7.
    expect(revisarPlantilla("sms", "Te esperamos el sabado.", "Laura Méndez").segmentos?.codificacion).toBe("GSM-7");
  });

  it("advierte de palabras que pueden sugerir dádivas y del costo de las tildes", () => {
    expect(revisarPlantilla("sms", "Ven y te damos tu mercado", "C").advertencias[0]).toMatch(/mercado/);
    expect(revisarPlantilla("email", "Reunión", "C", "Te pagamos $50.000").advertencias[0]).toMatch(/valores en pesos/);
    expect(revisarPlantilla("sms", "Reunión el jueves", "C").advertencias[0]).toMatch(/«ó».*70 caracteres/);
    expect(revisarPlantilla("sms", "Supermercado abierto", "C").advertencias).toEqual([]); // palabra completa
  });
});

describe("horario y festivos", () => {
  it("calcula los festivos de Colombia, con la Ley Emiliani y los de Pascua", () => {
    const f = festivosColombia(2027);
    expect(f.size).toBe(18);
    expect(f.has("2027-01-11")).toBe(true); // Reyes (6 de enero, miércoles) pasa al lunes 11
    expect(f.has("2027-03-25")).toBe(true); // Jueves Santo (Pascua: 28 de marzo)
    expect(f.has("2027-03-26")).toBe(true); // Viernes Santo
    expect(f.has("2027-05-10")).toBe(true); // Ascensión: Pascua + 39 días, al lunes
    expect(f.has("2027-07-20")).toBe(true);
    expect(f.has("2027-11-01")).toBe(true); // Todos los Santos, ya es lunes
    expect(festivosColombia(2026).has("2026-04-03")).toBe(true); // Viernes Santo 2026
  });

  it("permite entre semana de 8 a 19, sábados de 8 a 15, y nunca domingos ni festivos", () => {
    const a = (s: string) => new Date(`${s}-05:00`);
    expect(dentroDeHorario(a("2027-10-27T07:59")).permitido).toBe(false);
    expect(dentroDeHorario(a("2027-10-27T08:00")).permitido).toBe(true);
    expect(dentroDeHorario(a("2027-10-27T18:59")).permitido).toBe(true);
    expect(dentroDeHorario(a("2027-10-27T19:00")).permitido).toBe(false);
    expect(dentroDeHorario(a("2027-10-30T14:59")).permitido).toBe(true); // sábado
    expect(dentroDeHorario(a("2027-10-30T15:00")).motivo).toMatch(/sábados/);
    expect(dentroDeHorario(a("2027-10-31T10:00")).motivo).toMatch(/domingos/);
    expect(dentroDeHorario(a("2027-11-01T10:00")).motivo).toMatch(/festivos/);
  });
});

import { describe, expect, it } from "vitest";
import { formularioVacio, validarRegistro } from "./registro";

const ctx = { campanaId: "c", lider: "Yesenia Barrios", ahora: new Date("2026-10-24T15:30:00Z") };

describe("registro del líder", () => {
  it("sin autorización no se guarda a nadie (regla 3)", () => {
    const r = validarRegistro({ ...formularioVacio(), nombre: "Ana Ruiz" }, ctx);
    expect(r.datos).toBeUndefined();
    expect(r.errores).toEqual([
      "Marque al menos para qué autoriza la persona el uso de sus datos.",
      "Falta la autorización: tome la foto del formato firmado o marque que la persona aceptó en la pantalla.",
    ]);
  });

  it("con la foto de la firma, la evidencia es la foto", () => {
    const r = validarRegistro({ ...formularioVacio("z1"), nombre: "  Ana   Ruiz ", telefono: "300 000 1001", documento: "0.009.991",
      finalidades: ["contacto_campana"], fotoFirma: "file:///firma.jpg" }, ctx);
    expect(r.datos).toEqual({ campana: "c", nombre: "Ana Ruiz", telefono: "3000001001", documento: "0009991", zona: "z1",
      finalidades: ["contacto_campana"], canal: "presencial", evidencia: "file:///firma.jpg" });
  });

  it("si aceptó en pantalla, la evidencia dice quién, cuándo y cómo (hora de Colombia)", () => {
    const r = validarRegistro({ ...formularioVacio(), nombre: "Ana Ruiz", finalidades: ["actividades_territorio"], aceptoEnPantalla: true }, ctx);
    expect(r.datos?.evidencia).toMatch(/^Aceptó en la pantalla del celular de Yesenia Barrios el 24\/10\/(20)?26.*10:30/);
  });

  it("revisa celular y cédula", () => {
    const r = validarRegistro({ ...formularioVacio(), nombre: "Ana Ruiz", telefono: "12345", documento: "12a",
      finalidades: ["contacto_campana"], aceptoEnPantalla: true }, ctx);
    expect(r.errores).toEqual(["El celular debe tener 10 dígitos y empezar por 3.", "La cédula debe tener entre 5 y 11 dígitos, sin letras."]);
  });
});

describe("después de enviar", () => {
  it("del registro de una persona solo queda el nombre en el teléfono", async () => {
    const { depurarEnviada, fotosParaBorrar } = await import("./datos/depurar");
    const op = { id: "1", tipo: "persona" as const, estado: "pendiente" as const, intentos: 0, creadaEn: 0, proximoIntento: 0,
      datos: { campana: "c", nombre: "Ana Ruiz", documento: "0009991", telefono: "3000001001", zona: null,
        finalidades: ["contacto_campana"], canal: "presencial", evidencia: "file:///cache/firma.jpg" } };
    expect(depurarEnviada(op)).toEqual({ nombre: "Ana Ruiz" });
    expect(fotosParaBorrar(op)).toEqual(["file:///cache/firma.jpg"]);
  });
});

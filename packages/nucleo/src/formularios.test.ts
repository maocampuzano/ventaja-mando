import { describe, expect, it } from "vitest";
import { nuevoIdCampo, revisarEsquema, validarRespuesta, type Campo } from "./formularios";

const campo = (c: Partial<Campo>): Campo => ({ id: "c1", tipo: "texto", etiqueta: "Barrio donde vive", obligatorio: false, ...c });

describe("revisar el esquema", () => {
  it("un formulario sencillo pasa", () => {
    const r = revisarEsquema("Visita casa a casa", { campos: [
      campo({}), campo({ id: "c2", tipo: "opcion", etiqueta: "¿Qué tema le preocupa?", opciones: ["Vías", "Seguridad"] }),
    ] });
    expect(r).toEqual({ errores: [], avisos: [] });
  });

  it("bloquea preguntar por el voto o la opinión política (regla 2)", () => {
    for (const etiqueta of ["¿Por quién va a votar?", "Intención de voto", "¿Simpatiza con algún partido político?", "Opinión política"]) {
      expect(revisarEsquema("F", { campos: [campo({ etiqueta })] }).errores.join(" ")).toMatch(/regla 2/);
    }
  });

  it("también la busca en las opciones", () => {
    const r = revisarEsquema("Encuesta", { campos: [campo({ tipo: "opcion", etiqueta: "Tema", opciones: ["Votaría por la campaña", "No"] })] });
    expect(r.errores.join(" ")).toMatch(/regla 2/);
  });

  it("bloquea pedir la cédula en un formulario", () => {
    expect(revisarEsquema("Registro", { campos: [campo({ etiqueta: "Número de cédula" })] }).errores.join(" ")).toMatch(/cédula no se pide/);
  });

  it("avisa, sin bloquear, cuando se pregunta por dinero o ayudas (regla 4)", () => {
    const r = revisarEsquema("Necesidades", { campos: [campo({ etiqueta: "¿Necesita ayuda económica?" })] });
    expect(r.errores).toEqual([]);
    expect(r.avisos.join(" ")).toMatch(/regla 4/);
  });

  it("pide nombre, preguntas y opciones distintas", () => {
    const r = revisarEsquema("", { campos: [campo({ etiqueta: "" }), campo({ id: "c2", tipo: "multiple", etiqueta: "Temas", opciones: ["Vías", "vías"] })] });
    expect(r.errores).toEqual([
      "El formulario necesita un nombre.", "Campo 1: escriba la pregunta.", "Campo 2: hay opciones repetidas.",
    ]);
  });

  it("no confunde palabras parecidas: «devoto» no es «voto»", () => {
    expect(revisarEsquema("Comunidad", { campos: [campo({ etiqueta: "¿Es devoto de algún santo patrono?" })] }).errores).toEqual([]);
  });
});

describe("validar respuestas", () => {
  const esquema = { campos: [
    campo({ id: "a", obligatorio: true }), campo({ id: "b", tipo: "numero", etiqueta: "Personas en el hogar" }),
    campo({ id: "c", tipo: "opcion", etiqueta: "Tema", opciones: ["Vías", "Salud"] }), campo({ id: "d", tipo: "si_no", etiqueta: "¿Asiste?" }),
  ] };
  it("marca lo obligatorio y los tipos", () => {
    expect(validarRespuesta(esquema, { b: "tres" as unknown as number, c: "Otro", d: "sí" as unknown as boolean })).toEqual({
      a: "Obligatorio.", b: "Debe ser un número.", c: "Elija una de las opciones.", d: "Responda sí o no.",
    });
  });
  it("una respuesta correcta no tiene errores", () => {
    expect(validarRespuesta(esquema, { a: "Centro", b: 4, c: "Salud", d: true })).toEqual({});
  });
  it("genera identificadores de campo sin repetir", () => {
    expect(nuevoIdCampo(["c1", "c2"])).toBe("c3");
    expect(nuevoIdCampo(["c2"])).toBe("c3");
  });
});

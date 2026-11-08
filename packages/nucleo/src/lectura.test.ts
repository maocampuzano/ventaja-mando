import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import {
  ESQUEMA_E14, ESQUEMA_PLANILLA, alertasActa, lecturaSimuladaE14, lecturaSimuladaPlanilla, normalizarCedula, normalizarCelular,
  repetidosEnHoja, revisarFila, type FilaLeida,
} from "./lectura";
import { ErrorLectura, leerConClaude, type ClienteLectura } from "./lecturaClaude";

const alta = { nombre: 0.99, cedula: 0.99, celular: 0.99, barrio: 0.99, firma: 0.99 };
const fila = (x: Partial<FilaLeida>): FilaLeida => ({ renglon: 1, nombre: "Ana Ruiz", cedula: "", celular: "", barrio: "", firma: true, confianza: alta, ...x });

describe("normalizar", () => {
  it("celulares colombianos", () => {
    expect(normalizarCelular("300 000 4412")).toBe("+57 300 000 4412");
    expect(normalizarCelular("+57 3000004412")).toBe("+57 300 000 4412");
    expect(normalizarCelular("6055551234")).toBeNull(); // fijo
    expect(normalizarCelular("30?0005521")).toBeNull();
    expect(normalizarCelular("300000441")).toBeNull();
  });
  it("cédulas", () => {
    expect(normalizarCedula("1.047.000.218")).toBe("1047000218");
    expect(normalizarCedula("1234")).toBeNull();
    expect(normalizarCedula("11430000?7")).toBeNull();
  });
});

describe("revisión de cada fila (regla 7: señala, no decide)", () => {
  it("una fila limpia no tiene dudas ni bloqueos", () => {
    const r = revisarFila(fila({ cedula: "1047000218", celular: "3000004412" }));
    expect(r.dudas).toEqual([]);
    expect(r.bloqueos).toEqual([]);
    expect(r.celular).toBe("+57 300 000 4412");
  });
  it("una cédula incompleta hay que corregirla: no basta con confirmarla", () => {
    expect(revisarFila(fila({ cedula: "11430000?7" })).corregir).toHaveLength(1);
    expect(revisarFila(fila({ cedula: "123" })).corregir).toHaveLength(1);
    expect(revisarFila(fila({ cedula: "1143000017" })).corregir).toEqual([]);
    expect(revisarFila(fila({ cedula: "" })).corregir).toEqual([]);
  });
  it("confianza baja o formato raro: ámbar en ese campo", () => {
    expect(revisarFila(fila({ cedula: "1047000218", confianza: { ...alta, cedula: 0.6 } })).dudas).toEqual(["cedula"]);
    expect(revisarFila(fila({ celular: "30?0005521" })).dudas).toEqual(["celular"]);
  });
  it("regla 3: sin firma no se registra", () => {
    expect(revisarFila(fila({ firma: false })).bloqueos[0]).toMatch(/Sin firma/);
  });
  it("sin nombre legible no se guarda", () => {
    expect(revisarFila(fila({ nombre: "J?" })).bloqueos).toContain("Falta el nombre o no se lee.");
  });
  it("cédula y celular son opcionales", () => {
    const r = revisarFila(fila({}));
    expect(r.cedula).toBeNull();
    expect(r.dudas).toEqual([]);
  });
  it("repetidos en la hoja: rojo", () => {
    const filas = lecturaSimuladaPlanilla().map(revisarFila);
    expect(repetidosEnHoja(filas).get(4)).toBe("Misma cédula que el renglón 2");
  });
  it("la hoja simulada trae un caso de cada tipo", () => {
    const filas = lecturaSimuladaPlanilla().map(revisarFila);
    expect(filas.filter((f) => f.dudas.length).map((f) => f.renglon)).toEqual([3, 5]);
    expect(filas.filter((f) => f.bloqueos.length).map((f) => f.renglon)).toEqual([6]);
  });
});

describe("E-14: alertas para revisar, nunca acusaciones", () => {
  it("un acta que cuadra no tiene alertas", () => {
    expect(alertasActa(lecturaSimuladaE14())).toEqual([]);
  });
  it("descuadres y faltantes", () => {
    const a = lecturaSimuladaE14();
    expect(alertasActa({ ...a, totalVotos: 260 })[0]).toMatch(/no coincide con el total/);
    expect(alertasActa({ ...a, sufragantes: 200 })).toContainEqual(expect.stringMatching(/mayor que el número de sufragantes/));
    expect(alertasActa({ ...a, blancos: null })).toContain("Hay números que no se leyeron.");
    expect(alertasActa({ ...a, confianza: 0.5 })[0]).toMatch(/confianza baja/);
  });
  it("las alertas no hablan de fraude", () => {
    const a = lecturaSimuladaE14();
    const todas = [alertasActa({ ...a, totalVotos: 999, sufragantes: 10, mesa: null, confianza: 0.1 })].flat().join(" ");
    expect(todas).not.toMatch(/fraude|ilegal|delito|manipul/i);
  });
});

describe("esquemas de salida", () => {
  it("estrictos: sin propiedades extra y con todo requerido", () => {
    expect(ESQUEMA_PLANILLA.additionalProperties).toBe(false);
    expect(ESQUEMA_PLANILLA.properties.filas.items.additionalProperties).toBe(false);
    expect(ESQUEMA_E14.additionalProperties).toBe(false);
    expect([...ESQUEMA_E14.required].sort()).toEqual(Object.keys(ESQUEMA_E14.properties).sort());
  });
  it("la planilla no pide nada sobre el voto (regla 2)", () => {
    expect(JSON.stringify(ESQUEMA_PLANILLA)).not.toMatch(/voto|partido|preferencia/i);
  });
});

function clienteFalso(respuesta: Partial<Anthropic.Beta.BetaMessage>) {
  const pedidos: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const cliente = { beta: { messages: { create: async (p: Anthropic.Beta.MessageCreateParamsNonStreaming) => {
    pedidos.push(p);
    return { model: "claude-sonnet-5-5", stop_reason: "end_turn", usage: { input_tokens: 1500, output_tokens: 300 }, ...respuesta };
  } } } } as unknown as ClienteLectura;
  return { cliente, pedidos };
}
const texto = (t: string) => [{ type: "text", text: t, citations: null }] as Anthropic.Beta.BetaTextBlock[];
const IMG = { base64: "AAAA", mediaType: "image/jpeg" as const };

describe("lectura con Claude (cliente simulado)", () => {
  it("planilla: imagen + instrucción, salida JSON estricta y costo", async () => {
    const { cliente, pedidos } = clienteFalso({ content: texto(JSON.stringify({ filas: lecturaSimuladaPlanilla() })) });
    const r = await leerConClaude(cliente, "planilla", IMG);
    expect(r.tipo === "planilla" && r.filas).toHaveLength(6);
    expect(r.uso.costoUsd).toBeGreaterThan(0);
    const p = pedidos[0];
    expect(p.output_config?.format).toEqual({ type: "json_schema", schema: ESQUEMA_PLANILLA });
    const contenido = p.messages[0].content as Anthropic.Beta.BetaContentBlockParam[];
    expect(contenido[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg" } });
    expect(p.fallbacks).toBe("default");
  });
  it("E-14", async () => {
    const { cliente } = clienteFalso({ content: texto(JSON.stringify(lecturaSimuladaE14())) });
    const r = await leerConClaude(cliente, "e14", IMG);
    expect(r.tipo === "e14" && r.acta.totalVotos).toBe(252);
  });
  it("rechazo, respuesta cortada o JSON inválido: error claro", async () => {
    await expect(leerConClaude(clienteFalso({ stop_reason: "refusal", content: [] }).cliente, "planilla", IMG)).rejects.toThrow(ErrorLectura);
    await expect(leerConClaude(clienteFalso({ stop_reason: "max_tokens", content: texto("{") }).cliente, "planilla", IMG)).rejects.toThrow(/incompleta/);
    await expect(leerConClaude(clienteFalso({ content: texto("no es json") }).cliente, "e14", IMG)).rejects.toThrow(/no devolvió un resultado válido/);
  });
});

import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { DatosStrategos } from "./strategos";
import { responderConClaude, type ClienteClaude } from "./strategosClaude";

const datos: DatosStrategos = {
  campana: { candidato: "Laura Méndez", cargo: "Alcaldía", metaVotos: 1000, eleccion: "2027-10-31" },
  zonas: [
    { id: "z1", nombre: "Centro", meta: 500, potencial: 100, bruto: 400, validados: 300, comprometidos: 100, lideres: 2, alcance: 100, clics: 10, gasto: 1000 },
    { id: "z2", nombre: "La Ceiba", meta: 500, potencial: 900, bruto: 50, validados: 20, comprometidos: 5, lideres: 1, alcance: 5000, clics: 400, gasto: 9000 },
  ],
  lideres: [{ ref: "L-01", zonaId: "z1", registrados: 10, validados: 5, duplicadosConOtros: 0, tareasHechas: 1, tareasAsignadas: 2, meta: 20 }],
};

type Respuesta = Pick<Anthropic.Beta.BetaMessage, "content" | "stop_reason" | "model"> & { usage: Partial<Anthropic.Beta.BetaUsage> };

/** Cliente falso: devuelve las respuestas en orden y guarda lo que recibió. */
function clienteFalso(respuestas: Respuesta[]) {
  const pedidos: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const cliente = {
    beta: {
      messages: {
        create: async (p: Anthropic.Beta.MessageCreateParamsNonStreaming) => {
          pedidos.push(structuredClone(p));
          const r = respuestas.shift();
          if (!r) throw new Error("sin más respuestas");
          return { ...r, usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...r.usage } };
        },
      },
    },
  } as unknown as ClienteClaude;
  return { cliente, pedidos };
}

const usoHerramienta = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input }) as Anthropic.Beta.BetaToolUseBlock;
const texto = (t: string) => ({ type: "text", text: t, citations: null }) as Anthropic.Beta.BetaTextBlock;

describe("Strategos con Claude (cliente simulado)", () => {
  it("ejecuta las herramientas, devuelve todos los resultados juntos y arma la respuesta con fuentes y tareas", async () => {
    const { cliente, pedidos } = clienteFalso([
      { model: "claude-sonnet-5-5", stop_reason: "tool_use", content: [usoHerramienta("t1", "zonas", { orden: "brecha", limite: 5 }), usoHerramienta("t2", "resumen_campana", {})], usage: {} },
      { model: "claude-sonnet-5-5", stop_reason: "tool_use", content: [usoHerramienta("t3", "proponer_tarea", { tipo: "brigada", titulo: "Brigada en La Ceiba", detalle: "Sábado", zonas: ["z2"], lideres: [] })], usage: {} },
      { model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [texto("Propongo una brigada en La Ceiba.")], usage: {} },
    ]);
    const r = await responderConClaude(cliente, "¿Dónde actúo esta semana?", datos);

    expect(r.texto).toBe("Propongo una brigada en La Ceiba.");
    expect(r.tareas).toEqual([{ tipo: "brigada", titulo: "Brigada en La Ceiba", detalle: "Sábado", zonas: ["z2"], lideres: [] }]);
    expect(r.fuentes).toHaveLength(3);
    expect(r.uso).toMatchObject({ entrada: 300, salida: 150 });
    expect(r.uso!.costoUsd).toBeGreaterThan(0);

    // Segundo pedido: assistant con el contenido completo y UN solo mensaje de usuario con los dos resultados.
    const msgs = pedidos[1].messages;
    expect(msgs).toHaveLength(3);
    expect(msgs[2].role).toBe("user");
    expect((msgs[2].content as Anthropic.Beta.BetaToolResultBlockParam[]).map((b) => b.tool_use_id)).toEqual(["t1", "t2"]);
    // Lo que va a Claude no lleva campos de personas.
    expect(JSON.stringify(msgs)).not.toMatch(/"(telefono|documento|cedula)"/);
  });

  it("configuración del pedido: modelo, sin forzar herramientas, respaldo y caché del sistema", async () => {
    const { cliente, pedidos } = clienteFalso([{ model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [texto("ok")], usage: {} }]);
    await responderConClaude(cliente, "hola", datos);
    const p = pedidos[0];
    expect(p.model).toBe("claude-sonnet-5-5");
    expect(p.tool_choice).toBeUndefined();
    expect(p.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(p.fallbacks).toBe("default");
    expect(p).not.toHaveProperty("temperature");
    expect(p).not.toHaveProperty("thinking");
    expect((p.system as Anthropic.Beta.BetaTextBlockParam[])[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("un error en la herramienta va marcado como error para que Claude se corrija", async () => {
    const { cliente, pedidos } = clienteFalso([
      { model: "m", stop_reason: "tool_use", content: [usoHerramienta("t1", "proponer_tarea", { tipo: "brigada", titulo: "x", detalle: "y", zonas: ["z99"], lideres: [] })], usage: {} },
      { model: "m", stop_reason: "end_turn", content: [texto("Listo")], usage: {} },
    ]);
    const r = await responderConClaude(cliente, "x", datos);
    const res = (pedidos[1].messages[2].content as Anthropic.Beta.BetaToolResultBlockParam[])[0];
    expect(res.is_error).toBe(true);
    expect(r.tareas).toEqual([]);
  });

  it("un rechazo de seguridad no muestra texto parcial", async () => {
    const { cliente } = clienteFalso([{ model: "m", stop_reason: "refusal", content: [texto("parcial")], usage: {} }]);
    const r = await responderConClaude(cliente, "x", datos);
    expect(r.texto).toMatch(/no puede responder/);
  });

  it("no se queda en un ciclo infinito", async () => {
    const vuelta = { model: "m", stop_reason: "tool_use" as const, content: [usoHerramienta("t", "resumen_campana", {})], usage: {} };
    const { cliente, pedidos } = clienteFalso(Array.from({ length: 10 }, () => structuredClone(vuelta)));
    const r = await responderConClaude(cliente, "x", datos);
    expect(pedidos).toHaveLength(6);
    expect(r.texto).toMatch(/demasiados pasos/);
  });
});

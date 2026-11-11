// Asesor IA con Claude: ciclo de herramientas sobre los datos agregados. Corre en el servidor (función de Supabase
// «asesor»), nunca en el navegador: la clave de Anthropic no sale del servidor. El cliente se recibe ya creado,
// así este archivo solo depende de los tipos del SDK y se puede probar con un cliente simulado.
import type Anthropic from "@anthropic-ai/sdk";
import {
  HERRAMIENTAS_ASESOR, SISTEMA_ASESOR, costoEstimadoUsd, ejecutarHerramienta,
  type DatosAsesor, type RespuestaAsesor, type TareaPropuesta,
} from "./asesor.ts";

export const MODELO_ASESOR_POR_DEFECTO = "claude-sonnet-5-5";
const MAX_VUELTAS = 6;

/** Lo único que el ciclo usa del cliente del SDK (permite probarlo sin red). */
export type ClienteClaude = { beta: { messages: Pick<Anthropic["beta"]["messages"], "create"> } };

export async function responderConClaude(
  cliente: ClienteClaude, pregunta: string, datos: DatosAsesor, modelo = MODELO_ASESOR_POR_DEFECTO,
): Promise<RespuestaAsesor> {
  const mensajes: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: pregunta }];
  const tareas: TareaPropuesta[] = [];
  const fuentes = new Set<string>();
  const uso = { entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0 };
  const tools: Anthropic.Beta.BetaTool[] = HERRAMIENTAS_ASESOR.map((h) => ({ ...h, input_schema: h.input_schema }));

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const r = await cliente.beta.messages.create({
      model: modelo,
      max_tokens: 16000,
      // Si un clasificador de seguridad rechaza la petición, la API la repite en otro modelo adecuado.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      // Sistema y herramientas son fijos: se guardan en caché entre preguntas.
      system: [{ type: "text", text: SISTEMA_ASESOR, cache_control: { type: "ephemeral" } }],
      tools,
      messages: mensajes,
    });
    uso.entrada += r.usage.input_tokens ?? 0;
    uso.salida += r.usage.output_tokens ?? 0;
    uso.cacheLectura += r.usage.cache_read_input_tokens ?? 0;
    uso.cacheEscritura += r.usage.cache_creation_input_tokens ?? 0;

    const resumenUso = () => ({
      entrada: uso.entrada + uso.cacheEscritura, salida: uso.salida, cacheLectura: uso.cacheLectura,
      costoUsd: costoEstimadoUsd(modelo, uso),
    });
    const texto = () => r.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();

    if (r.stop_reason === "refusal") {
      return { texto: "El Asesor IA no puede responder esa pregunta. Intente plantearla de otra forma.", fuentes: [...fuentes], tareas: [], modelo: r.model, uso: resumenUso() };
    }
    if (r.stop_reason === "pause_turn") {
      mensajes.push({ role: "assistant", content: r.content });
      continue;
    }
    const usos = r.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (r.stop_reason !== "tool_use" || !usos.length) {
      return { texto: texto() || "El Asesor IA no devolvió texto.", fuentes: [...fuentes], tareas, modelo: r.model, uso: resumenUso() };
    }

    // Se devuelve el contenido completo (incluidos los bloques de razonamiento) y todos los resultados en un mensaje.
    mensajes.push({ role: "assistant", content: r.content });
    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = usos.map((u) => {
      const res = ejecutarHerramienta(u.name, u.input, datos, tareas);
      fuentes.add(res.fuente);
      const error = typeof res.datos === "object" && res.datos !== null && "error" in res.datos;
      return { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(res), ...(error ? { is_error: true } : {}) };
    });
    mensajes.push({ role: "user", content: resultados });
  }
  return {
    texto: "El Asesor IA necesitó demasiados pasos para esta pregunta. Intente una pregunta más concreta.",
    fuentes: [...fuentes], tareas, modelo, uso: { entrada: uso.entrada + uso.cacheEscritura, salida: uso.salida, cacheLectura: uso.cacheLectura, costoUsd: costoEstimadoUsd(modelo, uso) },
  };
}

// Lectura de una foto (planilla o E-14) con la visión de Claude y salida JSON estricta. Corre en el servidor (función
// de Supabase «lectura»). El resultado SIEMPRE pasa por revisión humana antes de entrar a la base (regla 7).
import type Anthropic from "@anthropic-ai/sdk";
import { costoEstimadoUsd } from "./strategos";
import {
  ESQUEMA_E14, ESQUEMA_PLANILLA, INSTRUCCION_E14, INSTRUCCION_PLANILLA, type ActaLeida, type FilaLeida,
} from "./lectura";

export const MODELO_LECTURA_POR_DEFECTO = "claude-sonnet-5-5";
export type TipoLectura = "planilla" | "e14";
export type ImagenLectura = { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };
export type UsoLectura = { modelo: string; entrada: number; salida: number; cacheLectura: number; costoUsd: number };
export type ResultadoLectura =
  | { tipo: "planilla"; filas: FilaLeida[]; uso: UsoLectura }
  | { tipo: "e14"; acta: ActaLeida; uso: UsoLectura };

/** Lo único que la lectura usa del cliente del SDK (permite probarla sin red). */
export type ClienteLectura = { beta: { messages: Pick<Anthropic["beta"]["messages"], "create"> } };

export class ErrorLectura extends Error {}

export async function leerConClaude(
  cliente: ClienteLectura, tipo: TipoLectura, imagen: ImagenLectura, modelo = MODELO_LECTURA_POR_DEFECTO,
): Promise<ResultadoLectura> {
  const r = await cliente.beta.messages.create({
    model: modelo,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: tipo === "planilla" ? ESQUEMA_PLANILLA : ESQUEMA_E14 } },
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: imagen.mediaType, data: imagen.base64 } },
        { type: "text", text: tipo === "planilla" ? INSTRUCCION_PLANILLA : INSTRUCCION_E14 },
      ],
    }],
  });
  const uso: UsoLectura = {
    modelo: r.model,
    entrada: (r.usage.input_tokens ?? 0) + (r.usage.cache_creation_input_tokens ?? 0),
    salida: r.usage.output_tokens ?? 0,
    cacheLectura: r.usage.cache_read_input_tokens ?? 0,
    costoUsd: costoEstimadoUsd(modelo, {
      entrada: r.usage.input_tokens ?? 0, salida: r.usage.output_tokens ?? 0,
      cacheLectura: r.usage.cache_read_input_tokens ?? 0, cacheEscritura: r.usage.cache_creation_input_tokens ?? 0,
    }),
  };
  if (r.stop_reason === "refusal") throw new ErrorLectura("No se pudo leer esta foto. Revísela a mano.");
  if (r.stop_reason === "max_tokens") throw new ErrorLectura("La lectura quedó incompleta. Tome la foto de una sola hoja.");
  const texto = r.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
  let datos: unknown;
  try { datos = JSON.parse(texto); } catch { throw new ErrorLectura("La lectura no devolvió un resultado válido."); }

  if (tipo === "planilla") {
    const filas = (datos as { filas?: unknown }).filas;
    if (!Array.isArray(filas)) throw new ErrorLectura("La lectura no devolvió filas.");
    return { tipo, filas: filas as FilaLeida[], uso };
  }
  const acta = datos as ActaLeida;
  if (!Array.isArray(acta?.votos)) throw new ErrorLectura("La lectura no devolvió los votos del acta.");
  return { tipo, acta, uso };
}

// Función de Supabase «lectura» (Deno). Recibe { lote } (una foto de planilla ya subida por el líder) con la sesión de
// quien la pide, la lee con Claude y deja las filas para revisión humana (regla 7). No crea personas: eso pasa solo
// cuando alguien aprueba la hoja (aprobar_planilla). Sin ANTHROPIC_API_KEY no lee: en el proyecto real nunca se usa
// la lectura simulada, para que no entren datos inventados.
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { ErrorLectura, MODELO_LECTURA_POR_DEFECTO, leerConClaude, type ImagenLectura } from "../../../packages/nucleo/src/lecturaClaude.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const responder = (estado: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 5 * 1024 * 1024; // límite de imagen de la API

function base64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function tipoImagen(ruta: string, blobType: string): ImagenLectura["mediaType"] | null {
  const t = blobType || (/\.png$/i.test(ruta) ? "image/png" : /\.webp$/i.test(ruta) ? "image/webp" : "image/jpeg");
  return t === "image/jpeg" || t === "image/png" || t === "image/webp" ? t : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder(405, { error: "Use POST." });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return responder(401, { error: "Inicie sesión." });
  let cuerpo: { lote?: string };
  try { cuerpo = await req.json(); } catch { return responder(400, { error: "La petición no es válida." }); }
  const loteId = String(cuerpo.lote ?? "");
  if (!UUID.test(loteId)) return responder(400, { error: "Falta la planilla." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const usuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const servicio = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: u } = await usuario.auth.getUser();
  if (!u.user) return responder(401, { error: "La sesión venció. Vuelva a iniciar sesión." });

  // Con la sesión de quien pide: si no la ve (RLS), no la puede hacer leer.
  const { data: lote } = await usuario.from("lote_ocr").select("id, campana_id, archivo_url, estado").eq("id", loteId).maybeSingle();
  if (!lote) return responder(404, { error: "La planilla no existe o no la puede ver." });
  if (lote.estado !== "pendiente") return responder(409, { error: "Esta planilla ya se leyó." });

  const clave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!clave) return responder(503, { error: "La lectura con IA no está activa todavía. Puede revisar la foto y digitar los datos a mano." });

  const [{ data: gasto }, { data: cupo }] = await Promise.all([
    servicio.rpc("gasto_ia_mes_servicio", { p_campana: lote.campana_id }),
    servicio.from("cupo_ia").select("usd_mes").eq("campana_id", lote.campana_id).maybeSingle(),
  ]);
  if (Number(gasto ?? 0) >= (cupo ? Number(cupo.usd_mes) : 10)) {
    return responder(429, { error: "La campaña llegó al cupo de IA de este mes. La gerencia puede pedir una ampliación." });
  }

  const { data: archivo, error: ea } = await servicio.storage.from("evidencias").download(lote.archivo_url);
  if (ea || !archivo) return responder(404, { error: "No se encontró la foto de la planilla." });
  if (archivo.size > MAX_BYTES) return responder(413, { error: "La foto pesa más de 5 MB. Tómela de nuevo con menos resolución." });
  const mediaType = tipoImagen(lote.archivo_url, archivo.type);
  if (!mediaType) return responder(415, { error: "La foto debe ser JPG, PNG o WebP." });

  try {
    const r = await leerConClaude(new Anthropic({ apiKey: clave }), "planilla",
      { base64: base64(new Uint8Array(await archivo.arrayBuffer())), mediaType },
      Deno.env.get("MODELO_LECTURA") || MODELO_LECTURA_POR_DEFECTO);
    if (r.tipo !== "planilla") throw new ErrorLectura("Respuesta inesperada.");
    await servicio.from("uso_ia").insert({
      campana_id: lote.campana_id, usuario_id: u.user.id, funcion: "lectura_planilla", modelo: r.uso.modelo,
      tokens_entrada: r.uso.entrada, tokens_salida: r.uso.salida, tokens_cache_lectura: r.uso.cacheLectura, costo_usd: r.uso.costoUsd,
    });
    const { data: filas, error: eg } = await servicio.rpc("guardar_lectura_planilla", { p_lote: loteId, p_filas: r.filas });
    if (eg) return responder(500, { error: "No se pudo guardar la lectura." });
    return responder(200, { filas });
  } catch (e) {
    const mensaje = e instanceof ErrorLectura ? e.message
      : e instanceof Anthropic.RateLimitError ? "La lectura está muy ocupada. Intente en un minuto."
      : "No se pudo leer la foto. Intente de nuevo.";
    if (!(e instanceof ErrorLectura)) console.error(e instanceof Anthropic.APIError ? `Error de la API de Claude: ${e.status}` : "Error inesperado en la lectura");
    await servicio.from("lote_ocr").update({ lectura_error: mensaje }).eq("id", loteId);
    return responder(502, { error: mensaje });
  }
});

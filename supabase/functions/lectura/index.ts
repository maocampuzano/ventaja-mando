// Función de Supabase «lectura» (Deno). Recibe { lote } (una foto de planilla ya subida por el líder) con la sesión de
// quien la pide, la lee con Claude y deja las filas para revisión humana (regla 7). No crea personas: eso pasa solo
// cuando alguien aprueba la hoja (aprobar_planilla). Sin ANTHROPIC_API_KEY no lee: en el proyecto real nunca se usa
// la lectura simulada, para que no entren datos inventados.
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { ErrorLectura, MODELO_LECTURA_POR_DEFECTO, leerConClaude, type ImagenLectura } from "../../../packages/nucleo/src/lecturaClaude.ts";
import { alertasActa } from "../../../packages/nucleo/src/lectura.ts";

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
  let cuerpo: { lote?: string; acta?: string };
  try { cuerpo = await req.json(); } catch { return responder(400, { error: "La petición no es válida." }); }

  const url = Deno.env.get("SUPABASE_URL")!;
  const usuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const servicio = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (cuerpo.acta !== undefined) {
    const actaId = String(cuerpo.acta);
    if (!UUID.test(actaId)) return responder(400, { error: "Falta el acta." });
    const { data: u } = await usuario.auth.getUser();
    if (!u.user) return responder(401, { error: "La sesión venció. Vuelva a iniciar sesión." });
    return leerActa(usuario, servicio, u.user.id, actaId);
  }

  const loteId = String(cuerpo.lote ?? "");
  if (!UUID.test(loteId)) return responder(400, { error: "Falta la planilla." });
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
    // El costo se registra aunque el guardado falle: la lectura ya se pagó.
    await servicio.from("uso_ia").insert({
      campana_id: lote.campana_id, usuario_id: u.user.id, funcion: "lectura_planilla", modelo: r.uso.modelo,
      tokens_entrada: r.uso.entrada, tokens_salida: r.uso.salida, tokens_cache_lectura: r.uso.cacheLectura, costo_usd: r.uso.costoUsd,
    });
    const { data: filas, error: eg } = await servicio.rpc("guardar_lectura_planilla", { p_lote: loteId, p_filas: r.filas });
    if (eg) {
      // Otra lectura simultánea de la misma foto ya la guardó, o la hoja trae más de 50 filas.
      const mensaje = /ya se leyó/.test(eg.message) ? "Esta planilla ya se leyó." : "No se pudo guardar la lectura. Tome la foto de una sola hoja.";
      if (!/ya se leyó/.test(eg.message)) await servicio.from("lote_ocr").update({ lectura_error: mensaje }).eq("id", loteId);
      return responder(/ya se leyó/.test(eg.message) ? 409 : 500, { error: mensaje });
    }
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

type Cliente = ReturnType<typeof createClient>;

/** ¿Hay cupo de IA este mes? (10 USD si la campaña no tiene uno propio). */
async function hayCupo(servicio: Cliente, campana: string) {
  const [{ data: gasto }, { data: cupo }] = await Promise.all([
    servicio.rpc("gasto_ia_mes_servicio", { p_campana: campana }),
    servicio.from("cupo_ia").select("usd_mes").eq("campana_id", campana).maybeSingle(),
  ]);
  return Number(gasto ?? 0) < (cupo ? Number(cupo.usd_mes) : 10);
}

/**
 * Lee la foto de un E-14 y deja los números para que una persona los revise (regla 7). Pide la lectura quien maneja el
 * día E del puesto (dirección o coordinación); la foto y el guardado van con la llave del servidor.
 */
async function leerActa(usuario: Cliente, servicio: Cliente, usuarioId: string, actaId: string) {
  const { data: puede } = await usuario.rpc("puede_leer_e14", { p_acta: actaId });
  if (puede !== true) return responder(404, { error: "El acta no existe o no la puede leer." });
  const { data: acta } = await servicio.from("acta_e14").select("id, campana_id, foto_url, estado").eq("id", actaId).maybeSingle();
  if (!acta) return responder(404, { error: "El acta no existe o no la puede leer." });
  if (acta.estado !== "recibida") return responder(409, { error: "Esta acta ya se leyó o ya fue revisada." });

  const clave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!clave) return responder(503, { error: "La lectura con IA no está activa todavía. Digite los números desde la foto." });
  if (!(await hayCupo(servicio, acta.campana_id))) {
    return responder(429, { error: "La campaña llegó al cupo de IA de este mes. La gerencia puede pedir una ampliación." });
  }

  const { data: archivo, error: ea } = await servicio.storage.from("evidencias").download(acta.foto_url);
  if (ea || !archivo) return responder(404, { error: "No se encontró la foto del acta." });
  if (archivo.size > MAX_BYTES) return responder(413, { error: "La foto pesa más de 5 MB. Pida al testigo que la tome de nuevo." });
  const mediaType = tipoImagen(acta.foto_url, archivo.type);
  if (!mediaType) return responder(415, { error: "La foto debe ser JPG, PNG o WebP." });

  try {
    const r = await leerConClaude(new Anthropic({ apiKey: clave }), "e14",
      { base64: base64(new Uint8Array(await archivo.arrayBuffer())), mediaType },
      Deno.env.get("MODELO_LECTURA") || MODELO_LECTURA_POR_DEFECTO);
    if (r.tipo !== "e14") throw new ErrorLectura("Respuesta inesperada.");
    // El costo se registra aunque el guardado falle: la lectura ya se pagó.
    await servicio.from("uso_ia").insert({
      campana_id: acta.campana_id, usuario_id: usuarioId, funcion: "lectura_e14", modelo: r.uso.modelo,
      tokens_entrada: r.uso.entrada, tokens_salida: r.uso.salida, tokens_cache_lectura: r.uso.cacheLectura, costo_usd: r.uso.costoUsd,
    });
    const alertas = alertasActa(r.acta);
    const { error: eg } = await servicio.rpc("guardar_lectura_e14", { p_acta: actaId, p_lectura: r.acta, p_alertas: alertas.length });
    if (eg) {
      const ya = /ya se leyó/.test(eg.message);
      return responder(ya ? 409 : 500, { error: ya ? "Esta acta ya se leyó o ya fue revisada." : "No se pudo guardar la lectura." });
    }
    return responder(200, { alertas });
  } catch (e) {
    const mensaje = e instanceof ErrorLectura ? e.message
      : e instanceof Anthropic.RateLimitError ? "La lectura está muy ocupada. Intente en un minuto."
      : "No se pudo leer la foto. Intente de nuevo o digite los números.";
    if (!(e instanceof ErrorLectura)) console.error(e instanceof Anthropic.APIError ? `Error de la API de Claude: ${e.status}` : "Error inesperado en la lectura del E-14");
    return responder(502, { error: mensaje });
  }
}

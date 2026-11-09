// Función de Supabase «enviar» (Deno). Recibe { envio } con la sesión de quien pide (la dirección), verifica el
// horario y el proveedor, pide un lote a la base (lote_para_enviar, que vuelve a verificar autorización y baja) y lo
// envía. Cada llamada envía hasta 100 mensajes; el panel la repite hasta que no quede nada pendiente.
//
// Proveedores: todavía no hay ninguno contratado (V2). Para activar uno, se agrega su adaptador en PROVEEDORES y se
// cargan sus secretos (SMS_PROVEEDOR o CORREO_PROVEEDOR y sus claves). Sin proveedor, no se envía nada.
import { createClient } from "@supabase/supabase-js";
import { dentroDeHorario } from "../../../packages/nucleo/src/mensajeria.ts";
import { enviarLote, type FilaLote, type Proveedor } from "../../../packages/nucleo/src/envio.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const responder = (estado: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOTE = 100;

/** Adaptadores por nombre. Se llenan cuando Mauricio elija los proveedores (V2). */
const PROVEEDORES: Record<string, (env: (k: string) => string | undefined) => Proveedor> = {};

function proveedorPara(canal: "sms" | "email"): Proveedor | null {
  const nombre = Deno.env.get(canal === "sms" ? "SMS_PROVEEDOR" : "CORREO_PROVEEDOR");
  const crear = nombre ? PROVEEDORES[nombre] : undefined;
  return crear ? crear((k) => Deno.env.get(k)) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder(405, { error: "Use POST." });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return responder(401, { error: "Inicie sesión." });
  let cuerpo: { envio?: string };
  try { cuerpo = await req.json(); } catch { return responder(400, { error: "La petición no es válida." }); }
  const envioId = String(cuerpo.envio ?? "");
  if (!UUID.test(envioId)) return responder(400, { error: "Falta el envío." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const usuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const servicio = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: u } = await usuario.auth.getUser();
  if (!u.user) return responder(401, { error: "La sesión venció. Vuelva a iniciar sesión." });

  const { data: puede } = await usuario.rpc("puede_enviar", { p_envio: envioId });
  if (puede !== true) return responder(404, { error: "El envío no existe o no lo puede enviar." });
  const { data: envio } = await servicio.from("envio")
    .select("id, canal, cuerpo, asunto, estado, campana:campana_id(nombre)").eq("id", envioId).single();
  if (!envio) return responder(404, { error: "El envío no existe o no lo puede enviar." });
  if (envio.estado !== "aprobado" && envio.estado !== "enviando") return responder(409, { error: "Solo se envía un envío aprobado." });

  const horario = dentroDeHorario(new Date());
  if (!horario.permitido) return responder(409, { error: `${horario.motivo} El envío queda aprobado y puede enviarlo en horario.` });

  const proveedor = proveedorPara(envio.canal as "sms" | "email");
  if (!proveedor) {
    return responder(503, {
      error: envio.canal === "sms"
        ? "Todavía no hay un proveedor de SMS contratado: no se envió nada. El envío queda aprobado."
        : "Todavía no hay un proveedor de correo contratado: no se envió nada. El envío queda aprobado.",
    });
  }

  const { data: filas, error: el } = await servicio.rpc("lote_para_enviar", { p_envio: envioId, p_limite: LOTE });
  if (el) return responder(500, { error: "No se pudo preparar el lote." });
  const lote: FilaLote[] = (filas as { destinatario_id: string; nombre: string; destino: string | null; token_baja: string }[])
    .map((f) => ({ destinatarioId: f.destinatario_id, nombre: f.nombre, destino: f.destino, tokenBaja: f.token_baja }));

  const r = await enviarLote(proveedor, lote, {
    canal: envio.canal as "sms" | "email", plantilla: envio.cuerpo, asunto: envio.asunto,
    campana: (envio.campana as unknown as { nombre: string }).nombre,
    urlPanel: Deno.env.get("PANEL_URL") || "https://ventaja-mando-prueba.pages.dev",
  }, async (id, enviado, ref, error) => {
    await servicio.rpc("registrar_resultado_envio", { p_destinatario: id, p_enviado: enviado, p_ref: ref, p_error: error });
  });
  const { count } = await servicio.from("envio_destinatario").select("id", { count: "exact", head: true })
    .eq("envio_id", envioId).eq("estado", "pendiente");
  return responder(200, { ...r, pendientes: count ?? 0 });
});

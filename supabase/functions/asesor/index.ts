// Función de Supabase «asesor» (Deno). Recibe { campana, pregunta } con la sesión de quien pregunta y devuelve una
// RespuestaAsesor. La clave de Anthropic vive solo aquí (secreto de la función), nunca en el navegador.
//
// 1. Verifica la sesión, el rol y el cupo del mes (estado_asesor).
// 2. Lee el tablero con la sesión de quien pregunta: la RLS y las funciones del tablero recortan a su alcance.
// 3. Arma los datos agregados (sin nombres de líderes: referencias L-…) y pregunta a Claude con herramientas.
//    Sin ANTHROPIC_API_KEY, responde el modelo simulado.
// 4. Registra el uso y el costo con la clave de servicio.
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { armarDatosAsesor, responderSimulado, type RespuestaAsesor } from "../../../packages/nucleo/src/asesor.ts";
import { MODELO_ASESOR_POR_DEFECTO, responderConClaude } from "../../../packages/nucleo/src/asesorClaude.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const responder = (estado: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const n = (x: unknown) => Number(x ?? 0) || 0;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder(405, { error: "Use POST." });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return responder(401, { error: "Inicie sesión." });
  let cuerpo: { campana?: string; pregunta?: string };
  try { cuerpo = await req.json(); } catch { return responder(400, { error: "La petición no es válida." }); }
  const campana = String(cuerpo.campana ?? "");
  const pregunta = String(cuerpo.pregunta ?? "").trim();
  if (!UUID.test(campana) || !pregunta) return responder(400, { error: "Falta la campaña o la pregunta." });
  if (pregunta.length > 500) return responder(400, { error: "La pregunta es muy larga (máximo 500 caracteres)." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const usuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const servicio = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: u } = await usuario.auth.getUser();
  if (!u.user) return responder(401, { error: "La sesión venció. Vuelva a iniciar sesión." });

  const { data: estado, error: ee } = await usuario.rpc("estado_asesor", { p_campana: campana }).single<{ permitido: boolean }>();
  if (ee || !estado?.permitido) return responder(403, { error: "El Asesor IA no está disponible para su rol en esta campaña." });
  // El cupo se mide con la clave de servicio: la coordinación usa el Asesor IA pero no ve el gasto.
  const [{ data: gasto }, { data: cupo }] = await Promise.all([
    servicio.rpc("gasto_ia_mes_servicio", { p_campana: campana }),
    servicio.from("cupo_ia").select("usd_mes").eq("campana_id", campana).maybeSingle(),
  ]);
  const cupoUsd = cupo ? n(cupo.usd_mes) : 10;
  if (n(gasto) >= cupoUsd) {
    return responder(429, { error: "La campaña llegó al cupo de IA de este mes. La gerencia puede pedir una ampliación." });
  }

  const [c, z, l, m] = await Promise.all([
    usuario.from("campana").select("nombre, cargo, eleccion_fecha, meta_votos").eq("id", campana).single(),
    usuario.rpc("tablero_zonas", { p_campana: campana }),
    usuario.rpc("tablero_lideres", { p_campana: campana }),
    usuario.from("membresia").select("rol").eq("campana_id", campana).eq("usuario_id", u.user.id).eq("activa", true).maybeSingle(),
  ]);
  if (c.error || z.error || l.error) return responder(502, { error: "No se pudieron leer los datos de la campaña." });

  // Como en el tablero: quien ve toda la campaña se mide contra su meta; la coordinación, contra la de sus zonas.
  const filasZonas = z.data as Record<string, unknown>[];
  const veTodo = ["administrador", "gerente", "candidato"].includes(String(m.data?.rol ?? ""));
  const meta = veTodo ? n(c.data.meta_votos) : filasZonas.reduce((s, f) => s + n(f.meta), 0);
  const datos = armarDatosAsesor(
    { candidato: c.data.nombre, cargo: c.data.cargo, metaVotos: meta, eleccion: c.data.eleccion_fecha ?? "" },
    filasZonas.map((f) => ({
      id: String(f.territorio_id), nombre: String(f.nombre), meta: n(f.meta), potencial: n(f.potencial), bruto: n(f.bruto),
      validados: n(f.validados), comprometidos: n(f.comprometidos), lideres: n(f.lideres), alcance: n(f.alcance), clics: n(f.clics), gasto: n(f.gasto),
    })),
    (l.data as Record<string, unknown>[]).map((f) => ({
      id: String(f.lider_id), zonaId: String((f.territorio_ids as string[] | null)?.[0] ?? ""), registrados: n(f.registrados),
      validados: n(f.validados), duplicadosConOtros: n(f.duplicados_con_otros), tareasHechas: n(f.tareas_hechas),
      tareasAsignadas: n(f.tareas_asignadas), meta: n(f.meta),
    })),
  );

  const clave = Deno.env.get("ANTHROPIC_API_KEY");
  let respuesta: RespuestaAsesor;
  if (!clave) {
    respuesta = responderSimulado(pregunta, datos);
  } else {
    try {
      respuesta = await responderConClaude(new Anthropic({ apiKey: clave }), pregunta, datos,
        Deno.env.get("MODELO_ASESOR") || MODELO_ASESOR_POR_DEFECTO);
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return responder(503, { error: "El Asesor IA está muy ocupado. Intente en un minuto." });
      if (e instanceof Anthropic.AuthenticationError) {
        console.error("ANTHROPIC_API_KEY no es válida");
        return responder(503, { error: "El Asesor IA no está bien configurado. Avise al administrador." });
      }
      if (e instanceof Anthropic.APIError) console.error(`Error de la API de Claude: ${e.status}`);
      else console.error("Error inesperado en el Asesor IA");
      return responder(502, { error: "El Asesor IA no pudo responder. Intente de nuevo." });
    }
    if (respuesta.uso) {
      const { error } = await servicio.from("uso_ia").insert({
        campana_id: campana, usuario_id: u.user.id, funcion: "asesor", modelo: respuesta.modelo,
        tokens_entrada: respuesta.uso.entrada, tokens_salida: respuesta.uso.salida,
        tokens_cache_lectura: respuesta.uso.cacheLectura, costo_usd: respuesta.uso.costoUsd,
      });
      if (error) console.error("No se pudo registrar el uso de IA");
    }
  }
  return responder(200, respuesta);
});

// Mensajes con el proyecto real: funciones de la base para armar, aprobar y cancelar, y la función del servidor
// «enviar» para mandar cada lote. Los permisos los pone la base.
import { FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import { segmentoParaBase, type SegmentoEnvio } from "@ventaja/nucleo";
import type { Envio, FuenteDatos, ResumenEnvio } from "./tipos";

type Metodos = Pick<FuenteDatos, "envios" | "contarDestinatarios" | "crearEnvio" | "aprobarEnvio" | "cancelarEnvio" | "enviarLote" | "darseDeBaja">;

const segmentoDesdeBase = (j: { territorio_ids?: string[]; lider_ids?: string[]; estados?: SegmentoEnvio["estados"] }): SegmentoEnvio =>
  ({ territorioIds: j.territorio_ids, liderIds: j.lider_ids, estados: j.estados });

export function mensajesSupabase(sb: SupabaseClient): Metodos {
  return {
    async envios(s) {
      const { data, error } = await sb.from("envio").select("id, canal, nombre, asunto, cuerpo, segmento, estado, creado_en")
        .eq("campana_id", s.campana.id).order("creado_en", { ascending: false }).limit(50);
      if (error) throw new Error(`No se pudieron leer los envíos: ${error.message}`);
      return Promise.all((data ?? []).map(async (e): Promise<Envio> => {
        const { data: r } = await sb.rpc("resumen_envio", { p_envio: e.id });
        return {
          id: e.id, canal: e.canal, nombre: e.nombre, asunto: e.asunto, cuerpo: e.cuerpo, segmento: segmentoDesdeBase(e.segmento ?? {}),
          estado: e.estado, creado: e.creado_en,
          resumen: (r as ResumenEnvio | null) ?? { total: 0, pendientes: 0, enviados: 0, fallidos: 0, omitidos: 0 },
        };
      }));
    },
    async contarDestinatarios(s, canal, seg) {
      const { data, error } = await sb.rpc("contar_destinatarios", { p_campana: s.campana.id, p_canal: canal, p_segmento: segmentoParaBase(seg) });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    async crearEnvio(s, d) {
      const { data, error } = await sb.rpc("crear_envio", {
        p_campana: s.campana.id, p_canal: d.canal, p_nombre: d.nombre, p_asunto: d.asunto ?? null, p_cuerpo: d.cuerpo,
        p_segmento: segmentoParaBase(d.segmento),
      });
      if (error) throw new Error(error.code === "23514" ? "El mensaje no cumple las reglas (sin WhatsApp; el correo necesita asunto)." : error.message);
      return data as string;
    },
    async aprobarEnvio(_s, id) {
      const { data, error } = await sb.rpc("aprobar_envio", { p_envio: id });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    async cancelarEnvio(_s, id) {
      const { error } = await sb.rpc("cancelar_envio", { p_envio: id });
      if (error) throw new Error(error.message);
    },
    async enviarLote(_s, id) {
      const { data, error } = await sb.functions.invoke<{ enviados: number; fallidos: number; pendientes: number }>("enviar", { body: { envio: id } });
      if (!error && data) return data;
      if (error instanceof FunctionsHttpError) {
        let mensaje = "No se pudo enviar.";
        try { mensaje = ((await error.context.json()) as { error?: string }).error ?? mensaje; } catch { /* sin cuerpo */ }
        throw new Error(mensaje);
      }
      throw new Error("El envío por SMS y correo no está activo todavía: no se envió nada.");
    },
    async darseDeBaja(token) {
      const { data, error } = await sb.rpc("darse_de_baja", { p_token: token });
      if (error) throw new Error(error.code === "22023" ? "El enlace no es válido." : "No se pudo registrar la baja. Intente de nuevo.");
      return data as string;
    },
  };
}

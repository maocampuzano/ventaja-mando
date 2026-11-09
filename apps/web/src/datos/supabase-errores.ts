// Errores y auditoría con el proyecto real (funciones de la base; solo la dirección consulta).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FuenteDatos } from "./tipos";

type Metodos = Pick<FuenteDatos, "registrarError" | "erroresRecientes" | "auditoria">;

export function erroresSupabase(sb: SupabaseClient): Metodos {
  return {
    async registrarError(s, e) {
      try {
        await sb.rpc("registrar_error", { p_campana: s.campana.id, p_mensaje: e.mensaje, p_pila: e.pila, p_ruta: e.ruta, p_version: e.version, p_navegador: e.navegador });
      } catch { /* si no se puede guardar, no se molesta a nadie */ }
    },
    async erroresRecientes(s) {
      const { data, error } = await sb.rpc("errores_recientes", { p_campana: s.campana.id });
      if (error) throw new Error(error.message);
      return ((data ?? []) as { mensaje: string; veces: number; personas: number; ultima: string; ruta: string | null; version: string | null; pila: string | null }[])
        .map((e) => ({ mensaje: e.mensaje, veces: Number(e.veces), personas: Number(e.personas), ultima: e.ultima, ruta: e.ruta ?? "", version: e.version ?? "", pila: e.pila ?? "" }));
    },
    async auditoria(s, f) {
      const { data, error } = await sb.rpc("auditoria_campana", {
        p_campana: s.campana.id, p_accion: f.accion || null, p_desde: f.desde || null, p_hasta: f.hasta || null, p_antes: f.antes ?? null, p_limite: 50,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as { id: number; en: string; usuario: string; accion: string; entidad: string; entidad_id: string | null; detalle: Record<string, unknown> }[])
        .map((a) => ({ id: Number(a.id), en: a.en, usuario: a.usuario, accion: a.accion, entidad: a.entidad, entidadId: a.entidad_id, detalle: a.detalle ?? {} }));
    },
  };
}

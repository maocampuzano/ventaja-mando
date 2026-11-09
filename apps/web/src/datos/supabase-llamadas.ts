// Telemarketing con el proyecto real. Los permisos los pone la base: el operador solo recibe una persona a la vez
// por siguiente_llamada y nunca lee la base de personas.
import type { SupabaseClient } from "@supabase/supabase-js";
import { segmentoParaBase, type ResumenCola } from "@ventaja/nucleo";
import type { FuenteDatos } from "./tipos";

type Metodos = Pick<FuenteDatos, "colas" | "crearCola" | "asignarOperadores" | "cambiarEstadoCola" | "misColas" | "siguienteLlamada" | "registrarLlamada">;

const VACIO: ResumenCola = {
  total: 0, pendientes: 0, enCurso: 0, hechas: 0, reintentar: 0, descartadas: 0,
  hoy: { contesto: 0, acepto_actividad: 0, volver_a_llamar: 0, no_contesto: 0, numero_equivocado: 0, no_volver_a_llamar: 0 },
};
const falla = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

export function llamadasSupabase(sb: SupabaseClient): Metodos {
  return {
    async colas(s) {
      const { data, error } = await sb.from("cola_llamadas").select("id, nombre, guion, estado, creado_en, cola_operador(usuario_id)")
        .eq("campana_id", s.campana.id).order("creado_en", { ascending: false });
      falla(error);
      return Promise.all((data ?? []).map(async (c) => {
        const { data: r } = await sb.rpc("resumen_cola", { p_cola: c.id });
        const j = (r ?? {}) as { total?: number; pendientes?: number; en_curso?: number; hechas?: number; reintentar?: number; descartadas?: number; hoy?: Partial<ResumenCola["hoy"]> };
        return {
          id: c.id, nombre: c.nombre, guion: c.guion, estado: c.estado, creado: c.creado_en,
          operadores: ((c.cola_operador ?? []) as { usuario_id: string }[]).map((o) => o.usuario_id),
          resumen: {
            total: j.total ?? 0, pendientes: j.pendientes ?? 0, enCurso: j.en_curso ?? 0, hechas: j.hechas ?? 0,
            reintentar: j.reintentar ?? 0, descartadas: j.descartadas ?? 0, hoy: { ...VACIO.hoy, ...j.hoy },
          },
        };
      }));
    },
    async crearCola(s, d) {
      const { data, error } = await sb.rpc("crear_cola", { p_campana: s.campana.id, p_nombre: d.nombre, p_guion: d.guion, p_segmento: segmentoParaBase(d.segmento) });
      falla(error);
      const r = data as { id: string; personas: number };
      return { id: r.id, personas: Number(r.personas) };
    },
    async asignarOperadores(_s, colaId, operadores) {
      falla((await sb.rpc("asignar_operadores", { p_cola: colaId, p_usuarios: operadores })).error);
    },
    async cambiarEstadoCola(_s, colaId, estado) {
      falla((await sb.rpc("cambiar_estado_cola", { p_cola: colaId, p_estado: estado })).error);
    },
    async misColas(s) {
      const { data, error } = await sb.rpc("mis_colas", { p_campana: s.campana.id });
      falla(error);
      return ((data ?? []) as { cola_id: string; nombre: string; estado: "activa" | "pausada" | "cerrada"; por_llamar: number }[])
        .map((c) => ({ id: c.cola_id, nombre: c.nombre, estado: c.estado, porLlamar: Number(c.por_llamar) }));
    },
    async siguienteLlamada(_s, colaId) {
      const { data, error } = await sb.rpc("siguiente_llamada", { p_cola: colaId });
      falla(error);
      const f = (data as { item_id: string; nombre: string; telefono: string; intentos: number; guion: string | null }[])[0];
      return f ? { itemId: f.item_id, nombre: f.nombre, telefono: f.telefono, intentos: f.intentos, guion: f.guion } : null;
    },
    async registrarLlamada(_s, itemId, resultado) {
      falla((await sb.rpc("registrar_llamada", { p_item: itemId, p_resultado: resultado })).error);
    },
  };
}

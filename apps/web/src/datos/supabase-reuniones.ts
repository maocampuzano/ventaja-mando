// Reuniones y actas con el proyecto real. Los permisos los pone la base (RLS y funciones de
// supabase/migrations/…_reuniones.sql); aquí solo se traduce entre la base y el panel.
import { FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import { redaccionSimulada, type ActaPropuesta, type RolCampana } from "@ventaja/nucleo";
import type { ActaReunion, FuenteDatos, Reunion } from "./tipos";

type Metodos = Pick<FuenteDatos, "reuniones" | "guardarReunion" | "actaDeReunion" | "guardarActa" | "aprobarActa" | "redactarActa"
  | "buscarActas" | "resumenReuniones" | "equipoReuniones">;

const falla = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

export function reunionesSupabase(sb: SupabaseClient): Metodos {
  return {
    async reuniones(s) {
      const { data, error } = await sb.from("reunion")
        .select("id, titulo, tipo, fecha, lugar, territorio_id, estado, asistentes_comunidad, reunion_asistente(usuario_id, lider_id), acta(id, estado)")
        .eq("campana_id", s.campana.id).order("fecha", { ascending: false }).limit(300);
      falla(error);
      return (data ?? []).map((r): Reunion => {
        const asis = (r.reunion_asistente ?? []) as { usuario_id: string | null; lider_id: string | null }[];
        const acta = (Array.isArray(r.acta) ? r.acta[0] : r.acta) as { id: string; estado: "borrador" | "aprobada" } | null;
        return {
          id: r.id, titulo: r.titulo, tipo: r.tipo, fecha: r.fecha, lugar: r.lugar, territorioId: r.territorio_id, estado: r.estado,
          asistentesComunidad: r.asistentes_comunidad,
          liderIds: asis.flatMap((a) => (a.lider_id ? [a.lider_id] : [])), equipoIds: asis.flatMap((a) => (a.usuario_id ? [a.usuario_id] : [])),
          acta: acta ?? null,
        };
      });
    },
    async guardarReunion(s, d) {
      const { data, error } = await sb.rpc("guardar_reunion", {
        p_campana: s.campana.id, p_id: d.id ?? null, p_titulo: d.titulo, p_tipo: d.tipo, p_fecha: d.fecha, p_lugar: d.lugar,
        p_territorio: d.territorioId, p_estado: d.estado, p_asistentes_comunidad: d.asistentesComunidad,
        p_lideres: d.liderIds, p_equipo: d.equipoIds,
      });
      falla(error);
      return data as string;
    },
    async actaDeReunion(_s, reunionId) {
      const { data, error } = await sb.from("acta")
        .select("id, reunion_id, resumen, temas, acuerdos, estado, origen, aprobada_en, acta_compromiso(descripcion, responsable_id, vence_en, tarea_id)")
        .eq("reunion_id", reunionId).maybeSingle();
      falla(error);
      if (!data) return null;
      const acta: ActaReunion = {
        id: data.id, reunionId: data.reunion_id, resumen: data.resumen, temas: data.temas ?? [], acuerdos: data.acuerdos,
        estado: data.estado, origen: data.origen, aprobadaEn: data.aprobada_en,
        compromisos: ((data.acta_compromiso ?? []) as { descripcion: string; responsable_id: string | null; vence_en: string | null; tarea_id: string | null }[])
          .map((c) => ({ descripcion: c.descripcion, responsableId: c.responsable_id, venceEn: c.vence_en, tareaId: c.tarea_id })),
      };
      return acta;
    },
    async guardarActa(_s, reunionId, d) {
      const { data, error } = await sb.rpc("guardar_acta", {
        p_reunion: reunionId, p_resumen: d.resumen, p_temas: d.temas, p_acuerdos: d.acuerdos, p_origen: d.origen,
        p_compromisos: d.compromisos.map((c) => ({ descripcion: c.descripcion, responsable_id: c.responsableId, vence_en: c.venceEn })),
      });
      falla(error);
      return data as string;
    },
    async aprobarActa(_s, actaId) {
      const { data, error } = await sb.rpc("aprobar_acta", { p_acta: actaId });
      falla(error);
      return Number(data ?? 0);
    },
    async redactarActa(s, reunionId, notas, foto) {
      let adjunto: string | null = null;
      if (foto) {
        const extension = foto.type === "image/png" ? "png" : "jpg";
        adjunto = `${s.campana.id}/${reunionId}/${crypto.randomUUID()}.${extension}`;
        const { error: es } = await sb.storage.from("actas").upload(adjunto, foto, { contentType: foto.type || "image/jpeg" });
        if (es) throw new Error(`No se pudo subir la foto del acta: ${es.message}`);
        const { error: er } = await sb.rpc("registrar_adjunto_acta", { p_reunion: reunionId, p_ruta: adjunto, p_tipo: "acta_escrita" });
        falla(er);
      }
      const { data, error } = await sb.functions.invoke<{ acta: ActaPropuesta }>("lectura", { body: { reunion: reunionId, notas, adjunto } });
      if (!error && data) return data.acta;
      let mensaje = "No se pudo redactar el acta.";
      let estado = 0;
      if (error instanceof FunctionsHttpError) {
        estado = error.context.status;
        try { mensaje = ((await error.context.json()) as { error?: string }).error ?? mensaje; } catch { /* sin cuerpo */ }
      }
      // Sin la IA activa: se ordenan las notas tal como están, sin inventar nada, y se dice.
      if (estado === 503 && notas.trim()) {
        return { ...redaccionSimulada(notas), aviso: "La IA no está activa todavía: esta propuesta solo ordena sus notas." };
      }
      throw new Error(mensaje);
    },
    async buscarActas(s, f) {
      const { data, error } = await sb.rpc("buscar_actas", {
        p_campana: s.campana.id, p_texto: f.texto || null, p_territorio: f.territorioId || null, p_desde: f.desde || null, p_hasta: f.hasta || null,
      });
      falla(error);
      return ((data ?? []) as { reunion_id: string; acta_id: string; titulo: string; fecha: string; territorio: string | null; temas: string[]; extracto: string }[])
        .map((r) => ({ reunionId: r.reunion_id, actaId: r.acta_id, titulo: r.titulo, fecha: r.fecha, territorio: r.territorio, temas: r.temas ?? [], extracto: r.extracto }));
    },
    async resumenReuniones(s) {
      const { data, error } = await sb.rpc("resumen_reuniones", { p_campana: s.campana.id });
      falla(error);
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        territorioId: (r.territorio_id as string | null) ?? null, reuniones30d: Number(r.reuniones_30d ?? 0), actasAprobadas: Number(r.actas_aprobadas ?? 0),
        actasPorAprobar: Number(r.actas_por_aprobar ?? 0), compromisosVencidos: Number(r.compromisos_vencidos ?? 0),
        asistentesComunidad: Number(r.asistentes_comunidad ?? 0), temas: (r.temas as string[]) ?? [],
      }));
    },
    async equipoReuniones(s) {
      // La dirección lee el equipo completo; los demás, lo que la base les deje ver (al menos su propia membresía).
      const { data } = await sb.from("membresia").select("usuario_id, rol, activa, usuario:usuario_id(nombre)").eq("campana_id", s.campana.id);
      const equipo = (data ?? []).filter((m) => m.activa && !["lider", "testigo", "operador"].includes(m.rol)).map((m) => ({
        usuarioId: m.usuario_id as string, rol: m.rol as RolCampana,
        nombre: (m.usuario as unknown as { nombre: string } | null)?.nombre ?? "(sin nombre)",
      }));
      return equipo.length ? equipo : [{ usuarioId: s.usuarioId, nombre: s.nombre, rol: s.rol }];
    },
  };
}

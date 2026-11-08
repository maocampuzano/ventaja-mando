// Día E con el proyecto real: el tablero agregado por mesa (public.tablero_dia_e), las funciones de novedades,
// simulacro y revisión del E-14, y el tiempo real de Supabase. Los permisos los pone la base.
import type { SupabaseClient } from "@supabase/supabase-js";
import { alertasActa, cumplimientoDesdeTotales, jornadaBogota, type ActaLeida, type EstadoActa, type EstadoNovedad, type EstadoTestigo, type Prioridad } from "@ventaja/nucleo";
import type { FuenteDatos, MesaTablero } from "./tipos";

type MetodosDiaE = Pick<FuenteDatos, "tableroDiaE" | "simulacroActivo" | "iniciarSimulacro" | "terminarSimulacro" |
  "atenderNovedad" | "escalarNovedades" | "actaE14" | "revisarE14" | "suscribirDiaE" | "relojDiaE" |
  "cumplimientoE14" | "configurarOpcionesE14">;

type FilaMesa = {
  puesto_id: string; puesto: string; mesa: number; votos_historicos_puesto: number; mesas_puesto: number;
  testigo: EstadoTestigo | null; llegada_en: string | null; acta_id: string | null; acta: EstadoActa | null; alertas: number;
  novedades: { id: string; tipo: string; prioridad: Prioridad; estado: EstadoNovedad; hora: string; escalada_en: string | null; responsable_id: string | null }[];
};

const HORA_SIMULACRO = 60; // minutos de «jornada» de un simulacro, desde que se inicia
const MIN = 60_000;
const error = (prefijo: string, e: { message: string } | null) => { if (e) throw new Error(`${prefijo}: ${e.message}`); };

/** Lo que la IA o la revisión anterior dejaron en extraccion_json, si tiene la forma de un acta. */
function actaDe(json: unknown): ActaLeida | null {
  const j = (json ?? null) as { revision?: unknown } & Partial<ActaLeida> | null;
  const a = (j?.revision ?? j) as Partial<ActaLeida> | null;
  if (!a || !Array.isArray(a.votos)) return null;
  return {
    mesa: a.mesa ?? null, votos: a.votos, blancos: a.blancos ?? null, nulos: a.nulos ?? null, noMarcados: a.noMarcados ?? null,
    totalVotos: a.totalVotos ?? null, sufragantes: a.sufragantes ?? null, confianza: typeof a.confianza === "number" ? a.confianza : 1,
  };
}

export function diaESupabase(sb: SupabaseClient): MetodosDiaE {
  return {
    async tableroDiaE(s, simulacro) {
      const { data, error: e } = await sb.rpc("tablero_dia_e", { p_campana: s.campana.id, p_simulacro: simulacro });
      error("No se pudo leer el tablero del día E", e);
      return (data as FilaMesa[]).map((f): MesaTablero => ({
        puestoId: f.puesto_id, mesa: f.mesa, puesto: f.puesto,
        // El histórico llega por puesto: se reparte entre sus mesas para priorizar la cobertura.
        votosHistoricos: f.mesas_puesto ? Math.round(Number(f.votos_historicos_puesto) / f.mesas_puesto) : 0,
        testigo: f.testigo, llegadaEn: f.llegada_en ? new Date(f.llegada_en) : null,
        actaId: f.acta_id, acta: f.acta, alertasActa: f.alertas,
        novedades: f.novedades.map((n) => ({
          id: n.id, tipo: n.tipo, prioridad: n.prioridad, estado: n.estado, hora: new Date(n.hora),
          escaladaEn: n.escalada_en ? new Date(n.escalada_en) : null, responsableId: n.responsable_id,
        })),
      }));
    },
    async simulacroActivo(s) {
      const { data, error: e } = await sb.from("simulacro").select("id, iniciado_en")
        .eq("campana_id", s.campana.id).is("terminado_en", null).maybeSingle();
      error("No se pudo saber si hay un simulacro", e);
      return data ? { id: data.id as string, iniciado: data.iniciado_en as string } : null;
    },
    async iniciarSimulacro(s) {
      const { error: e } = await sb.rpc("iniciar_simulacro", { p_campana: s.campana.id });
      if (e) throw new Error(e.message);
    },
    async terminarSimulacro(s) {
      const { data, error: e } = await sb.rpc("terminar_simulacro", { p_campana: s.campana.id });
      if (e) throw new Error(e.message);
      return data as { novedades: number; actas: number; testigos: number };
    },
    async atenderNovedad(_s, id, estado, responsableId) {
      const { error: e } = await sb.rpc("atender_incidencia", { p_id: id, p_estado: estado, p_responsable: responsableId ?? null });
      if (e) throw new Error(e.message);
    },
    async escalarNovedades(s) {
      const { data, error: e } = await sb.rpc("escalar_incidencias", { p_campana: s.campana.id });
      if (e) throw new Error(e.message);
      return Number(data ?? 0);
    },
    async actaE14(s, id) {
      const { data, error: e } = await sb.from("acta_e14")
        .select("id, mesa, estado, foto_url, extraccion_json, creado_por, puesto:puesto_id(nombre)").eq("id", id).single();
      if (e || !data) throw new Error("El acta no existe o no la puede ver.");
      let foto: string | null = null;
      if (!String(data.foto_url).startsWith("semilla://")) {
        const { data: firmada } = await sb.storage.from("evidencias").createSignedUrl(data.foto_url as string, 600);
        foto = firmada?.signedUrl ?? null;
      }
      const puesto = data.puesto as unknown as { nombre: string } | null;
      return {
        id, puesto: puesto?.nombre ?? "—", mesa: data.mesa as number, estado: data.estado as string, foto,
        lectura: actaDe(data.extraccion_json), subidaPorMi: data.creado_por === s.usuarioId,
      };
    },
    async revisarE14(_s, id, acta) {
      const { error: e } = await sb.rpc("revisar_e14", {
        p_id: id, p_numeros: acta, p_alertas: acta ? alertasActa(acta).length : 0, p_descartar: acta === null,
      });
      if (e) throw new Error(e.message);
    },
    suscribirDiaE(s, alCambiar) {
      const filtro = `campana_id=eq.${s.campana.id}`;
      let canal = sb.channel(`dia-e-${s.campana.id}-${Math.random().toString(36).slice(2)}`);
      for (const tabla of ["incidencia", "acta_e14", "testigo", "simulacro"]) {
        canal = canal.on("postgres_changes", { event: "*", schema: "public", table: tabla, filter: filtro }, () => alCambiar());
      }
      canal.subscribe();
      return () => { void sb.removeChannel(canal); };
    },
    async cumplimientoE14(s) {
      const { data: c, error: ec } = await sb.from("campana").select("opcion_e14, opcion_historica").eq("id", s.campana.id).single();
      error("No se pudo leer la campaña", ec);
      const base = { opcionE14: (c?.opcion_e14 as string | null) ?? null, opcionHistorica: (c?.opcion_historica as string | null) ?? null };
      if (!base.opcionE14) return { ...base, lideres: [] };
      const { data, error: e } = await sb.rpc("cumplimiento_lideres_e14", { p_campana: s.campana.id });
      if (e) throw new Error(e.message);
      return {
        ...base,
        lideres: (data as { lider_id: string; nombre: string; mesas: number; apoyos: number; votos: number | null;
          votos_historicos: number | null; mesas_sin_historico: number | null }[]).map((f) => ({
          liderId: f.lider_id, nombre: f.nombre,
          resultado: cumplimientoDesdeTotales({
            mesas: f.mesas, apoyos: f.apoyos, votos: f.votos ?? 0, votosHistoricos: f.votos_historicos,
            mesasSinHistorico: f.mesas_sin_historico ?? f.mesas,
          }),
        })),
      };
    },
    async configurarOpcionesE14(s, opcionE14, opcionHistorica) {
      const { error: e } = await sb.rpc("configurar_opciones_e14", { p_campana: s.campana.id, p_opcion_e14: opcionE14, p_opcion_historica: opcionHistorica });
      if (e) throw new Error(e.message);
    },
    relojDiaE(s, simulacro) {
      const ahora = new Date();
      if (!simulacro) return { ahora, jornada: jornadaBogota(s.campana.eleccion) };
      const apertura = new Date(simulacro.iniciado);
      return { ahora, jornada: { apertura, cierre: new Date(apertura.getTime() + HORA_SIMULACRO * MIN) } };
    },
  };
}

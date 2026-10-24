// Fuente «supabase»: el proyecto real. La seguridad la pone la base (RLS y funciones con alcance por rol);
// aquí solo se piden los datos. El tablero llega agregado por zona y por líder: nunca personas una por una.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { exige2fa, indiceLider, type RolCampana } from "@ventaja/nucleo";
import type { Lider, Zona } from "../data";
import type { RolCampana as Rol } from "@ventaja/nucleo";
import type { TipoSolicitud } from "@ventaja/nucleo";
import type {
  Campana, DatosTablero, EstadoSolicitud, Exportacion, FuenteDatos, Ingreso, InvitacionPendiente, Miembro, ResultadoImportacion,
  ResumenCumplimiento, Solicitud,
} from "./tipos";

/** Fecha de Colombia (aaaa-mm-dd) de un timestamp. */
const fechaBogota = (t: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(t));

const LOTE = 500;

type FilaZona = {
  territorio_id: string; nombre: string; geojson: { type: string; coordinates: number[][][][] } | null;
  centro: { coordinates: [number, number] } | null; meta: number | null; potencial: number; bruto: number;
  validados: number; comprometidos: number; lideres: number; alcance: number; clics: number; gasto: number;
};
type FilaLider = {
  lider_id: string; nombre: string; territorio_ids: string[]; meta: number; registrados: number; validados: number;
  duplicados_con_otros: number; tareas_hechas: number; tareas_asignadas: number;
};

const n = (v: unknown) => Number(v ?? 0);

export function zonaDesdeFila(f: FilaZona): Zona {
  const anillo = (f.geojson?.coordinates?.[0]?.[0] ?? []) as [number, number][];
  const centro = f.centro?.coordinates ?? anillo[0] ?? [0, 0];
  return {
    id: f.territorio_id, nombre: f.nombre, anillo, centro: [centro[0], centro[1]],
    potencial: n(f.potencial), meta: n(f.meta), bruto: n(f.bruto), validados: n(f.validados),
    comprometidos: n(f.comprometidos), lideres: n(f.lideres), alcance: n(f.alcance), clics: n(f.clics), gasto: n(f.gasto),
  };
}

export function liderDesdeFila(f: FilaLider): Lider {
  const s = {
    registrados: n(f.registrados), validados: n(f.validados), duplicadosConOtros: n(f.duplicados_con_otros),
    tareasHechas: n(f.tareas_hechas), tareasAsignadas: n(f.tareas_asignadas), meta: n(f.meta),
  };
  return { id: f.lider_id, nombre: f.nombre, zonaId: f.territorio_ids[0] ?? "", telefono: "", ...s, indice: indiceLider(s) };
}

const mensajeError = (m: string) =>
  /invalid login credentials/i.test(m) ? "El correo o la contraseña no coinciden." :
  /email not confirmed/i.test(m) ? "Falta confirmar el correo: revise su bandeja de entrada." :
  /invalid.*(code|totp)|expired/i.test(m) ? "El código no es válido o ya venció." :
  /invitación/i.test(m) ? m : // mensaje propio del hook de registro (supabase/migrations/…_invitaciones.sql)
  /password should be at least (\d+)/i.test(m) ? `La contraseña debe tener al menos ${/(\d+)/.exec(m)![1]} caracteres.` :
  /already registered/i.test(m) ? "Ese correo ya tiene cuenta: elija «Ya tengo cuenta»." :
  `No se pudo iniciar sesión: ${m}`;

export function crearFuenteSupabase(url: string, clavePublicable: string): FuenteDatos {
  const sb: SupabaseClient = createClient(url, clavePublicable);
  let factorPendiente: string | null = null;

  // Arma la sesión a partir de la membresía. La política de «membresia» deja leer las propias aunque falte el 2FA.
  async function armarSesion(): Promise<Ingreso> {
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return { estado: "error", mensaje: "La sesión terminó. Vuelva a entrar." };
    const { data: ms, error } = await sb.from("membresia").select("rol, territorio_ids, campana_id")
      .eq("usuario_id", u.user.id).eq("activa", true).order("creado_en");
    if (error) return { estado: "error", mensaje: `No se pudo leer su membresía: ${error.message}` };
    const m = ms?.[0];
    if (!m) return { estado: "error", mensaje: "Su usuario no pertenece a ninguna campaña todavía. Pida una invitación." };

    const rol = m.rol as RolCampana;
    if (exige2fa(rol)) {
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel !== "aal2") {
        const { data: f } = await sb.auth.mfa.listFactors();
        const totp = f?.totp?.find((x) => x.status === "verified");
        if (!totp) {
          // Primera vez: se inscribe la app autenticadora. Los intentos sin terminar se descartan antes.
          for (const viejo of f?.all?.filter((x) => x.factor_type === "totp" && x.status !== "verified") ?? []) {
            await sb.auth.mfa.unenroll({ factorId: viejo.id });
          }
          const { data: nuevo, error: en } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Ventaja Mando" });
          if (en || !nuevo) return { estado: "error", mensaje: `No se pudo preparar la verificación en dos pasos: ${en?.message ?? "sin respuesta"}` };
          factorPendiente = nuevo.id;
          return { estado: "inscribir-2fa", qr: nuevo.totp.qr_code, secreto: nuevo.totp.secret };
        }
        factorPendiente = totp.id;
        return { estado: "falta-2fa" };
      }
    }
    const { data: c, error: ec } = await sb.from("campana").select("id, nombre, cargo, eleccion_fecha, meta_votos").eq("id", m.campana_id).single();
    if (ec || !c) return { estado: "error", mensaje: "No se pudo leer la campaña." };
    const campana: Campana = { id: c.id, candidato: c.nombre, cargo: c.cargo, eleccion: c.eleccion_fecha ?? "", metaVotos: n(c.meta_votos) };
    const { data: perfil } = await sb.from("usuario").select("nombre").eq("id", u.user.id).maybeSingle();
    return {
      estado: "ok",
      sesion: { usuarioId: u.user.id, nombre: perfil?.nombre ?? u.user.email ?? "", correo: u.user.email ?? "", rol, campana, territorioIds: m.territorio_ids ?? [] },
    };
  }

  return {
    modo: "supabase",
    async iniciarSesion(correo, clave) {
      const { error } = await sb.auth.signInWithPassword({ email: correo.trim(), password: clave });
      if (error) return { estado: "error", mensaje: mensajeError(error.message) };
      return armarSesion();
    },
    async verificar2fa(codigo) {
      if (!factorPendiente) return { estado: "error", mensaje: "Vuelva a escribir su correo y contraseña." };
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factorPendiente, code: codigo.replace(/\s/g, "") });
      if (error) return { estado: "error", mensaje: mensajeError(error.message) };
      factorPendiente = null;
      return armarSesion();
    },
    async sesionActual() {
      const { data } = await sb.auth.getSession();
      if (!data.session) return null;
      const r = await armarSesion();
      return r.estado === "ok" ? r.sesion : null;
    },
    async cerrarSesion() { await sb.auth.signOut(); factorPendiente = null; },
    async importarPersonas(s, filas, a, avance): Promise<ResultadoImportacion> {
      const r: ResultadoImportacion = { creadas: 0, yaExistian: 0, rechazos: [], guardado: true };
      for (let i = 0; i < filas.length; i += LOTE) {
        const lote = filas.slice(i, i + LOTE).map((f) => ({
          numero: f.numero, nombre: f.nombre, documento: f.documento ?? null, telefono: f.telefono ?? null,
          zona_id: f.zonaId ?? null, lider_id: f.liderId ?? null, fecha_autorizacion: f.fechaAutorizacion ?? null,
        }));
        const { data, error } = await sb.rpc("importar_personas", {
          p_campana: s.campana.id, p_filas: lote, p_finalidades: a.finalidades, p_evidencia: a.evidencia, p_archivo: a.archivo,
        });
        if (error) throw new Error(`Se guardaron ${r.creadas} personas y luego falló un lote: ${error.message}. Antes de volver a importar, quite del archivo las filas que ya entraron: las que tienen cédula aparecerían como «ya está en la base», pero las que no la tienen se duplicarían.`);
        r.creadas += data.creadas; r.yaExistian += data.ya_existian; r.rechazos.push(...data.rechazos);
        avance?.(Math.min(i + LOTE, filas.length), filas.length);
      }
      return r;
    },
    async equipo(s) {
      const [m, i] = await Promise.all([
        sb.from("membresia").select("id, rol, territorio_ids, activa, usuario:usuario_id(nombre)").eq("campana_id", s.campana.id).order("creado_en"),
        sb.from("invitacion").select("id, correo, rol, territorio_ids, expira_en").eq("campana_id", s.campana.id)
          .is("aceptada_en", null).gt("expira_en", new Date().toISOString()).order("creado_en"),
      ]);
      if (m.error) throw new Error(`No se pudo leer el equipo: ${m.error.message}`);
      if (i.error) throw new Error(`No se pudieron leer las invitaciones: ${i.error.message}`);
      const miembros: Miembro[] = (m.data ?? []).map((x) => ({
        id: x.id, rol: x.rol as Rol, territorioIds: x.territorio_ids ?? [], activa: x.activa,
        nombre: (x.usuario as unknown as { nombre: string } | null)?.nombre ?? "(sin nombre)",
      }));
      const invitaciones: InvitacionPendiente[] = (i.data ?? []).map((x) => ({
        id: x.id, correo: x.correo, rol: x.rol as Rol, territorioIds: x.territorio_ids ?? [], expira: x.expira_en,
      }));
      return { miembros, invitaciones };
    },
    async invitar(s, d) {
      const { data, error } = await sb.rpc("crear_invitacion", {
        p_campana: s.campana.id, p_correo: d.correo, p_rol: d.rol, p_territorios: d.territorioIds, p_dias: d.dias,
      });
      if (error) throw new Error(/row-level security/.test(error.message) ? "No tiene permiso para invitar ese rol." : error.message);
      return data as string;
    },
    async anularInvitacion(_s, id) {
      const { error } = await sb.from("invitacion").delete().eq("id", id);
      if (error) throw new Error(`No se pudo anular la invitación: ${error.message}`);
    },
    async aceptarInvitacion(a): Promise<Ingreso> {
      const correo = a.correo.trim().toLowerCase();
      const { data: yo } = await sb.auth.getUser();
      if (yo.user?.email?.toLowerCase() !== correo) {
        if (yo.user) await sb.auth.signOut();
        if (a.crearCuenta) {
          // El hook «before user created» de la base rechaza correos sin invitación vigente.
          const { data, error } = await sb.auth.signUp({
            email: correo, password: a.clave, options: { data: { nombre: a.nombre.trim() }, emailRedirectTo: location.href },
          });
          if (error) return { estado: "error", mensaje: mensajeError(error.message) };
          if (!data.session) return { estado: "confirmar-correo" };
        } else {
          const { error } = await sb.auth.signInWithPassword({ email: correo, password: a.clave });
          if (error) return { estado: "error", mensaje: mensajeError(error.message) };
        }
      }
      const { error } = await sb.rpc("aceptar_invitacion", { p_codigo: a.codigo, p_nombre: a.nombre.trim() || correo });
      if (error) return { estado: "error", mensaje: error.message };
      return armarSesion();
    },
    async resumenCumplimiento(s): Promise<ResumenCumplimiento> {
      const { data, error } = await sb.rpc("resumen_cumplimiento", { p_campana: s.campana.id });
      if (error) throw new Error(error.message);
      return {
        personas: n(data.personas), conAutorizacionVigente: n(data.con_autorizacion_vigente), autorizacionesRevocadas: n(data.autorizaciones_revocadas),
        porFinalidad: data.por_finalidad ?? {}, porCanal: data.por_canal ?? {}, solicitudesAbiertas: n(data.solicitudes_abiertas),
        solicitudesVencidas: n(data.solicitudes_vencidas), exportaciones30Dias: n(data.exportaciones_30_dias),
        preferenciaPoliticaActiva: !!data.preferencia_politica_activa,
      };
    },
    async solicitudes(s): Promise<Solicitud[]> {
      const { data, error } = await sb.from("solicitud_titular")
        .select("id, tipo, estado, detalle, recibida_en, vence_en, prorrogada_en, respuesta, persona_id, persona:persona_id(nombre)")
        .eq("campana_id", s.campana.id).order("vence_en");
      if (error) throw new Error(`No se pudieron leer las solicitudes: ${error.message}`);
      return (data ?? []).map((x) => ({
        id: x.id, tipo: x.tipo as TipoSolicitud, estado: x.estado as EstadoSolicitud, detalle: x.detalle ?? undefined,
        personaId: x.persona_id ?? undefined, personaNombre: (x.persona as unknown as { nombre: string } | null)?.nombre,
        recibida: fechaBogota(x.recibida_en), vence: fechaBogota(x.vence_en), prorrogada: !!x.prorrogada_en, respuesta: x.respuesta ?? undefined,
      }));
    },
    async registrarSolicitud(s, d) {
      const { error } = await sb.rpc("registrar_solicitud_titular", {
        p_campana: s.campana.id, p_tipo: d.tipo, p_persona: d.personaId ?? null, p_detalle: d.detalle, p_recibida: d.recibida,
      });
      if (error) throw new Error(error.message);
    },
    async prorrogarSolicitud(_s, id) {
      const { error } = await sb.rpc("prorrogar_solicitud_titular", { p_solicitud: id });
      if (error) throw new Error(error.message);
    },
    async cambiarEstadoSolicitud(_s, id, estado, respuesta) {
      const cerrada = estado === "resuelta" || estado === "rechazada";
      const { error } = await sb.from("solicitud_titular").update({
        estado, ...(respuesta !== undefined ? { respuesta } : {}), resuelta_en: cerrada ? new Date().toISOString() : null,
      }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    async buscarPersonas(s, texto) {
      const { data, error } = await sb.rpc("buscar_personas", { p_campana: s.campana.id, p_texto: texto });
      if (error) throw new Error(error.message);
      return (data ?? []).map((x: { id: string; nombre: string; telefono: string | null; zona: string | null }) =>
        ({ id: x.id, nombre: x.nombre, telefono: x.telefono ?? undefined, zona: x.zona ?? undefined }));
    },
    async revocarAutorizacionesDe(_s, personaId) {
      const { data, error } = await sb.rpc("revocar_autorizaciones_de", { p_persona: personaId });
      if (error) throw new Error(error.message);
      return n(data);
    },
    async suprimirPersona(_s, personaId) {
      const { error } = await sb.from("persona").delete().eq("id", personaId);
      if (error) throw new Error(`No se pudo suprimir: ${error.message}`);
    },
    async exportarPersonas(s, finalidad): Promise<Exportacion> {
      const { data, error } = await sb.rpc("exportar_personas", { p_campana: s.campana.id, p_finalidad: finalidad });
      if (error) throw new Error(error.message);
      return { referencia: data.referencia, exportadoPor: data.exportado_por, exportadoEn: data.exportado_en, finalidad: data.finalidad, filas: data.filas };
    },
    async formularios(s) {
      const { data, error } = await sb.from("formulario").select("id, nombre, esquema_json, version, creado_en")
        .eq("campana_id", s.campana.id).order("creado_en", { ascending: false });
      if (error) throw new Error(`No se pudieron leer los formularios: ${error.message}`);
      return (data ?? []).map((f) => ({ id: f.id, nombre: f.nombre, esquema: f.esquema_json, version: f.version, creado: fechaBogota(f.creado_en) }));
    },
    async guardarFormulario(s, d) {
      const fila = { campana_id: s.campana.id, nombre: d.nombre.trim(), esquema_json: d.esquema };
      const q = d.id ? sb.from("formulario").update(fila).eq("id", d.id) : sb.from("formulario").insert(fila);
      const { data, error } = await q.select("id, nombre, esquema_json, version, creado_en").single();
      if (error) throw new Error(/row-level security/.test(error.message) ? "Solo la dirección de la campaña puede crear o cambiar formularios." : error.message);
      return { id: data.id, nombre: data.nombre, esquema: data.esquema_json, version: data.version, creado: fechaBogota(data.creado_en) };
    },
    async cargarTablero(s): Promise<DatosTablero> {
      const [z, l] = await Promise.all([
        sb.rpc("tablero_zonas", { p_campana: s.campana.id }),
        sb.rpc("tablero_lideres", { p_campana: s.campana.id }),
      ]);
      if (z.error) throw new Error(`No se pudo leer el tablero: ${z.error.message}`);
      if (l.error) throw new Error(`No se pudieron leer los líderes: ${l.error.message}`);
      // Los puestos y mesas del día E llegan en la fase 5; mientras tanto el tablero real no los muestra.
      return { campana: s.campana, zonas: (z.data as FilaZona[]).map(zonaDesdeFila), lideres: (l.data as FilaLider[]).map(liderDesdeFila), puestos: [] };
    },
  };
}

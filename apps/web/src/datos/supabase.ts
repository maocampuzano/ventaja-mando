// Fuente «supabase»: el proyecto real. La seguridad la pone la base (RLS y funciones con alcance por rol);
// aquí solo se piden los datos. El tablero llega agregado por zona y por líder: nunca personas una por una.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { exige2fa, indiceLider, type RolCampana } from "@ventaja/nucleo";
import type { Lider, Zona } from "../data";
import type { Campana, DatosTablero, FuenteDatos, Ingreso } from "./tipos";

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
          return { estado: "error", mensaje: "Su rol exige verificación en dos pasos y todavía no la tiene activada. Pida al administrador que la active con usted (supabase/LEEME.md, paso 4)." };
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

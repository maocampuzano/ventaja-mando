// Fuente real: Supabase con la clave publicable. Todo lo que se lee pasa por la RLS (el líder solo ve lo suyo y el
// testigo, su mesa). Lo que se escribe va por la cola y las funciones *_movil, que no duplican al reintentar.
import "./sesionPersistente";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ErrorDefinitivo, ErrorDeRed, transporteSupabase, type DatosE14Movil, type DatosPersonaMovil, type DatosPlanillaMovil,
  type LlamarRpc, type Operacion, type Transporte,
} from "@ventaja/nucleo";
import { BUCKET_EVIDENCIAS, esArchivoLocal, rutaFoto } from "./rutas";
import { primeroLaGuardada } from "./sesionRapida";
import type { DatosLider, DatosTestigo, FuenteMovil, MesaTestigo, PersonaMovil, RolMovil, Sesion, TareaMovil } from "./tipos";

const mensajeIngreso = (m: string) =>
  /invalid login credentials/i.test(m) ? "El correo o la contraseña no coinciden." :
  /email not confirmed/i.test(m) ? "Falta confirmar el correo: abra el enlace que le llegó." :
  /fetch|network/i.test(m) ? "No hay conexión. Para entrar la primera vez necesita señal." :
  `No se pudo iniciar sesión: ${m}`;

function lanzar(error: { message: string; code?: string } | null, que: string) {
  if (!error) return;
  if (/fetch|network|timeout/i.test(error.message)) throw new ErrorDeRed(`Sin conexión al leer ${que}`);
  throw new Error(`No se pudo leer ${que}: ${error.message}`);
}

// Copia de la sesión en el teléfono: sin señal, la app abre con ella (nombre, rol y campaña) en vez de pedir entrar.
// No guarda la contraseña ni datos de personas; el token lo guarda Supabase en su propio almacenamiento.
const LLAVE_SESION = "comando.sesion";
const sinRed = (e: unknown) => e instanceof ErrorDeRed || /fetch|network|timeout|retryable/i.test(`${(e as Error)?.name} ${(e as Error)?.message}`);
function sesionLocal(): Sesion | null {
  try { return JSON.parse(localStorage.getItem(LLAVE_SESION) ?? "null") as Sesion | null; } catch { return null; }
}
function recordarSesion(s: Sesion | null) {
  try { if (s) localStorage.setItem(LLAVE_SESION, JSON.stringify(s)); else localStorage.removeItem(LLAVE_SESION); } catch { /* sin almacenamiento */ }
}

/** ¿De quién es el token que Supabase guardó en el teléfono? (misma llave que usa supabase-js por defecto). */
function duenoDelToken(url: string): string | null {
  try {
    const crudo = localStorage.getItem(`sb-${new URL(url).hostname.split(".")[0]}-auth-token`);
    const t = crudo ? JSON.parse(crudo) as { user?: { id?: string } } : null;
    return t?.user?.id ?? null;
  } catch { return null; }
}

export function crearFuenteSupabase(url: string, clavePublicable: string): FuenteMovil {
  const rechazos = new Set<() => void>();
  const sb: SupabaseClient = createClient(url, clavePublicable, {
    auth: { storage: localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });

  async function armarSesion(): Promise<Sesion> {
    const { data: u, error: eu } = await sb.auth.getUser();
    if (eu && sinRed(eu)) throw new ErrorDeRed("Sin conexión al confirmar la sesión");
    if (!u.user) throw new Error("La sesión terminó. Vuelva a entrar.");
    const { data: ms, error } = await sb.from("membresia").select("rol, campana_id")
      .eq("usuario_id", u.user.id).eq("activa", true).in("rol", ["lider", "testigo"]).order("creado_en");
    lanzar(error, "su membresía");
    const m = ms?.[0];
    if (!m) throw new Error("Esta app es para líderes y testigos. Si usted es de la dirección o coordinador, use el panel web.");
    const [{ data: c }, { data: perfil }] = await Promise.all([
      sb.from("campana").select("nombre").eq("id", m.campana_id).single(),
      sb.from("usuario").select("nombre").eq("id", u.user.id).maybeSingle(),
    ]);
    return {
      usuarioId: u.user.id, nombre: perfil?.nombre ?? u.user.email ?? "", campanaId: m.campana_id,
      campanaNombre: c?.nombre ?? "", rol: m.rol as RolMovil,
    };
  }

  /** Sube la foto que está en el teléfono y devuelve su ruta en el bucket. Reintentar la reemplaza (upsert). */
  async function subir(s: Sesion, op: Operacion, local: string, sufijo = ""): Promise<string> {
    const ruta = rutaFoto(s.campanaId, s.usuarioId, op.id, sufijo);
    let cuerpo: ArrayBuffer;
    try { cuerpo = await (await fetch(local)).arrayBuffer(); } catch {
      throw new ErrorDefinitivo("La foto ya no está en el teléfono. Tómela de nuevo.");
    }
    let r: Awaited<ReturnType<ReturnType<typeof sb.storage.from>["upload"]>>;
    try { r = await sb.storage.from(BUCKET_EVIDENCIAS).upload(ruta, cuerpo, { contentType: "image/jpeg", upsert: true }); }
    catch (e) { throw new ErrorDeRed((e as Error).message || "Sin conexión"); }
    if (r.error) {
      const estado = Number((r.error as { statusCode?: string | number; status?: number }).statusCode ?? (r.error as { status?: number }).status);
      if (estado >= 400 && estado < 500 && estado !== 408 && estado !== 429) throw new ErrorDefinitivo(`No se pudo guardar la foto: ${r.error.message}`);
      throw new ErrorDeRed(r.error.message);
    }
    return ruta;
  }

  return {
    modo: "supabase",

    async sesionGuardada() {
      const guardada = sesionLocal();
      // Solo cuenta la copia si el token guardado es de la misma persona: si se borró, hay que entrar de nuevo.
      const propia = guardada && duenoDelToken(url) === guardada.usuarioId ? guardada : null;
      const confirmar = (async (): Promise<Sesion | null> => {
        const { data, error } = await sb.auth.getSession();
        // Sin señal, Supabase no puede renovar el token vencido, pero la sesión sigue siendo de esta persona.
        if (!data.session) return error && sinRed(error) ? propia : null;
        const mismaPersona = guardada?.usuarioId === data.session.user.id ? guardada : null;
        try {
          const s = await armarSesion();
          recordarSesion(s);
          return s;
        } catch (e) {
          // Sin señal se abre con la copia del teléfono; si el servidor rechazó la sesión, se pide entrar de nuevo.
          if (sinRed(e)) return mismaPersona;
          recordarSesion(null);
          return null;
        }
      })();
      return primeroLaGuardada(confirmar, propia, () => rechazos.forEach((f) => f()));
    },

    alRechazarSesion(f) {
      rechazos.add(f);
      return () => { rechazos.delete(f); };
    },

    async iniciarSesion(correo, clave) {
      const { error } = await sb.auth.signInWithPassword({ email: correo.trim(), password: clave });
      if (error) throw new Error(mensajeIngreso(error.message));
      const s = await armarSesion();
      recordarSesion(s);
      return s;
    },

    async cerrarSesion() {
      recordarSesion(null);
      await sb.auth.signOut();
    },

    async datosLider(s): Promise<DatosLider> {
      const { data: l, error } = await sb.from("lider").select("id, meta, territorio_ids")
        .eq("campana_id", s.campanaId).eq("usuario_id", s.usuarioId).single();
      lanzar(error, "su meta");
      const [zonas, tareas, personas] = await Promise.all([
        sb.from("territorio").select("id, nombre").in("id", l!.territorio_ids ?? []).order("nombre"),
        sb.from("tarea").select("id, titulo, tipo, estado, vence_en").eq("campana_id", s.campanaId).eq("asignado_a", s.usuarioId)
          .in("estado", ["pendiente", "en_curso", "hecha"]).order("creado_en"),
        sb.from("persona").select("id, nombre, telefono, territorio_trabajo_id, estado_contacto, autorizacion(revocada_en, finalidades), baja_contacto(persona_id)")
          .eq("campana_id", s.campanaId).eq("lider_id", l!.id).order("creado_en", { ascending: false }).limit(2000),
      ]);
      lanzar(zonas.error, "sus zonas");
      lanzar(tareas.error, "sus tareas");
      lanzar(personas.error, "sus personas");
      return {
        liderId: l!.id,
        meta: l!.meta ?? 0,
        zonas: (zonas.data ?? []).map((z) => ({ id: z.id, nombre: z.nombre })),
        tareas: (tareas.data ?? []).map((t): TareaMovil => ({
          id: t.id, titulo: t.titulo, detalle: t.tipo, estado: t.estado, venceEn: t.vence_en,
        })),
        personas: (personas.data ?? []).map((p): PersonaMovil => ({
          id: p.id, nombre: p.nombre, telefono: p.telefono, zonaId: p.territorio_trabajo_id, estado: p.estado_contacto,
          autorizacionVigente: ((p.autorizacion ?? []) as { revocada_en: string | null }[]).some((a) => !a.revocada_en),
          // Igual que privado.contactable en la base: vigente y con la finalidad «contacto de la campaña».
          autorizaContacto: ((p.autorizacion ?? []) as { revocada_en: string | null; finalidades: string[] | null }[])
            .some((a) => !a.revocada_en && (a.finalidades ?? []).includes("contacto_campana")),
          // Una sola fila por persona (la llave es persona_id): llega como objeto o como lista según la relación.
          dadaDeBaja: Array.isArray(p.baja_contacto) ? p.baja_contacto.length > 0 : !!p.baja_contacto,
        })),
      };
    },

    async datosTestigo(s): Promise<DatosTestigo> {
      const { data: ts, error } = await sb.from("testigo").select("puesto_id, mesa, estado, puesto:puesto_id(nombre)")
        .eq("campana_id", s.campanaId).eq("usuario_id", s.usuarioId);
      lanzar(error, "su mesa");
      const [novedades, actas] = await Promise.all([
        sb.from("incidencia").select("id, puesto_id, mesa, tipo, hora, estado").eq("campana_id", s.campanaId)
          .eq("reportado_por", s.usuarioId).order("hora", { ascending: false }),
        sb.from("acta_e14").select("puesto_id, mesa").eq("campana_id", s.campanaId).eq("creado_por", s.usuarioId),
      ]);
      lanzar(novedades.error, "sus novedades");
      lanzar(actas.error, "sus E-14");
      return {
        mesas: (ts ?? []).map((t): MesaTestigo => {
          const puesto = (Array.isArray(t.puesto) ? t.puesto[0] : t.puesto) as { nombre: string } | null;
          const esta = (x: { puesto_id: string; mesa: number | null }) => x.puesto_id === t.puesto_id && (t.mesa === null || x.mesa === t.mesa);
          return {
            puestoId: t.puesto_id, puestoNombre: puesto?.nombre ?? "", mesa: t.mesa, estado: t.estado,
            e14Recibido: (actas.data ?? []).some(esta),
            novedades: (novedades.data ?? []).filter(esta).map((n) => ({ id: n.id, tipo: n.tipo, hora: n.hora, estado: n.estado })),
          };
        }),
      };
    },

    async ping() {
      try {
        const r = await Promise.race([
          sb.rpc("ping_movil").then(({ data, error }) => !error && data === true),
          new Promise<boolean>((ok) => setTimeout(() => ok(false), 8000)),
        ]);
        return r;
      } catch { return false; }
    },

    transporte(s): Transporte {
      const rpc: LlamarRpc = async (f, p) => {
        const { data, error } = await sb.rpc(f, p);
        return { data, error: error ? { code: error.code, message: error.message } : null };
      };
      const base = transporteSupabase(rpc);
      return {
        // Primero las fotos (si siguen en el teléfono), luego la operación con la ruta de cada foto.
        async enviar(op) {
          let datos = op.datos;
          if (op.tipo === "planilla" && esArchivoLocal((datos as DatosPlanillaMovil).archivo)) {
            datos = { ...(datos as DatosPlanillaMovil), archivo: await subir(s, op, (datos as DatosPlanillaMovil).archivo) };
          } else if (op.tipo === "e14" && esArchivoLocal((datos as DatosE14Movil).foto)) {
            datos = { ...(datos as DatosE14Movil), foto: await subir(s, op, (datos as DatosE14Movil).foto) };
          } else if (op.tipo === "persona" && esArchivoLocal((datos as DatosPersonaMovil).evidencia)) {
            datos = { ...(datos as DatosPersonaMovil), evidencia: await subir(s, op, (datos as DatosPersonaMovil).evidencia, "autorizacion") };
          }
          return base.enviar({ ...op, datos });
        },
        revisadas: (ids) => base.revisadas!(ids),
      };
    },
  };
}

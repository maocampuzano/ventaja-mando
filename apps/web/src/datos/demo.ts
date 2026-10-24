// Fuente «demo»: la semilla ficticia de Turbaco, en el navegador. Recorta los datos con la misma regla de alcance
// que la base (packages/nucleo/src/alcance.ts), para que la demostración se comporte como el producto real.
// Aquí no hay seguridad real: todo vive en el navegador y es ficticio.
import { exige2fa, territoriosVisibles, type RolCampana } from "@ventaja/nucleo";
import { campana as campanaSemilla, lideres, puestos, zonas } from "../data";
import { cumplimientoDemo, formulariosDemo } from "./demo-cumplimiento";
import type { Campana, DatosTablero, FuenteDatos, Ingreso, InvitacionPendiente, Sesion } from "./tipos";

export const CLAVE_DEMO = "demo2027";
export const CODIGO_2FA_DEMO = "123456";
const MUNICIPIO = "turbaco";
const campana: Campana = { id: "campana-demo", ...campanaSemilla };

export const usuariosDemo: { correo: string; nombre: string; rol: RolCampana; territorioIds: string[]; descripcion: string }[] = [
  { correo: "gerente@demo.co", nombre: "Gerente Demo", rol: "gerente", territorioIds: [], descripcion: "Toda la campaña. Pide código de dos pasos." },
  { correo: "candidata@demo.co", nombre: campanaSemilla.candidato, rol: "candidato", territorioIds: [], descripcion: "Cifras agregadas de toda la campaña." },
  { correo: "coordinadora@demo.co", nombre: "Coordinadora Demo", rol: "coordinador", territorioIds: ["z1", "z2", "z3"], descripcion: "Solo sus tres zonas." },
  { correo: "lider@demo.co", nombre: lideres[0].nombre, rol: "lider", territorioIds: [lideres[0].zonaId], descripcion: "Su bandeja en el celular." },
  { correo: "testigo@demo.co", nombre: "Testigo Demo", rol: "testigo", territorioIds: [], descripcion: "Su mesa el día E." },
];

const arbol = [{ id: MUNICIPIO }, ...zonas.map((z) => ({ id: z.id, padreId: MUNICIPIO }))];
const LLAVE = "vm-sesion-demo";

// Cuentas creadas al aceptar invitaciones y las invitaciones mismas. Viven en la pestaña (sessionStorage), como todo
// el modo demo: sirven para mostrar el flujo completo sin servidor.
type CuentaDemo = { correo: string; nombre: string; clave: string; rol: RolCampana; territorioIds: string[] };
type InvitacionDemo = InvitacionPendiente & { codigo: string };
const LLAVE_CUENTAS = "vm-demo-cuentas";
const LLAVE_INVITACIONES = "vm-demo-invitaciones";
function leerLista<T>(llave: string): T[] {
  try { return JSON.parse(sessionStorage.getItem(llave) ?? "[]"); } catch { return []; }
}
function guardarLista<T>(llave: string, lista: T[]) {
  try { sessionStorage.setItem(llave, JSON.stringify(lista)); } catch { /* sin almacenamiento */ }
}
const normalizarCorreo = (c: string) => c.trim().toLowerCase();
export const CORREO_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function codigoAleatorio() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sesionDe(correo: string): Sesion | null {
  const c = normalizarCorreo(correo);
  const u = usuariosDemo.find((x) => x.correo === c) ?? leerLista<CuentaDemo>(LLAVE_CUENTAS).find((x) => x.correo === c);
  return u ? { usuarioId: u.correo, nombre: u.nombre, correo: u.correo, rol: u.rol, campana, territorioIds: u.territorioIds } : null;
}
const claveDe = (correo: string) =>
  leerLista<CuentaDemo>(LLAVE_CUENTAS).find((x) => x.correo === normalizarCorreo(correo))?.clave ?? CLAVE_DEMO;

function guardar(s: Sesion | null) {
  try {
    if (s) sessionStorage.setItem(LLAVE, JSON.stringify(s)); else sessionStorage.removeItem(LLAVE);
  } catch { /* sin almacenamiento: la sesión dura lo que dure la página */ }
}

/** Recorta la semilla al alcance de la sesión. Exportada para probarla. */
export function datosDemo(s: Sesion): DatosTablero {
  const visibles = territoriosVisibles(s.rol, s.territorioIds, arbol);
  return {
    campana,
    zonas: zonas.filter((z) => visibles.has(z.id)),
    lideres: lideres.filter((l) => visibles.has(l.zonaId)),
    puestos: puestos.filter((p) => visibles.has(p.zonaId)),
  };
}

export function crearFuenteDemo(): FuenteDatos {
  let pendiente: Sesion | null = null;
  let actual: Sesion | null = null;
  try { actual = JSON.parse(sessionStorage.getItem(LLAVE) ?? "null"); } catch { actual = null; }

  return {
    modo: "demo",
    ...cumplimientoDemo,
    ...formulariosDemo,
    async iniciarSesion(correo, clave): Promise<Ingreso> {
      const s = sesionDe(correo);
      if (!s || clave !== claveDe(correo)) return { estado: "error", mensaje: "El correo o la contraseña no coinciden." };
      if (exige2fa(s.rol)) { pendiente = s; return { estado: "falta-2fa" }; }
      actual = s; guardar(s);
      return { estado: "ok", sesion: s };
    },
    async verificar2fa(codigo): Promise<Ingreso> {
      if (!pendiente) return { estado: "error", mensaje: "Vuelva a escribir su correo y contraseña." };
      if (codigo.replace(/\s/g, "") !== CODIGO_2FA_DEMO) return { estado: "error", mensaje: "El código no es válido o ya venció." };
      actual = pendiente; pendiente = null; guardar(actual);
      return { estado: "ok", sesion: actual };
    },
    async sesionActual() { return actual; },
    async cerrarSesion() { actual = null; pendiente = null; guardar(null); },
    async cargarTablero(s) { return datosDemo(s); },
    // En la demostración no se guarda nada: se responde como si todas las filas listas hubieran entrado.
    async importarPersonas(_s, filas, _a, avance) {
      avance?.(filas.length, filas.length);
      return { creadas: filas.length, yaExistian: 0, rechazos: [], guardado: false };
    },
    async equipo() {
      const ahora = new Date().toISOString();
      const miembros = [...usuariosDemo, ...leerLista<CuentaDemo>(LLAVE_CUENTAS)].map((u) => ({
        id: u.correo, nombre: u.nombre, rol: u.rol, territorioIds: u.territorioIds, activa: true,
      }));
      const invitaciones = leerLista<InvitacionDemo>(LLAVE_INVITACIONES).filter((i) => i.expira > ahora)
        .map((i) => ({ id: i.id, correo: i.correo, rol: i.rol, territorioIds: i.territorioIds, expira: i.expira }));
      return { miembros, invitaciones };
    },
    // Mismas validaciones que public.crear_invitacion y la política de la tabla invitacion.
    async invitar(s, d) {
      const correo = normalizarCorreo(d.correo);
      if (!CORREO_VALIDO.test(correo)) throw new Error(`El correo «${d.correo}» no es válido.`);
      if (!(d.dias >= 1 && d.dias <= 30)) throw new Error("La invitación debe vencer entre 1 y 30 días.");
      if ((d.rol === "coordinador" || d.rol === "lider") && !d.territorioIds.length) throw new Error(`Indique al menos una zona para el rol ${d.rol}.`);
      if (exige2fa(d.rol) && s.rol !== "administrador") throw new Error("Solo un administrador puede invitar administradores o gerentes.");
      const codigo = codigoAleatorio();
      const expira = new Date(Date.now() + d.dias * 86400000).toISOString();
      const lista = leerLista<InvitacionDemo>(LLAVE_INVITACIONES).filter((i) => i.correo !== correo);
      guardarLista(LLAVE_INVITACIONES, [...lista, { id: codigo.slice(0, 8), correo, rol: d.rol, territorioIds: d.territorioIds, expira, codigo }]);
      return codigo;
    },
    async anularInvitacion(_s, id) {
      guardarLista(LLAVE_INVITACIONES, leerLista<InvitacionDemo>(LLAVE_INVITACIONES).filter((i) => i.id !== id));
    },
    async aceptarInvitacion(a): Promise<Ingreso> {
      const lista = leerLista<InvitacionDemo>(LLAVE_INVITACIONES);
      const inv = lista.find((i) => i.codigo === a.codigo && i.expira > new Date().toISOString());
      if (!inv) return { estado: "error", mensaje: "La invitación no existe, ya se usó o venció." };
      const correo = normalizarCorreo(a.correo);
      if (correo !== inv.correo) return { estado: "error", mensaje: "La invitación es para otro correo." };
      const cuentas = leerLista<CuentaDemo>(LLAVE_CUENTAS);
      const existente = sesionDe(correo);
      if (a.crearCuenta) {
        if (existente) return { estado: "error", mensaje: "Ese correo ya tiene cuenta: elija «Ya tengo cuenta»." };
        if (a.clave.length < 12) return { estado: "error", mensaje: "La contraseña debe tener al menos 12 caracteres." };
        if (a.nombre.trim().length < 3) return { estado: "error", mensaje: "Escriba su nombre." };
        cuentas.push({ correo, nombre: a.nombre.trim(), clave: a.clave, rol: inv.rol, territorioIds: inv.territorioIds });
      } else {
        if (!existente || a.clave !== claveDe(correo)) return { estado: "error", mensaje: "El correo o la contraseña no coinciden." };
        const i = cuentas.findIndex((x) => x.correo === correo);
        if (i < 0) return { estado: "error", mensaje: "Los usuarios de demostración no aceptan invitaciones." };
        cuentas[i] = { ...cuentas[i], rol: inv.rol, territorioIds: inv.territorioIds };
      }
      guardarLista(LLAVE_CUENTAS, cuentas);
      guardarLista(LLAVE_INVITACIONES, lista.filter((i) => i.id !== inv.id));
      const s = sesionDe(correo)!;
      if (exige2fa(s.rol)) { pendiente = s; return { estado: "falta-2fa" }; }
      actual = s; guardar(s);
      return { estado: "ok", sesion: s };
    },
  };
}

/** Enlaces directos de la página publicada (#gerente-lideres): entran como el usuario demo de ese rol. */
export function sesionDemoPorRol(rol: string): Sesion | null {
  const u = usuariosDemo.find((x) => x.rol === rol);
  return u ? sesionDe(u.correo) : null;
}

// Fuente «demo»: la semilla ficticia de Turbaco, en el navegador. Recorta los datos con la misma regla de alcance
// que la base (packages/nucleo/src/alcance.ts), para que la demostración se comporte como el producto real.
// Aquí no hay seguridad real: todo vive en el navegador y es ficticio.
import { exige2fa, territoriosVisibles, type RolCampana } from "@ventaja/nucleo";
import { campana as campanaSemilla, lideres, puestos, zonas } from "../data";
import type { Campana, DatosTablero, FuenteDatos, Ingreso, Sesion } from "./tipos";

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

function sesionDe(correo: string): Sesion | null {
  const u = usuariosDemo.find((x) => x.correo === correo.trim().toLowerCase());
  return u ? { usuarioId: u.correo, nombre: u.nombre, correo: u.correo, rol: u.rol, campana, territorioIds: u.territorioIds } : null;
}

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
    async iniciarSesion(correo, clave): Promise<Ingreso> {
      const s = sesionDe(correo);
      if (!s || clave !== CLAVE_DEMO) return { estado: "error", mensaje: "El correo o la contraseña no coinciden." };
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
  };
}

/** Enlaces directos de la página publicada (#gerente-lideres): entran como el usuario demo de ese rol. */
export function sesionDemoPorRol(rol: string): Sesion | null {
  const u = usuariosDemo.find((x) => x.rol === rol);
  return u ? sesionDe(u.correo) : null;
}

// Errores y auditoría en modo demo: los errores de la pestaña quedan en memoria y la auditoría trae filas ficticias.
import type { ErrorAgrupado, FilaAuditoria, FuenteDatos, Sesion } from "./tipos";

type Metodos = Pick<FuenteDatos, "registrarError" | "erroresRecientes" | "auditoria">;
const esDireccion = (s: Sesion) => s.rol === "administrador" || s.rol === "gerente";

const AUDITORIA: FilaAuditoria[] = [
  { id: 6, en: "2027-09-05T15:10:00.000Z", usuario: "Gerente Demo", accion: "exportar_personas", entidad: "persona", entidadId: null, detalle: { referencia: "8F3A21C0", finalidad: "contacto_campana", cantidad: 412 } },
  { id: 5, en: "2027-09-04T20:42:00.000Z", usuario: "Gerente Demo", accion: "ver_documento", entidad: "persona", entidadId: "p-12", detalle: {} },
  { id: 4, en: "2027-09-03T14:05:00.000Z", usuario: "Gerente Demo", accion: "aprobar_envio", entidad: "envio", entidadId: "e-2", detalle: { destinatarios: 1696 } },
  { id: 3, en: "2027-09-02T16:30:00.000Z", usuario: "Sin sesión (enlace)", accion: "baja_contacto", entidad: "persona", entidadId: "p-88", detalle: { origen: "enlace" } },
  { id: 2, en: "2027-09-01T13:00:00.000Z", usuario: "Gerente Demo", accion: "fusionar", entidad: "persona", entidadId: "p-7", detalle: { motivo: "Misma cédula, cargada por dos líderes" } },
  { id: 1, en: "2027-08-30T22:15:00.000Z", usuario: "Admin Demo", accion: "delete", entidad: "persona", entidadId: "p-3", detalle: { anterior: { nombre: "Persona Ficticia", estado_contacto: "sin_contactar" } } },
];

export function crearErroresDemo(): Metodos {
  const errores: { mensaje: string; usuario: string; en: string; ruta: string; version: string; pila: string }[] = [];
  return {
    async registrarError(s, e) {
      if (errores.filter((x) => x.usuario === s.usuarioId && Date.parse(x.en) > Date.now() - 3_600_000).length >= 30) return;
      errores.push({ ...e, usuario: s.usuarioId, en: new Date().toISOString() });
    },
    async erroresRecientes(s): Promise<ErrorAgrupado[]> {
      if (!esDireccion(s)) throw new Error("Solo la dirección ve los errores del panel.");
      const grupos = new Map<string, ErrorAgrupado & { usuarios: Set<string> }>();
      for (const e of errores) {
        const g = grupos.get(e.mensaje) ?? { mensaje: e.mensaje, veces: 0, personas: 0, ultima: e.en, ruta: e.ruta, version: e.version, pila: e.pila, usuarios: new Set() };
        g.veces++; g.usuarios.add(e.usuario); g.personas = g.usuarios.size;
        if (e.en > g.ultima) Object.assign(g, { ultima: e.en, ruta: e.ruta, version: e.version, pila: e.pila });
        grupos.set(e.mensaje, g);
      }
      return [...grupos.values()].map((g): ErrorAgrupado => ({ mensaje: g.mensaje, veces: g.veces, personas: g.personas, ultima: g.ultima, ruta: g.ruta, version: g.version, pila: g.pila }))
        .sort((a, b) => b.ultima.localeCompare(a.ultima));
    },
    async auditoria(s, f) {
      if (!esDireccion(s)) throw new Error("Solo la dirección revisa la auditoría.");
      return AUDITORIA.filter((a) => (!f.accion || a.accion === f.accion) && (!f.antes || a.id < f.antes)
        && (!f.desde || a.en.slice(0, 10) >= f.desde) && (!f.hasta || a.en.slice(0, 10) <= f.hasta));
    },
  };
}

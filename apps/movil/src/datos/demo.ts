// Modo demo: datos ficticios de Turbaco y un servidor de mentira dentro del teléfono, idempotente como el real.
// Sirve para mostrar la app sin cuenta y para probar la cola: el interruptor «Simular sin señal» corta el envío.
import { ErrorDefinitivo, ErrorDeRed, type Operacion, type Transporte } from "@ventaja/nucleo";
import type { DatosLider, DatosTestigo, FuenteMovil, PersonaMovil, RolMovil, Sesion } from "./tipos";

export const CUENTAS_DEMO: Record<string, { nombre: string; rol: RolMovil }> = {
  "lider@demo.co": { nombre: "Yesenia Barrios", rol: "lider" },
  "testigo@demo.co": { nombre: "Testigo Demo", rol: "testigo" },
};

const NOMBRES = ["María José Peña", "José Luis Ortiz", "Luz Dary Gómez", "Carlos Díaz", "Ana Ruiz", "Edilberto Cabarcas",
  "Yulieth Julio", "Andrés Herrera"];
const ESTADOS: PersonaMovil["estado"][] = ["sin_contactar", "contactado", "validado", "validado", "comprometido"];

export type ServidorDemo = {
  sinSenal: boolean;
  recibidas: Map<string, Operacion>;
  revisadas: Set<string>;
};

export function crearServidorDemo(): ServidorDemo {
  return { sinSenal: false, recibidas: new Map(), revisadas: new Set() };
}

export function transporteDemo(servidor: ServidorDemo, espera = (ms: number) => new Promise((r) => setTimeout(r, ms))): Transporte {
  return {
    async enviar(op) {
      await espera(250);
      if (servidor.sinSenal) throw new ErrorDeRed("Sin señal (simulada)");
      const d = op.datos as { nombre?: string; finalidades?: string[] };
      if (op.tipo === "persona" && (!d.nombre || d.nombre.trim().length < 3)) throw new ErrorDefinitivo("Falta el nombre.");
      if (op.tipo === "persona" && !d.finalidades?.length) throw new ErrorDefinitivo("Falta la autorización: finalidades y evidencia.");
      if (servidor.recibidas.has(op.id)) return "ya_estaba";
      servidor.recibidas.set(op.id, op);
      return "creada";
    },
    async revisadas(ids) {
      if (servidor.sinSenal) throw new ErrorDeRed("Sin señal (simulada)");
      return ids.filter((i) => servidor.revisadas.has(i));
    },
  };
}

export function crearFuenteDemo(servidor = crearServidorDemo()): FuenteMovil & { servidor: ServidorDemo } {
  let sesion: Sesion | null = null;
  return {
    modo: "demo",
    servidor,
    async sesionGuardada() { return sesion; },
    async iniciarSesion(correo) {
      const c = CUENTAS_DEMO[correo.trim().toLowerCase()];
      if (!c) throw new Error("En el modo demo, entre con lider@demo.co o testigo@demo.co (cualquier contraseña).");
      sesion = {
        usuarioId: c.rol === "lider" ? "40000000-0000-4000-8000-000000000005" : "40000000-0000-4000-8000-000000000007",
        nombre: c.nombre, campanaId: "20000000-0000-4000-8000-00000000000a", campanaNombre: "Turbaco Primero (ficticia)", rol: c.rol,
      };
      return sesion;
    },
    async cerrarSesion() { sesion = null; },
    async datosLider(): Promise<DatosLider> {
      if (servidor.sinSenal) throw new ErrorDeRed("Sin señal (simulada)");
      return {
        liderId: "70000000-0000-4000-8000-000000000001",
        meta: 187,
        zonas: [{ id: "50000000-0000-4000-8000-000000000001", nombre: "El Mirador" }],
        tareas: [
          { id: "91000000-0000-4000-8000-000000000001", titulo: "Visitar a 8 simpatizantes sin validar", detalle: "El Mirador, antes de las 6 p. m.", estado: "pendiente", venceEn: null },
          { id: "91000000-0000-4000-8000-000000000002", titulo: "Invitar a la reunión del jueves", detalle: "Contactos con autorización vigente", estado: "pendiente", venceEn: null },
          { id: "91000000-0000-4000-8000-000000000003", titulo: "Escanear la planilla del sábado", detalle: "Lote 14", estado: "pendiente", venceEn: null },
        ],
        personas: NOMBRES.map((nombre, i) => ({
          id: `80000000-0000-4000-8000-0000000001${String(i + 1).padStart(2, "0")}`, nombre,
          telefono: `300000${String(1001 + i).padStart(4, "0")}`, zonaId: "50000000-0000-4000-8000-000000000001",
          estado: ESTADOS[(1 + i) % 5], autorizacionVigente: i !== 6,
        })),
      };
    },
    async datosTestigo(): Promise<DatosTestigo> {
      if (servidor.sinSenal) throw new ErrorDeRed("Sin señal (simulada)");
      return {
        mesas: [{
          puestoId: "60000000-0000-4000-8000-000000000001", puestoNombre: "I. E. Técnica de Turbaco (ficticio)", mesa: 3,
          estado: "confirmado", e14Recibido: false,
          novedades: [{ id: "i-demo-1", tipo: "Fila larga, votantes se están yendo", hora: "2027-10-31T14:40:00Z", estado: "abierta" }],
        }],
      };
    },
    transporte: () => transporteDemo(servidor),
  };
}

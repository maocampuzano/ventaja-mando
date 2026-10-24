// Datos y cumplimiento en modo demo: personas FICTICIAS, solicitudes y exportaciones que viven en la pestaña.
// Reproduce las reglas de la base (supabase/migrations/…_cumplimiento.sql) para que la demostración sea fiel.
import { normaliza, plazoSolicitud, revisarEsquema, sumarDiasHabiles, type TipoSolicitud } from "@ventaja/nucleo";
import { lideres, zonas } from "../data";
import type { Exportacion, Formulario, FuenteDatos, ResumenCumplimiento, Solicitud } from "./tipos";

type PersonaDemo = { id: string; nombre: string; telefono: string; documento: string; zonaId: string; liderId: string;
  estado: string; autorizada: string; finalidades: string[]; revocada: boolean };

const NOMBRES = ["María José", "José Luis", "Luz Dary", "Carlos", "Ana", "Edilberto", "Yulieth", "Andrés", "Leidy", "Jorge"];
const APELLIDOS = ["Peña", "Ortiz", "Gómez", "Díaz", "Ruiz", "Cabarcas", "Julio", "Herrera", "Tapia", "Puello", "Mercado"];
const ESTADOS = ["sin_contactar", "contactado", "validado", "validado", "comprometido"];

function semilla(): PersonaDemo[] {
  return Array.from({ length: 60 }, (_, i) => {
    const lider = lideres[i % lideres.length];
    return {
      id: `dp${i + 1}`,
      nombre: `${NOMBRES[i % 10]} ${APELLIDOS[(i * 3) % 11]} ${APELLIDOS[(i * 7 + 2) % 11]}`,
      telefono: `+57 300 000 ${String(5000 + i)}`,
      documento: `000${String(9000000 + i)}`, // ficticia: empieza por 000
      zonaId: lider.zonaId, liderId: lider.id, estado: ESTADOS[i % 5],
      autorizada: `2026-0${1 + (i % 9)}-1${i % 10}`,
      finalidades: i % 4 === 0 ? ["contacto_campana", "actividades_territorio"] : ["contacto_campana"],
      revocada: i % 23 === 7,
    };
  });
}

const LLAVE_P = "vm-demo-personas", LLAVE_S = "vm-demo-solicitudes", LLAVE_E = "vm-demo-exportaciones";
function leer<T>(llave: string, porDefecto: () => T): T {
  try { const v = sessionStorage.getItem(llave); return v ? JSON.parse(v) : porDefecto(); } catch { return porDefecto(); }
}
function escribir<T>(llave: string, v: T) { try { sessionStorage.setItem(llave, JSON.stringify(v)); } catch { /* sin almacenamiento */ } }
const personas = () => leer<PersonaDemo[]>(LLAVE_P, semilla);
const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const exigirDireccion = (rol: string) => {
  if (rol !== "administrador" && rol !== "gerente") throw new Error("Solo la dirección de la campaña puede hacer esto.");
};

export const cumplimientoDemo: Pick<FuenteDatos, "resumenCumplimiento" | "solicitudes" | "registrarSolicitud" | "prorrogarSolicitud"
  | "cambiarEstadoSolicitud" | "buscarPersonas" | "revocarAutorizacionesDe" | "suprimirPersona" | "exportarPersonas"> = {
  async resumenCumplimiento(s) {
    if (!["administrador", "gerente", "candidato"].includes(s.rol)) throw new Error("No tiene permiso para ver el resumen de cumplimiento.");
    const ps = personas(), vigentes = ps.filter((p) => !p.revocada), sols = leer<Solicitud[]>(LLAVE_S, () => []);
    const abiertas = sols.filter((x) => x.estado === "recibida" || x.estado === "en_tramite");
    const porFinalidad: Record<string, number> = {};
    for (const p of vigentes) for (const f of p.finalidades) porFinalidad[f] = (porFinalidad[f] ?? 0) + 1;
    const hace30 = Date.now() - 30 * 86400000;
    const r: ResumenCumplimiento = {
      personas: ps.length, conAutorizacionVigente: vigentes.length, autorizacionesRevocadas: ps.length - vigentes.length,
      porFinalidad, porCanal: { formulario: vigentes.length }, solicitudesAbiertas: abiertas.length,
      solicitudesVencidas: abiertas.filter((x) => x.vence < hoy()).length,
      exportaciones30Dias: leer<number[]>(LLAVE_E, () => []).filter((t) => t > hace30).length,
      preferenciaPoliticaActiva: false,
    };
    return r;
  },
  async solicitudes(s) {
    exigirDireccion(s.rol);
    return leer<Solicitud[]>(LLAVE_S, () => []).sort((a, b) => a.vence.localeCompare(b.vence));
  },
  async registrarSolicitud(s, d) {
    exigirDireccion(s.rol);
    if (d.recibida > hoy()) throw new Error("La fecha de recibo no puede ser futura.");
    const persona = personas().find((p) => p.id === d.personaId);
    const sols = leer<Solicitud[]>(LLAVE_S, () => []);
    sols.push({ id: `ds${Date.now()}`, tipo: d.tipo, estado: "recibida", personaId: persona?.id, personaNombre: persona?.nombre,
      detalle: d.detalle.trim() || undefined, recibida: d.recibida, vence: sumarDiasHabiles(d.recibida, plazoSolicitud[d.tipo].dias), prorrogada: false });
    escribir(LLAVE_S, sols);
  },
  async prorrogarSolicitud(s, id) {
    exigirDireccion(s.rol);
    const sols = leer<Solicitud[]>(LLAVE_S, () => []);
    const x = sols.find((y) => y.id === id);
    if (!x) throw new Error("La solicitud no existe.");
    if (x.prorrogada) throw new Error("La solicitud ya se prorrogó una vez.");
    x.vence = sumarDiasHabiles(x.vence, plazoSolicitud[x.tipo as TipoSolicitud].prorroga);
    x.prorrogada = true;
    escribir(LLAVE_S, sols);
  },
  async cambiarEstadoSolicitud(s, id, estado, respuesta) {
    exigirDireccion(s.rol);
    const sols = leer<Solicitud[]>(LLAVE_S, () => []);
    const x = sols.find((y) => y.id === id);
    if (x) { x.estado = estado; if (respuesta !== undefined) x.respuesta = respuesta; }
    escribir(LLAVE_S, sols);
  },
  async buscarPersonas(s, texto) {
    exigirDireccion(s.rol);
    const t = normaliza(texto.trim());
    const digitos = texto.replace(/\D/g, "");
    if (t.length < 3) return [];
    return personas().filter((p) => p.documento === digitos || normaliza(p.nombre).includes(t)
      || (digitos.length >= 7 && p.telefono.replace(/\D/g, "").endsWith(digitos)))
      .slice(0, 20).map((p) => ({ id: p.id, nombre: p.nombre, telefono: p.telefono, zona: zonas.find((z) => z.id === p.zonaId)?.nombre }));
  },
  async revocarAutorizacionesDe(s, personaId) {
    exigirDireccion(s.rol);
    const ps = personas();
    const p = ps.find((x) => x.id === personaId);
    if (!p || p.revocada) return 0;
    p.revocada = true;
    escribir(LLAVE_P, ps);
    return 1;
  },
  async suprimirPersona(s, personaId) {
    exigirDireccion(s.rol);
    escribir(LLAVE_P, personas().filter((p) => p.id !== personaId));
    const sols = leer<Solicitud[]>(LLAVE_S, () => []).map((x) => (x.personaId === personaId ? { ...x, personaId: undefined } : x));
    escribir(LLAVE_S, sols);
  },
  async exportarPersonas(s, finalidad): Promise<Exportacion> {
    exigirDireccion(s.rol);
    escribir(LLAVE_E, [...leer<number[]>(LLAVE_E, () => []), Date.now()]);
    const ahora = new Date();
    return {
      referencia: crypto.randomUUID(), exportadoPor: s.nombre, finalidad,
      exportadoEn: new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }).format(ahora),
      filas: personas().filter((p) => !p.revocada && p.finalidades.includes(finalidad)).map((p) => ({
        nombre: p.nombre, celular: p.telefono, zona: zonas.find((z) => z.id === p.zonaId)?.nombre,
        lider: lideres.find((l) => l.id === p.liderId)?.nombre, relacion: "simpatizante", estado: p.estado,
        autorizada_el: p.autorizada.split("-").reverse().join("/"),
      })),
    };
  },
};

// Formularios en modo demo: misma revisión que la base (nucleo/formularios) y versión que sube al cambiar los campos.

const LLAVE_F = "vm-demo-formularios";
const ejemplo = (): Formulario[] => [{
  id: "df1", nombre: "Visita casa a casa (ejemplo)", version: 1, creado: "2026-10-20",
  esquema: { campos: [
    { id: "c1", tipo: "opcion", etiqueta: "¿Qué tema le preocupa más en su barrio?", obligatorio: true, opciones: ["Vías", "Seguridad", "Salud", "Empleo"] },
    { id: "c2", tipo: "si_no", etiqueta: "¿Le gustaría que lo invitemos a la reunión del barrio?", obligatorio: false },
    { id: "c3", tipo: "texto", etiqueta: "Comentario", obligatorio: false },
  ] },
}];

export const formulariosDemo: Pick<FuenteDatos, "formularios" | "guardarFormulario"> = {
  async formularios() { return leer<Formulario[]>(LLAVE_F, ejemplo); },
  async guardarFormulario(s, d) {
    exigirDireccion(s.rol);
    const r = revisarEsquema(d.nombre, d.esquema);
    if (r.errores.length) throw new Error(r.errores[0]);
    const lista = leer<Formulario[]>(LLAVE_F, ejemplo);
    const previo = d.id ? lista.find((f) => f.id === d.id) : undefined;
    const f: Formulario = previo
      ? { ...previo, nombre: d.nombre.trim(), esquema: d.esquema, version: JSON.stringify(previo.esquema) === JSON.stringify(d.esquema) ? previo.version : previo.version + 1 }
      : { id: `df${Date.now()}`, nombre: d.nombre.trim(), esquema: d.esquema, version: 1, creado: hoy() };
    escribir(LLAVE_F, previo ? lista.map((x) => (x.id === f.id ? f : x)) : [f, ...lista]);
    return f;
  },
};

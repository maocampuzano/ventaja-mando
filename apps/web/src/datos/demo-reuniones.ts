// Reuniones y actas en modo demo: reuniones ficticias en municipios del Caquetá, en la pestaña (sessionStorage).
// Reproduce las reglas de la base (supabase/migrations/…_reuniones.sql): quién ve qué, texto limpio de datos de
// contacto, compromisos sin dinero (regla 4) y actas aprobadas que ya no se modifican.
import { limpiarNotas, mencionaDinero, redaccionSimulada } from "@ventaja/nucleo";
import type {
  ActaReunion, DatosTablero, FuenteDatos, NuevaReunion, PersonaEquipo, Reunion, ResultadoActa, ResumenReunionesZona, Sesion,
} from "./tipos";

type Metodos = Pick<FuenteDatos, "reuniones" | "guardarReunion" | "actaDeReunion" | "guardarActa" | "aprobarActa" | "redactarActa"
  | "buscarActas" | "resumenReuniones" | "equipoReuniones">;

type Guardado = { reuniones: Reunion[]; actas: ActaReunion[] };
const LLAVE = "vm-demo-reuniones";
const DIA = 86_400_000;

const esDireccion = (s: Sesion) => s.rol === "administrador" || s.rol === "gerente";
const veTodas = (s: Sesion) => esDireccion(s) || s.rol === "candidato";

/** Reuniones de ejemplo, fechadas respecto de hoy para que siempre haya próximas y pasadas. */
function semilla(): Guardado {
  const hoy = Date.now();
  const r = (id: string, titulo: string, tipo: Reunion["tipo"], dias: number, zona: string, estado: Reunion["estado"], comunidad: number, lideres: string[]): Reunion => ({
    id, titulo, tipo, fecha: new Date(hoy + dias * DIA).toISOString(), lugar: "Lugar ficticio", territorioId: zona, estado,
    asistentesComunidad: comunidad, liderIds: lideres, equipoIds: ["coordinadora@demo.co"], acta: null,
  });
  const reuniones = [
    r("reu-1", "Reunión con líderes de Florencia", "lideres", -12, "z1", "realizada", 0, ["l1", "l2"]),
    r("reu-2", "Encuentro comunitario en Albania", "comunitaria", -8, "z2", "realizada", 45, ["l3"]),
    r("reu-3", "Mesa con productores de Belén de los Andaquíes", "sectorial", -3, "z3", "realizada", 20, []),
    r("reu-4", "Reunión de equipo en San Vicente del Caguán", "equipo", -1, "z13", "realizada", 0, ["l13"]),
    r("reu-5", "Recorrido y reunión en Solano", "comunitaria", 4, "z14", "programada", 0, []),
    r("reu-6", "Líderes de Cartagena del Chairá", "lideres", 9, "z4", "programada", 0, ["l4"]),
  ];
  const acta = (id: string, reunionId: string, resumen: string, temas: string[], acuerdos: string, aprobada: boolean,
    compromisos: ActaReunion["compromisos"]): ActaReunion => ({
    id, reunionId, resumen, temas, acuerdos, compromisos, origen: "manual", estado: aprobada ? "aprobada" : "borrador",
    aprobadaEn: aprobada ? new Date(hoy - 2 * DIA).toISOString() : null,
  });
  const actas = [
    acta("acta-1", "reu-1", "Los líderes de Florencia contaron que la vía a las veredas del norte está en mal estado y que el alumbrado de los barrios altos falla. Pidieron más acompañamiento del equipo en los fines de semana.",
      ["vías", "alumbrado"], "Hacer una reunión mensual con los líderes de la ciudad.", true,
      [{ descripcion: "Visitar las veredas del norte con el equipo técnico", responsableId: "coordinadora@demo.co", venceEn: new Date(hoy - 1 * DIA).toISOString().slice(0, 10) }]),
    acta("acta-2", "reu-2", "La comunidad de Albania habló del puesto de salud, que no tiene médico permanente, y de la falta de empleo para los jóvenes.",
      ["salud", "empleo"], "Preparar una propuesta de salud rural para el programa de gobierno.", true,
      [{ descripcion: "Enviar a la comunidad el resumen de la propuesta de salud", responsableId: "gerente@demo.co", venceEn: new Date(hoy + 10 * DIA).toISOString().slice(0, 10) }]),
    acta("acta-3", "reu-3", "Los productores de Belén pidieron apoyo para sacar la cosecha: la vía terciaria se daña con las lluvias.",
      ["campo", "vías"], "", false, []),
  ];
  reuniones[0].acta = { id: "acta-1", estado: "aprobada" };
  reuniones[1].acta = { id: "acta-2", estado: "aprobada" };
  reuniones[2].acta = { id: "acta-3", estado: "borrador" };
  return { reuniones, actas };
}

function leer(): Guardado {
  try { const v = sessionStorage.getItem(LLAVE); if (v) return JSON.parse(v); } catch { /* sin almacenamiento */ }
  return semilla();
}
function escribir(g: Guardado) { try { sessionStorage.setItem(LLAVE, JSON.stringify(g)); } catch { /* sin almacenamiento */ } }

export function crearReunionesDemo(recortar: (s: Sesion) => DatosTablero): Metodos {
  const zonasDe = (s: Sesion) => new Set(recortar(s).zonas.map((z) => z.id));
  const ve = (s: Sesion, territorioId: string | null) => veTodas(s) || (s.rol === "coordinador" && !!territorioId && zonasDe(s).has(territorioId));
  const exigir = (s: Sesion, territorioId: string | null) => {
    if (!ve(s, territorioId)) throw new Error("No puede registrar reuniones en ese territorio.");
  };
  const visibles = (s: Sesion) => leer().reuniones.filter((r) => ve(s, r.territorioId));

  return {
    async reuniones(s) {
      return visibles(s).sort((a, b) => b.fecha.localeCompare(a.fecha));
    },
    async guardarReunion(s, d: NuevaReunion) {
      exigir(s, d.territorioId);
      if (d.titulo.trim().length < 3) throw new Error("Escriba el título de la reunión.");
      const g = leer();
      const id = d.id ?? `reu-${Date.now()}`;
      const anterior = g.reuniones.find((r) => r.id === id);
      if (anterior && !ve(s, anterior.territorioId)) throw new Error("La reunión no existe o no la puede editar.");
      const nueva: Reunion = { ...d, id, titulo: d.titulo.trim(), acta: anterior?.acta ?? null };
      g.reuniones = anterior ? g.reuniones.map((r) => (r.id === id ? nueva : r)) : [nueva, ...g.reuniones];
      escribir(g);
      return id;
    },
    async actaDeReunion(s, reunionId) {
      const g = leer();
      const r = g.reuniones.find((x) => x.id === reunionId);
      if (!r || !ve(s, r.territorioId)) return null;
      return g.actas.find((a) => a.reunionId === reunionId) ?? null;
    },
    async guardarActa(s, reunionId, d) {
      const g = leer();
      const r = g.reuniones.find((x) => x.id === reunionId);
      if (!r || !ve(s, r.territorioId)) throw new Error("La reunión no existe o no la puede editar.");
      const anterior = g.actas.find((a) => a.reunionId === reunionId);
      if (anterior?.estado === "aprobada") throw new Error("El acta ya está aprobada: no se modifica.");
      const malo = d.compromisos.find((c) => mencionaDinero(c.descripcion));
      if (malo) throw new Error(`Un compromiso no puede ofrecer dinero, mercados, empleo ni otros beneficios (art. 390 del Código Penal). Revise: «${malo.descripcion.slice(0, 80)}».`);
      const acta: ActaReunion = {
        id: anterior?.id ?? `acta-${Date.now()}`, reunionId, estado: "borrador", aprobadaEn: null,
        resumen: limpiarNotas(d.resumen, 8000), acuerdos: limpiarNotas(d.acuerdos, 4000),
        temas: [...new Set(d.temas.map((t) => t.trim().toLowerCase()).filter(Boolean))].sort(),
        compromisos: d.compromisos.filter((c) => c.descripcion.trim().length >= 3).map((c) => ({ ...c, descripcion: limpiarNotas(c.descripcion, 500) })),
        origen: anterior?.origen === "ia" ? "ia" : d.origen,
      };
      g.actas = anterior ? g.actas.map((a) => (a.id === acta.id ? acta : a)) : [...g.actas, acta];
      g.reuniones = g.reuniones.map((x) => (x.id === reunionId
        ? { ...x, estado: x.estado === "programada" ? "realizada" : x.estado, acta: { id: acta.id, estado: "borrador" } } : x));
      escribir(g);
      return acta.id;
    },
    async aprobarActa(s, actaId) {
      const g = leer();
      const a = g.actas.find((x) => x.id === actaId);
      const r = a && g.reuniones.find((x) => x.id === a.reunionId);
      if (!a || !r || !ve(s, r.territorioId)) throw new Error("El acta no existe o no la puede aprobar.");
      if (a.estado === "aprobada") return 0;
      if (a.resumen.trim().length < 10) throw new Error("Escriba el resumen de la reunión antes de aprobar el acta.");
      a.estado = "aprobada"; a.aprobadaEn = new Date().toISOString();
      a.compromisos = a.compromisos.map((c, i) => ({ ...c, tareaId: `tarea-${a.id}-${i}` }));
      r.acta = { id: a.id, estado: "aprobada" };
      escribir(g);
      return a.compromisos.length;
    },
    async redactarActa(s, reunionId, notas) {
      const r = leer().reuniones.find((x) => x.id === reunionId);
      if (!r || !ve(s, r.territorioId)) throw new Error("La reunión no existe o no la puede ver.");
      if (!notas.trim()) throw new Error("Escriba las notas de la reunión o adjunte la foto del acta.");
      await new Promise((ok) => setTimeout(ok, 500));
      return { ...redaccionSimulada(notas), aviso: "Demostración: esta propuesta solo ordena sus notas. Con la IA activa, Claude redacta el acta." };
    },
    async buscarActas(s, f) {
      const g = leer();
      const nombre = new Map(recortar(s).zonas.map((z) => [z.id, z.nombre]));
      const normal = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
      const palabras = normal(f.texto ?? "").split(/\s+/).filter((p) => p.length > 2);
      return g.actas.filter((a) => a.estado === "aprobada").flatMap((a): ResultadoActa[] => {
        const r = g.reuniones.find((x) => x.id === a.reunionId);
        if (!r || !ve(s, r.territorioId)) return [];
        if (f.territorioId && r.territorioId !== f.territorioId) return [];
        if (f.desde && r.fecha.slice(0, 10) < f.desde) return [];
        if (f.hasta && r.fecha.slice(0, 10) > f.hasta) return [];
        const texto = normal(`${a.resumen} ${a.acuerdos} ${a.temas.join(" ")}`);
        if (palabras.length && !palabras.every((p) => texto.includes(p.replace(/s$/, "")))) return [];
        return [{ reunionId: r.id, actaId: a.id, titulo: r.titulo, fecha: r.fecha, territorio: (r.territorioId && nombre.get(r.territorioId)) || null,
          temas: a.temas, extracto: a.resumen.slice(0, 240) }];
      });
    },
    async resumenReuniones(s) {
      const g = leer();
      const ahora = Date.now();
      const porZona = new Map<string | null, ResumenReunionesZona>();
      const temas = new Map<string | null, Map<string, number>>();
      for (const r of visibles(s)) {
        const z = porZona.get(r.territorioId) ?? { territorioId: r.territorioId, reuniones30d: 0, actasAprobadas: 0, actasPorAprobar: 0,
          compromisosVencidos: 0, asistentesComunidad: 0, temas: [] };
        const t = new Date(r.fecha).getTime();
        if (t > ahora - 30 * DIA && r.estado !== "cancelada") z.reuniones30d++;
        if (r.estado === "realizada") z.asistentesComunidad += r.asistentesComunidad;
        const a = g.actas.find((x) => x.reunionId === r.id);
        if (a?.estado === "aprobada") {
          z.actasAprobadas++;
          z.compromisosVencidos += a.compromisos.filter((c) => c.venceEn && c.venceEn < new Date(ahora).toISOString().slice(0, 10)).length;
          const m = temas.get(r.territorioId) ?? new Map();
          for (const tm of a.temas) m.set(tm, (m.get(tm) ?? 0) + 1);
          temas.set(r.territorioId, m);
        } else if (a) z.actasPorAprobar++;
        porZona.set(r.territorioId, z);
      }
      return [...porZona.values()].map((z) => ({ ...z,
        temas: [...(temas.get(z.territorioId) ?? new Map()).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([t]) => t) }));
    },
    async equipoReuniones(s): Promise<PersonaEquipo[]> {
      if (!veTodas(s) && s.rol !== "coordinador") return [];
      return [
        { usuarioId: "gerente@demo.co", nombre: "Gerente Demo", rol: "gerente" },
        { usuarioId: "candidata@demo.co", nombre: s.campana.candidato, rol: "candidato" },
        { usuarioId: "coordinadora@demo.co", nombre: "Coordinadora Demo", rol: "coordinador" },
      ];
    },
  };
}

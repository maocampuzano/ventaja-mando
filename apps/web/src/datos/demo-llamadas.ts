// Telemarketing en modo demo: colas y llamadas en memoria de la pestaña, con personas ficticias. Reproduce las reglas
// de la base (supabase/migrations/…_telemarketing.sql): la dirección arma y maneja, el operador recibe una persona a la
// vez de sus colas y en horario, y «no volver a llamar» la saca de la cola.
import { MAX_INTENTOS_LLAMADA, dentroDeHorario, type ResultadoLlamada, type ResumenCola, type SegmentoEnvio } from "@ventaja/nucleo";
import type { ColaLlamadas, DatosTablero, EstadoCola, FuenteDatos, LlamadaEnCurso, Sesion } from "./tipos";

type Metodos = Pick<FuenteDatos, "colas" | "crearCola" | "asignarOperadores" | "cambiarEstadoCola" | "misColas" | "siguienteLlamada" | "registrarLlamada">;

const NOMBRES = ["María José Peña", "José Luis Ortiz", "Luz Dary Gómez", "Ana Ruiz", "Edilberto Cabarcas", "Yolanda Herrera",
  "Fredy Márquez", "Sandra Puello", "Kevin Arrieta", "Mónica Julio", "Rafael Salgado", "Daniela Villadiego"];
const PROPORCION_ESTADO = { sin_contactar: 0.3, contactado: 0.2, validado: 0.35, comprometido: 0.15 } as const;

type Item = { id: string; nombre: string; telefono: string; estado: "pendiente" | "en_curso" | "hecha" | "reintentar" | "descartada";
  asignadoA: string | null; intentos: number; proximo: number; resultados: { resultado: ResultadoLlamada; en: number }[] };
type Cola = { id: string; nombre: string; guion: string | null; estado: EstadoCola; creado: string; operadores: string[]; items: Item[] };

const esDireccion = (s: Sesion) => s.rol === "administrador" || s.rol === "gerente";
const hoy = (t: number) => new Date(t - 5 * 3_600_000).toISOString().slice(0, 10);

function itemsFicticios(prefijo: string, n: number): Item[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefijo}-${i}`, nombre: `${NOMBRES[i % NOMBRES.length]} (ficticia)`,
    telefono: `300 000 ${String(1000 + (i * 37) % 9000).padStart(4, "0")}`,
    estado: "pendiente", asignadoA: null, intentos: 0, proximo: 0, resultados: [],
  }));
}

export function crearLlamadasDemo(recortar: (s: Sesion) => DatosTablero): Metodos {
  let colas: Cola[] = [{
    id: "cola-demo", nombre: "Confirmación de datos (ejemplo)", guion: "Buenos días, le hablo de la campaña de Laura Méndez. Lo llamo para confirmar sus datos y contarle de la reunión del sábado. ¿Tiene un minuto?",
    estado: "activa", creado: "2026-11-01T14:00:00.000Z", operadores: ["operador@demo.co"], items: itemsFicticios("cola-demo", 40),
  }];

  function contar(s: Sesion, seg: SegmentoEnvio) {
    const fraccion = seg.estados?.length ? seg.estados.reduce((a, e) => a + PROPORCION_ESTADO[e], 0) : 1;
    return recortar(s).lideres
      .filter((l) => !seg.territorioIds?.length || seg.territorioIds.includes(l.zonaId))
      .filter((l) => !seg.liderIds?.length || seg.liderIds.includes(l.id))
      .reduce((a, l) => a + Math.floor(l.registrados * fraccion * 0.9), 0);
  }
  const buscar = (id: string) => {
    const c = colas.find((x) => x.id === id);
    if (!c) throw new Error("La cola no existe.");
    return c;
  };
  function resumen(c: Cola): ResumenCola {
    const n = (e: Item["estado"]) => c.items.filter((i) => i.estado === e).length;
    const hoyR = { contesto: 0, acepto_actividad: 0, volver_a_llamar: 0, no_contesto: 0, numero_equivocado: 0, no_volver_a_llamar: 0 };
    for (const i of c.items) for (const r of i.resultados) if (hoy(r.en) === hoy(Date.now())) hoyR[r.resultado]++;
    return { total: c.items.length, pendientes: n("pendiente"), enCurso: n("en_curso"), hechas: n("hecha"), reintentar: n("reintentar"), descartadas: n("descartada"), hoy: hoyR };
  }
  const exigirDireccion = (s: Sesion) => { if (!esDireccion(s)) throw new Error("Solo la dirección maneja las colas de llamadas."); };

  return {
    async colas(s) {
      exigirDireccion(s);
      return colas.map((c): ColaLlamadas => ({ id: c.id, nombre: c.nombre, guion: c.guion, estado: c.estado, creado: c.creado, operadores: c.operadores, resumen: resumen(c) }));
    },
    async crearCola(s, d) {
      exigirDireccion(s);
      if (!d.nombre.trim()) throw new Error("Escriba el nombre de la cola.");
      const personas = contar(s, d.segmento);
      if (!personas) throw new Error("Nadie del segmento tiene autorización vigente para que lo llamen.");
      const id = `cola-${Date.now()}`;
      colas = [{ id, nombre: d.nombre.trim(), guion: d.guion.trim() || null, estado: "activa", creado: new Date().toISOString(), operadores: [], items: itemsFicticios(id, personas) }, ...colas];
      return { id, personas };
    },
    async asignarOperadores(s, colaId, operadores) { exigirDireccion(s); buscar(colaId).operadores = [...operadores]; },
    async cambiarEstadoCola(s, colaId, estado) {
      exigirDireccion(s);
      const c = buscar(colaId);
      c.estado = estado;
      if (estado !== "activa") for (const i of c.items) if (i.estado === "en_curso") { i.estado = "pendiente"; i.asignadoA = null; }
    },
    async misColas(s) {
      if (s.rol !== "operador") return [];
      const ahora = Date.now();
      return colas.filter((c) => c.operadores.includes(s.usuarioId)).map((c) => ({
        id: c.id, nombre: c.nombre, estado: c.estado,
        porLlamar: c.items.filter((i) => i.estado === "pendiente" || (i.estado === "reintentar" && i.proximo <= ahora)).length,
      }));
    },
    async siguienteLlamada(s, colaId): Promise<LlamadaEnCurso | null> {
      const c = buscar(colaId);
      if (s.rol !== "operador" || !c.operadores.includes(s.usuarioId)) throw new Error("La cola no existe o no está asignada a usted.");
      if (c.estado !== "activa") throw new Error(`Esta cola está ${c.estado}.`);
      const h = dentroDeHorario(new Date());
      if (!h.permitido) throw new Error(`Fuera del horario de llamadas. ${h.motivo?.replace("se envían mensajes", "se llama")}`);
      const ahora = Date.now();
      let item = c.items.find((i) => i.estado === "en_curso" && i.asignadoA === s.usuarioId)
        ?? c.items.find((i) => i.estado === "pendiente") ?? c.items.find((i) => i.estado === "reintentar" && i.proximo <= ahora);
      if (!item) return null;
      item.estado = "en_curso"; item.asignadoA = s.usuarioId;
      item = { ...item };
      return { itemId: item.id, nombre: item.nombre, telefono: item.telefono, intentos: item.intentos, guion: c.guion };
    },
    async registrarLlamada(s, itemId, resultado) {
      const item = colas.flatMap((c) => c.items).find((i) => i.id === itemId);
      if (!item || item.estado !== "en_curso" || item.asignadoA !== s.usuarioId) throw new Error("Esta llamada no está en sus manos.");
      const ahora = Date.now();
      item.intentos++; item.asignadoA = null; item.resultados.push({ resultado, en: ahora });
      if (resultado === "contesto" || resultado === "acepto_actividad") item.estado = "hecha";
      else if (resultado === "volver_a_llamar") { item.estado = "reintentar"; item.proximo = ahora + 86_400_000; }
      else if (resultado === "no_contesto" && item.intentos < MAX_INTENTOS_LLAMADA) { item.estado = "reintentar"; item.proximo = ahora + 7_200_000; }
      else item.estado = "descartada";
    },
  };
}

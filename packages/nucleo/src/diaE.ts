// Día E: semáforo de cada mesa, escalamiento de novedades y resumen del centro de mando (fase 5).
// Todo es agregado por mesa: aquí no entra ningún dato de personas ni de cómo votó alguien.

export type Semaforo = "verde" | "ambar" | "rojo";
export type Prioridad = "alta" | "media" | "baja";
export type EstadoNovedad = "abierta" | "atendida" | "escalada" | "cerrada";
export type EstadoTestigo = "asignado" | "confirmado" | "en_mesa" | "retirado";
export type EstadoActa = "recibida" | "leida" | "revisada" | "consolidada" | "descartada";

/** Horario de la jornada. En Colombia las mesas abren a las 8:00 y cierran a las 16:00 (hora de Bogotá). */
export type Jornada = { apertura: Date; cierre: Date };

export type NovedadDiaE = {
  id: string;
  prioridad: Prioridad;
  estado: EstadoNovedad;
  hora: Date;
  /** Si ya se escaló, desde cuándo. */
  escaladaEn?: Date | null;
};

export type MesaDiaE = {
  puestoId: string;
  mesa: number;
  testigo: EstadoTestigo | null;
  acta: EstadoActa | null;
  /** Alertas aritméticas del acta que siguen sin revisar. */
  alertasActa: number;
  novedades: NovedadDiaE[];
};

/** Minutos que puede esperar una novedad abierta antes de escalarse, según su prioridad. */
export const ESPERA_NOVEDAD: Record<Prioridad, number> = { alta: 15, media: 45, baja: 120 };
/** Tolerancia para que el testigo llegue a la mesa después de la apertura. */
export const LLEGADA_TESTIGO = { ambar: 30, rojo: 60 };
/** Tolerancia para recibir la foto del E-14 después del cierre. */
export const ESPERA_E14 = { ambar: 60, rojo: 120 };

const minutos = (desde: Date, hasta: Date) => (hasta.getTime() - desde.getTime()) / 60_000;
const PESO_PRIORIDAD: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 };
const PESO_SEMAFORO: Record<Semaforo, number> = { rojo: 0, ambar: 1, verde: 2 };

export const novedadPendiente = (n: NovedadDiaE) => n.estado === "abierta" || n.estado === "escalada";

/** Una novedad abierta se escala cuando pasa su tiempo de espera. Una ya escalada no se vuelve a escalar. */
export function debeEscalar(n: NovedadDiaE, ahora: Date): boolean {
  return n.estado === "abierta" && minutos(n.hora, ahora) >= ESPERA_NOVEDAD[n.prioridad];
}

/** Novedades pendientes: primero las escaladas, luego por prioridad y, a igual prioridad, la más antigua. */
export function ordenarNovedades<T extends NovedadDiaE>(novedades: readonly T[]): T[] {
  return novedades
    .filter(novedadPendiente)
    .sort((a, b) =>
      Number(b.estado === "escalada") - Number(a.estado === "escalada") ||
      PESO_PRIORIDAD[a.prioridad] - PESO_PRIORIDAD[b.prioridad] ||
      a.hora.getTime() - b.hora.getTime());
}

export type EstadoMesa = { semaforo: Semaforo; motivo: string };

/**
 * Semáforo de una mesa en un momento de la jornada. Rojo pide acción ya; ámbar, atención; verde, nada pendiente.
 * El motivo se muestra en la interfaz: el semáforo nunca aparece sin su porqué.
 */
export function estadoMesa(m: MesaDiaE, ahora: Date, j: Jornada): EstadoMesa {
  const pendientes = m.novedades.filter(novedadPendiente);
  const escaladas = pendientes.filter((n) => n.estado === "escalada" || debeEscalar(n, ahora));
  if (escaladas.length) return { semaforo: "rojo", motivo: "Novedad sin atender a tiempo" };
  if (pendientes.some((n) => n.prioridad === "alta")) return { semaforo: "rojo", motivo: "Novedad de prioridad alta" };

  const cubierta = m.testigo !== null && m.testigo !== "retirado";
  const despuesCierre = minutos(j.cierre, ahora);
  const actaLlego = m.acta !== null && m.acta !== "descartada";

  if (despuesCierre >= 0) {
    if (actaLlego) {
      if (m.alertasActa > 0 && m.acta !== "revisada" && m.acta !== "consolidada") return { semaforo: "ambar", motivo: "E-14 con alertas por revisar" };
      if (m.acta === "recibida" || m.acta === "leida") return { semaforo: "ambar", motivo: "E-14 por revisar" };
      return pendientes.length ? { semaforo: "ambar", motivo: "Novedad abierta" } : { semaforo: "verde", motivo: "E-14 revisado" };
    }
    if (!cubierta) return { semaforo: "rojo", motivo: "Sin testigo y sin E-14" };
    if (despuesCierre >= ESPERA_E14.rojo) return { semaforo: "rojo", motivo: "E-14 sin llegar" };
    if (despuesCierre >= ESPERA_E14.ambar) return { semaforo: "ambar", motivo: "E-14 demorado" };
    return { semaforo: pendientes.length ? "ambar" : "verde", motivo: pendientes.length ? "Novedad abierta" : "Esperando el E-14" };
  }

  if (!cubierta) return { semaforo: "rojo", motivo: m.testigo === "retirado" ? "El testigo se retiró" : "Sin testigo" };
  const despuesApertura = minutos(j.apertura, ahora);
  if (m.testigo !== "en_mesa" && despuesApertura >= LLEGADA_TESTIGO.rojo) return { semaforo: "rojo", motivo: "El testigo no ha llegado" };
  if (m.testigo !== "en_mesa" && despuesApertura >= LLEGADA_TESTIGO.ambar) return { semaforo: "ambar", motivo: "El testigo no ha llegado" };
  if (pendientes.length) return { semaforo: "ambar", motivo: "Novedad abierta" };
  return { semaforo: "verde", motivo: m.testigo === "en_mesa" ? "Testigo en la mesa" : "Testigo asignado" };
}

export type ResumenDiaE = {
  mesas: number;
  conTestigo: number;
  testigosEnMesa: number;
  actasRecibidas: number;
  actasRevisadas: number;
  novedadesPendientes: number;
  novedadesPorEscalar: number;
  semaforo: Record<Semaforo, number>;
};

/** Cifras del encabezado del centro de mando. */
export function resumenDiaE(mesas: readonly MesaDiaE[], ahora: Date, j: Jornada): ResumenDiaE {
  const semaforo: Record<Semaforo, number> = { verde: 0, ambar: 0, rojo: 0 };
  let novedadesPendientes = 0, novedadesPorEscalar = 0;
  for (const m of mesas) {
    semaforo[estadoMesa(m, ahora, j).semaforo]++;
    for (const n of m.novedades) {
      if (novedadPendiente(n)) novedadesPendientes++;
      if (debeEscalar(n, ahora)) novedadesPorEscalar++;
    }
  }
  const llego = (m: MesaDiaE) => m.acta !== null && m.acta !== "descartada";
  return {
    mesas: mesas.length,
    conTestigo: mesas.filter((m) => m.testigo !== null && m.testigo !== "retirado").length,
    testigosEnMesa: mesas.filter((m) => m.testigo === "en_mesa").length,
    actasRecibidas: mesas.filter(llego).length,
    actasRevisadas: mesas.filter((m) => m.acta === "revisada" || m.acta === "consolidada").length,
    novedadesPendientes,
    novedadesPorEscalar,
    semaforo,
  };
}

/** Mesas para atender primero: rojo antes que ámbar, y entre iguales el orden de llegada. Las verdes no entran. */
export function mesasPorAtender(mesas: readonly MesaDiaE[], ahora: Date, j: Jornada) {
  return mesas
    .map((m) => ({ ...m, ...estadoMesa(m, ahora, j) }))
    .filter((m) => m.semaforo !== "verde")
    .sort((a, b) => PESO_SEMAFORO[a.semaforo] - PESO_SEMAFORO[b.semaforo]);
}

/**
 * Jornada en hora de Bogotá (UTC-5, sin horario de verano) para una fecha `aaaa-mm-dd`.
 * Se construye con el desfase fijo para no depender de la zona horaria del equipo.
 */
export function jornadaBogota(fecha: string, apertura = "08:00", cierre = "16:00"): Jornada {
  return { apertura: new Date(`${fecha}T${apertura}:00-05:00`), cierre: new Date(`${fecha}T${cierre}:00-05:00`) };
}

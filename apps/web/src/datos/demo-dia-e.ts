// Día E en modo demo. Los hechos de la jornada (llegadas, novedades y actas) salen de una regla fija por mesa, según
// la hora: así el tablero se ve igual en cada recarga y el simulacro avanza solo. Lo que hace quien usa el panel
// (atender, escalar, revisar) queda encima, en memoria de la pestaña. Todo es ficticio.
//
// Sin simulacro, el reloj está quieto a las 4:40 p. m. del día de la elección: las mesas ya cerraron y van llegando
// los E-14. Con simulacro, la jornada corre de 7:50 a. m. en adelante, cuatro minutos por cada segundo real.
import { alertasActa, jornadaBogota, lecturaSimuladaE14, type ActaLeida, type EstadoActa, type Prioridad } from "@ventaja/nucleo";
import type { Mesa } from "@ventaja/nucleo";
import type { ActaParaRevisar, DatosTablero, FuenteDatos, MesaTablero, NovedadTablero, Sesion, Simulacro } from "./tipos";

type MetodosDiaE = Pick<FuenteDatos, "tableroDiaE" | "simulacroActivo" | "iniciarSimulacro" | "terminarSimulacro" |
  "atenderNovedad" | "escalarNovedades" | "actaE14" | "revisarE14" | "suscribirDiaE" | "relojDiaE">;

export const VELOCIDAD_SIMULACRO = 240; // minutos de jornada por minuto real (4 por segundo)
const TIPOS = ["Fila larga, votantes se están yendo", "Testigo no admitido por el jurado", "Falta material de la mesa",
  "Jurado ausente en la mesa", "Propaganda dentro del puesto"];
const PRIORIDAD_PESO = { alta: 0, media: 1, baja: 2 } as const;
const MIN = 60_000;

/** Número pseudoaleatorio fijo entre 0 y 1 para una mesa y una sal. */
function azar(...partes: (string | number)[]): number {
  let h = 2166136261;
  for (const c of partes.join("|")) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100_000) / 100_000;
}

type Capa = { novedades: Map<string, Partial<NovedadTablero>>; actas: Map<string, { estado: EstadoActa; lectura: ActaLeida | null }> };
const capaNueva = (): Capa => ({ novedades: new Map(), actas: new Map() });

const puedeVer = (s: Sesion) => ["administrador", "gerente", "candidato", "coordinador"].includes(s.rol);
const puedeManejar = (s: Sesion) => ["administrador", "gerente", "coordinador"].includes(s.rol);
const esDireccion = (s: Sesion) => s.rol === "administrador" || s.rol === "gerente";

export function crearDiaEDemo(recortar: (s: Sesion) => DatosTablero, eleccion: string): MetodosDiaE {
  const jornada = jornadaBogota(eleccion);
  const relojQuieto = new Date(jornada.cierre.getTime() + 40 * MIN);
  let simulacro: (Simulacro & { inicioReal: number }) | null = null;
  const real = capaNueva();
  let sim = capaNueva();
  const oyentes = new Set<() => void>();
  let pulso: ReturnType<typeof setInterval> | null = null;
  const avisar = () => oyentes.forEach((f) => f());

  const ahoraDe = (enSimulacro: boolean) => enSimulacro && simulacro
    ? new Date(jornada.apertura.getTime() - 10 * MIN + (Date.now() - simulacro.inicioReal) * VELOCIDAD_SIMULACRO)
    : relojQuieto;

  function mesaEn(m: Mesa, puesto: string, ahora: Date, capa: Capa, semilla: string, autoAtender: boolean): MesaTablero {
    const k = `${m.puestoId}-${m.mesa}`;
    const minuto = (desde: Date, x: number) => new Date(desde.getTime() + x * MIN);
    const llegaA = -20 + azar(semilla, k, "llega") * 80; // de 7:40 a 9:00
    const nuncaLlega = azar(semilla, k, "nunca") > 0.95;
    const llego = !!m.testigoId && !nuncaLlega && ahora >= minuto(jornada.apertura, llegaA);

    const novedades: NovedadTablero[] = [];
    if (m.testigoId && azar(semilla, k, "nov") < 0.14) {
      const hora = minuto(jornada.apertura, azar(semilla, k, "hora") * 470);
      if (ahora >= hora) {
        const p = azar(semilla, k, "prio");
        const prioridad: Prioridad = p < 0.25 ? "alta" : p < 0.7 ? "media" : "baja";
        const id = `nov-${semilla}-${k}`;
        const viejaYAtendida = autoAtender && ahora.getTime() - hora.getTime() > 90 * MIN;
        novedades.push({
          id, prioridad, hora, tipo: TIPOS[Math.floor(azar(semilla, k, "tipo") * TIPOS.length)],
          estado: viejaYAtendida ? "atendida" : "abierta", escaladaEn: null, responsableId: null, ...capa.novedades.get(id),
        });
      }
    }

    let acta: EstadoActa | null = null; let alertas = 0; let actaId: string | null = null;
    const actaA = minuto(jornada.cierre, 10 + azar(semilla, k, "acta") * 130);
    if (llego && azar(semilla, k, "sin-acta") < 0.93 && ahora >= actaA) {
      actaId = `acta-${semilla}-${k}`;
      const revision = capa.actas.get(actaId);
      acta = revision?.estado ?? "leida";
      alertas = revision ? (revision.lectura ? alertasActa(revision.lectura).length : 0) : alertasActa(lecturaDe(semilla, m)).length;
    }

    return {
      puestoId: m.puestoId, mesa: m.mesa, puesto, votosHistoricos: m.votosHistoricos,
      testigo: m.testigoId ? (llego ? "en_mesa" : "confirmado") : null,
      llegadaEn: llego ? minuto(jornada.apertura, llegaA) : null, acta, actaId, alertasActa: alertas, novedades,
    };
  }

  /** Lectura simulada del acta: una de cada cinco trae un descuadre para que la revisión tenga qué encontrar. */
  function lecturaDe(semilla: string, m: Mesa): ActaLeida {
    const base = lecturaSimuladaE14();
    const f = 0.7 + azar(semilla, m.puestoId, m.mesa, "votos") * 0.6;
    const votos = base.votos.map((v) => ({ ...v, votos: Math.round((v.votos ?? 0) * f) }));
    const suma = votos.reduce((a, v) => a + (v.votos ?? 0), 0) + (base.blancos ?? 0) + (base.nulos ?? 0) + (base.noMarcados ?? 0);
    const descuadre = azar(semilla, m.puestoId, m.mesa, "descuadre") < 0.2;
    return {
      ...base, mesa: m.mesa, votos, totalVotos: descuadre ? suma + 10 : suma, sufragantes: suma + 3,
      confianza: descuadre ? 0.78 : base.confianza,
    };
  }

  function mesas(s: Sesion, enSimulacro: boolean): MesaTablero[] {
    if (!puedeVer(s)) throw new Error("No tiene acceso al tablero del día E de esta campaña.");
    const ahora = ahoraDe(enSimulacro);
    const capa = enSimulacro ? sim : real;
    const semilla = enSimulacro ? `sim-${simulacro?.id ?? ""}` : "real";
    return recortar(s).puestos.flatMap((p) => p.mesas.map((m) => mesaEn(m, p.nombre, ahora, capa, semilla, !enSimulacro)));
  }

  const buscarMesaDeActa = (s: Sesion, id: string) => {
    for (const enSimulacro of [false, true]) {
      const m = mesas(s, enSimulacro).find((x) => x.actaId === id);
      if (m) return { m, enSimulacro };
    }
    throw new Error("El acta no existe o no la puede revisar.");
  };

  return {
    async tableroDiaE(s, enSimulacro) { return mesas(s, enSimulacro); },
    async simulacroActivo() { return simulacro && { id: simulacro.id, iniciado: simulacro.iniciado }; },
    async iniciarSimulacro(s) {
      if (!esDireccion(s)) throw new Error("Solo la dirección de la campaña inicia un simulacro.");
      if (simulacro) throw new Error("Ya hay un simulacro en curso.");
      const id = `${Date.now()}`;
      simulacro = { id, iniciado: new Date().toISOString(), inicioReal: Date.now() };
      sim = capaNueva();
      pulso = setInterval(avisar, 2000);
      avisar();
    },
    async terminarSimulacro(s) {
      if (!esDireccion(s)) throw new Error("Solo la dirección de la campaña termina un simulacro.");
      if (!simulacro) throw new Error("No hay un simulacro en curso.");
      const ms = mesas(s, true);
      const resumen = {
        novedades: ms.reduce((a, m) => a + m.novedades.length, 0),
        actas: ms.filter((m) => m.acta).length,
        testigos: ms.filter((m) => m.testigo === "en_mesa").length,
      };
      simulacro = null; sim = capaNueva();
      if (pulso) clearInterval(pulso);
      pulso = null;
      avisar();
      return resumen;
    },
    async atenderNovedad(s, id, estado, responsableId) {
      if (!puedeManejar(s)) throw new Error("La novedad no existe o no la puede atender.");
      const capa = id.startsWith("nov-sim-") ? sim : real;
      const antes = capa.novedades.get(id) ?? {};
      capa.novedades.set(id, {
        ...antes,
        ...(estado ? { estado, ...(estado === "abierta" ? { escaladaEn: null } : {}) } : {}),
        ...(responsableId ? { responsableId } : {}),
      });
      avisar();
    },
    async escalarNovedades(s) {
      if (!puedeManejar(s)) throw new Error("Solo la dirección o la coordinación escalan novedades.");
      let n = 0;
      for (const enSimulacro of simulacro ? [false, true] : [false]) {
        const ahora = ahoraDe(enSimulacro);
        const capa = enSimulacro ? sim : real;
        for (const m of mesas(s, enSimulacro)) {
          for (const nov of m.novedades) {
            const espera = [15, 45, 120][PRIORIDAD_PESO[nov.prioridad]];
            if (nov.estado === "abierta" && ahora.getTime() - nov.hora.getTime() >= espera * MIN) {
              capa.novedades.set(nov.id, { ...capa.novedades.get(nov.id), estado: "escalada", escaladaEn: ahora });
              n++;
            }
          }
        }
      }
      if (n) avisar();
      return n;
    },
    async actaE14(s, id): Promise<ActaParaRevisar> {
      const { m, enSimulacro } = buscarMesaDeActa(s, id);
      const capa = enSimulacro ? sim : real;
      const semilla = enSimulacro ? `sim-${simulacro?.id ?? ""}` : "real";
      const mesaSemilla = recortar(s).puestos.find((p) => p.id === m.puestoId)!.mesas.find((x) => x.mesa === m.mesa)!;
      return {
        id, puesto: m.puesto, mesa: m.mesa, estado: m.acta ?? "recibida", foto: null,
        lectura: capa.actas.get(id)?.lectura ?? lecturaDe(semilla, mesaSemilla), subidaPorMi: false,
      };
    },
    async revisarE14(s, id, acta) {
      if (!puedeManejar(s)) throw new Error("El acta no existe o no la puede revisar.");
      const { m, enSimulacro } = buscarMesaDeActa(s, id);
      if (m.acta === "revisada" || m.acta === "descartada" || m.acta === "consolidada") throw new Error("El acta ya fue revisada.");
      (enSimulacro ? sim : real).actas.set(id, { estado: acta ? "revisada" : "descartada", lectura: acta });
      avisar();
    },
    suscribirDiaE(_s, alCambiar) {
      oyentes.add(alCambiar);
      return () => { oyentes.delete(alCambiar); };
    },
    relojDiaE(_s, sim) { return { ahora: ahoraDe(!!sim), jornada }; },
  };
}

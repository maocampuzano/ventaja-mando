// Índice del líder antes de la elección (diseño §7.3). La interfaz muestra los cuatro componentes.

export type StatsLider = {
  registrados: number;
  validados: number;
  duplicadosConOtros: number;
  tareasHechas: number;
  tareasAsignadas: number;
  meta: number;
};

export function indiceLider(s: StatsLider) {
  const calidad = s.registrados ? s.validados / s.registrados : 0;
  const limpieza = s.registrados ? 1 - s.duplicadosConOtros / s.registrados : 1;
  const ejecucion = s.tareasAsignadas ? s.tareasHechas / s.tareasAsignadas : 0;
  const avanceMeta = s.meta ? Math.min(1, s.validados / s.meta) : 0;
  const total = 0.35 * calidad + 0.25 * limpieza + 0.2 * ejecucion + 0.2 * avanceMeta;
  return { total, componentes: { calidad, limpieza, ejecucion, avanceMeta } };
}

// ---------- Después de la elección: cumplimiento contra el E-14 (diseño §7.3) ----------
// Comparación AGREGADA por mesa: apoyos que el líder registró en sus mesas frente a los votos del candidato en los
// E-14 revisados de esas mesas. Nunca dice cómo votó una persona ni prueba el aporte del líder.

/** Con pocas mesas o pocos apoyos, comparar apoyos con votos podría insinuar cómo votó alguien: no se muestra. */
export const MINIMO_MESAS_CUMPLIMIENTO = 3;
export const MINIMO_APOYOS_CUMPLIMIENTO = 10;
export const ADVERTENCIA_CUMPLIMIENTO =
  "Indicador agregado por mesa con E-14 revisados: no identifica votos individuales ni prueba el aporte causal del líder.";

export type MesaLider = { apoyosRegistrados: number; votosCandidatoE14: number; votosCandidatoHistorico: number | null };

export type CumplimientoPost =
  | { suficiente: true; mesas: number; apoyos: number; votos: number; cobertura: number; crecimiento: number | null; advertencia: string }
  | { suficiente: false; mesas: number; apoyos: number; motivo: string; advertencia: string };

export type TotalesCumplimiento = { mesas: number; apoyos: number; votos: number; votosHistoricos: number | null; mesasSinHistorico: number };

/** El índice a partir de los totales del líder (así lo devuelve la base, que no entrega el detalle por mesa). */
export function cumplimientoDesdeTotales(t: TotalesCumplimiento): CumplimientoPost {
  const advertencia = ADVERTENCIA_CUMPLIMIENTO;
  if (t.mesas < MINIMO_MESAS_CUMPLIMIENTO || t.apoyos < MINIMO_APOYOS_CUMPLIMIENTO) {
    return {
      suficiente: false, mesas: t.mesas, apoyos: t.apoyos, advertencia,
      motivo: `Hacen falta al menos ${MINIMO_MESAS_CUMPLIMIENTO} mesas con E-14 revisado y ${MINIMO_APOYOS_CUMPLIMIENTO} apoyos para compararlos sin exponer a nadie.`,
    };
  }
  // El crecimiento solo se calcula si todas las mesas tienen histórico: mezclar mesas con y sin él lo inflaría.
  const base = t.mesasSinHistorico === 0 ? t.votosHistoricos : null;
  return {
    suficiente: true, mesas: t.mesas, apoyos: t.apoyos, votos: t.votos, advertencia,
    cobertura: Math.min(1, t.votos / t.apoyos), // votos obtenidos frente a apoyos que el líder registró en esas mesas
    crecimiento: base ? (t.votos - base) / base : null, // frente al histórico: no prueba causalidad
  };
}

export function cumplimientoPost(mesas: readonly MesaLider[]): CumplimientoPost {
  const conApoyos = mesas.filter((m) => m.apoyosRegistrados > 0);
  return cumplimientoDesdeTotales({
    mesas: conApoyos.length,
    apoyos: conApoyos.reduce((a, m) => a + m.apoyosRegistrados, 0),
    votos: conApoyos.reduce((a, m) => a + m.votosCandidatoE14, 0),
    votosHistoricos: conApoyos.reduce((a, m) => a + (m.votosCandidatoHistorico ?? 0), 0),
    mesasSinHistorico: conApoyos.filter((m) => m.votosCandidatoHistorico === null).length,
  });
}

/** Votos de una opción en un acta revisada. Compara sin tildes, mayúsculas ni espacios de más. */
export function votosDeOpcion(votos: readonly { opcion: string; votos: number | null }[], opcion: string): number | null {
  const norma = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const buscada = norma(opcion);
  const fila = votos.find((v) => norma(v.opcion) === buscada);
  return fila ? fila.votos : null;
}

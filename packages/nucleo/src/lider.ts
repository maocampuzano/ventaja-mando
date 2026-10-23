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

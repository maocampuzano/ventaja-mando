// Lógica del producto (diseño propio, ver 02-diseno-nuestra-version.md §7).

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

export type Senal = { territorioId: string; alcanceDigital: number; validados: number; potencial: number };
export type Accion = "brigada" | "pauta" | "oportunidad" | "mantener";

export function recomendar(s: Senal[]) {
  const max = (k: "alcanceDigital" | "validados" | "potencial") => Math.max(1, ...s.map((x) => x[k]));
  const mA = max("alcanceDigital"), mV = max("validados"), mP = max("potencial");
  return s.map((x) => {
    const digital = x.alcanceDigital / mA;
    const tierra = x.validados / mV;
    const brecha = x.potencial / mP;
    const accion: Accion =
      digital > 0.5 && tierra < 0.45 ? "brigada" :
      tierra > 0.5 && digital < 0.45 ? "pauta" :
      brecha > 0.55 && digital < 0.5 && tierra < 0.5 ? "oportunidad" :
      "mantener";
    return { territorioId: x.territorioId, digital, tierra, brecha, accion };
  });
}

export const textoAccion: Record<Accion, string> = {
  brigada: "Enviar brigada: hay atención digital sin estructura",
  pauta: "Subir pauta: hay estructura sin visibilidad",
  oportunidad: "Territorio de oportunidad: plan conjunto",
  mantener: "Mantener el ritmo",
};

export type Mesa = { puestoId: string; mesa: number; testigoId?: string; votosHistoricos: number };

export function prioridadCobertura(mesas: Mesa[]) {
  return mesas.filter((m) => !m.testigoId).sort((x, y) => y.votosHistoricos - x.votosHistoricos);
}

export const porcentajeCobertura = (mesas: Mesa[]) =>
  mesas.length ? mesas.filter((m) => m.testigoId).length / mesas.length : 0;

export function enlaceWhatsAppManual(telefonoE164: string, texto: string) {
  return `https://wa.me/${telefonoE164.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`;
}

export const pct = (x: number) => `${Math.round(x * 100)} %`;
export const miles = (n: number) => n.toLocaleString("es-CO");

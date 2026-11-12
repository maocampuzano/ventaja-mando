// Recomendación tierra + pauta por territorio (diseño §7.4).
// Los umbrales son los del prototipo (0,5 / 0,45 / 0,55), no los del ejemplo del diseño (0,6 / 0,3).

export type Senal = { territorioId: string; alcanceDigital: number; validados: number; potencial: number };
export type Accion = "brigada" | "pauta" | "oportunidad" | "mantener";

/** ¿Hay datos de pauta digital conectados? Sin ellos, la recomendación sale solo de la base y del potencial. */
export const hayPauta = (s: readonly { alcanceDigital: number }[]) => s.some((x) => x.alcanceDigital > 0);

export function recomendar(s: Senal[]) {
  const conPauta = hayPauta(s);
  const max = (k: "alcanceDigital" | "validados" | "potencial") => Math.max(1, ...s.map((x) => x[k]));
  const mA = max("alcanceDigital"), mV = max("validados"), mP = max("potencial");
  return s.map((x) => {
    const digital = x.alcanceDigital / mA;
    const tierra = x.validados / mV;
    const brecha = x.potencial / mP;
    // Sin pauta conectada solo hay dos salidas: brigada donde hay muchos votos en juego y poca base, o mantener.
    const accion: Accion = !conPauta ? (brecha > 0.55 && tierra < 0.5 ? "brigada" : "mantener") :
      digital > 0.5 && tierra < 0.45 ? "brigada" :
      tierra > 0.5 && digital < 0.45 ? "pauta" :
      brecha > 0.55 && digital < 0.5 && tierra < 0.5 ? "oportunidad" :
      "mantener";
    return { territorioId: x.territorioId, digital, tierra, brecha, accion, texto: (conPauta ? textoAccion : textoAccionSinPauta)[accion] };
  });
}

export const textoAccion: Record<Accion, string> = {
  brigada: "Enviar brigada: hay atención digital sin estructura",
  pauta: "Subir pauta: hay estructura sin visibilidad",
  oportunidad: "Territorio de oportunidad: plan conjunto",
  mantener: "Mantener el ritmo",
};
/** Los mismos textos cuando la campaña no tiene pauta conectada: no hablan de atención digital. */
export const textoAccionSinPauta: Record<Accion, string> = {
  ...textoAccion,
  brigada: "Enviar brigada: muchos votos en juego y poca base",
};

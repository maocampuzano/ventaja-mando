// Recomendación tierra + pauta por territorio (diseño §7.4).
// Los umbrales son los del prototipo (0,5 / 0,45 / 0,55), no los del ejemplo del diseño (0,6 / 0,3).

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

// Cifras derivadas del tablero: totales y recomendaciones, calculadas sobre lo que la sesión puede ver.
import { recomendar, veTodaLaCampana, type RolCampana } from "@ventaja/nucleo";
import type { Zona } from "../data";
import type { DatosTablero } from "./tipos";

export function armarTablero(d: DatosTablero, rol: RolCampana) {
  const recomendaciones = recomendar(
    d.zonas.map((z) => ({ territorioId: z.id, alcanceDigital: z.alcance, validados: z.validados, potencial: z.potencial })),
  );
  const porZona = new Map(d.zonas.map((z) => [z.id, z]));
  const porRec = new Map(recomendaciones.map((r) => [r.territorioId, r]));
  const s = (k: keyof Zona) => d.zonas.reduce((a, z) => a + (z[k] as number), 0);
  return {
    ...d,
    recomendaciones,
    recDe: (id: string) => porRec.get(id)!,
    zonaDe: (id: string) => porZona.get(id)!,
    // Quien ve una parte de la campaña se mide contra la meta de sus zonas, no contra la de toda la campaña.
    meta: veTodaLaCampana(rol)
      ? { votos: d.campana.metaVotos, texto: "Meta" }
      : { votos: s("meta"), texto: "Meta de sus zonas" },
    todasLasMesas: d.puestos.flatMap((p) => p.mesas),
    totales: {
      bruto: s("bruto"), validados: s("validados"), comprometidos: s("comprometidos"), lideres: d.lideres.length,
      alcance: s("alcance"), clics: s("clics"), gasto: s("gasto"), potencial: s("potencial"),
    },
  };
}

export type Tablero = ReturnType<typeof armarTablero>;

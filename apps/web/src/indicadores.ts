// Funciones de apoyo de las pantallas (sin componentes): días para la elección y color del índice.

/** `eleccion` en aaaa-mm-dd. Sin fecha configurada devuelve 0. */
export function diasParaEleccion(eleccion: string) {
  if (!eleccion) return 0;
  const e = new Date(`${eleccion}T00:00:00-05:00`);
  return Math.max(0, Math.ceil((e.getTime() - Date.now()) / 86400000));
}

export const colorIndice = (x: number) => (x >= 0.7 ? "var(--verde)" : x >= 0.5 ? "var(--ambar)" : "var(--rojo)");
export const claseIndice = (x: number) => (x >= 0.7 ? "verde" : x >= 0.5 ? "ambar" : "rojo");

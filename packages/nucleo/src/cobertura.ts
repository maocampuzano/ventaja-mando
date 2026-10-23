// Brechas de cobertura de testigos el día electoral (diseño §7.2).

export type Mesa = { puestoId: string; mesa: number; testigoId?: string; votosHistoricos: number };

// Primero, las mesas sin testigo donde hay más votos en juego.
export function prioridadCobertura(mesas: Mesa[]) {
  return mesas.filter((m) => !m.testigoId).sort((x, y) => y.votosHistoricos - x.votosHistoricos);
}

export const porcentajeCobertura = (mesas: Mesa[]) =>
  mesas.length ? mesas.filter((m) => m.testigoId).length / mesas.length : 0;

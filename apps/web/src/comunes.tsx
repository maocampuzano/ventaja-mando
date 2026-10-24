import type { ReactNode } from "react";

const trazos: Record<string, ReactNode> = {
  mando: <><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" /></>,
  resumen: <><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="5" rx="2" /><rect x="13" y="10" width="8" height="11" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /></>,
  lideres: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.6c2.7.2 5 2 5 5.4" /></>,
  planillas: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  diae: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /><path d="M8 14l2.5 2.5L16 12" /></>,
  equipo: <><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><path d="M2.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><path d="M14.5 14.2c3 .1 7 1.6 7 4.8" /></>,
  formularios: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h3M8 12h3M8 16h3" /><path d="M14 8l1.5 1.5L18 7M14 12h4M14 16h4" /></>,
  importar: <><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>,
  datos: <><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  movil: <><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18h2" /></>,
};

export function Icono({ n }: { n: keyof typeof trazos }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {trazos[n]}
    </svg>
  );
}

export function Barra({ valor, color }: { valor: number; color?: string }) {
  return (
    <div className="barra-h" aria-hidden="true">
      <span style={{ width: `${Math.max(0, Math.min(1, valor)) * 100}%`, background: color }} />
    </div>
  );
}

/** `eleccion` en aaaa-mm-dd. Sin fecha configurada devuelve 0. */
export function diasParaEleccion(eleccion: string) {
  if (!eleccion) return 0;
  const e = new Date(`${eleccion}T00:00:00-05:00`);
  return Math.max(0, Math.ceil((e.getTime() - Date.now()) / 86400000));
}

export const colorIndice = (x: number) => (x >= 0.7 ? "var(--verde)" : x >= 0.5 ? "var(--ambar)" : "var(--rojo)");
export const claseIndice = (x: number) => (x >= 0.7 ? "verde" : x >= 0.5 ? "ambar" : "rojo");

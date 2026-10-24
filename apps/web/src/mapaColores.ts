// Colores de las capas del mapa. Los usan el mapa SVG (Mapa.tsx) y el de MapLibre (MapaReal.tsx), para que pinten igual.
import { porcentajeCobertura, type Accion, type Mesa } from "@ventaja/nucleo";
import type { Puesto, Zona } from "./data";

export type Capa = "accion" | "tierra" | "pauta" | "meta" | "testigos";
type Rec = { accion: Accion; digital: number };

export const colorAccion: Record<Accion, string> = { brigada: "#f0a73a", pauta: "#1f5bff", oportunidad: "#b46cff", mantener: "#3a465c" };
const SIN_DATO = "#2a3140";

function mezcla(a: string, b: string, t: number) {
  const pa = a.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const c = pa.map((x, i) => Math.round(x + (pb[i] - x) * Math.max(0, Math.min(1, t))));
  return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
const rampa = (t: number) => (t < 0.5 ? mezcla("#2a3140", "#2c5ee0", t / 0.5) : mezcla("#2c5ee0", "#8fb0ff", (t - 0.5) / 0.5));
const semaforo = (t: number) => (t < 0.35 ? mezcla("#e5534b", "#f0a73a", t / 0.35) : mezcla("#f0a73a", "#2eb872", (t - 0.35) / 0.35));
/** Proporción segura: sin denominador (zona sin histórico o sin meta) no hay dato, no un color inventado. */
const proporcion = (a: number, b: number) => (b > 0 ? a / b : null);

export function colorZona(capa: Capa, z: Zona, r: Rec): string {
  if (capa === "accion") return colorAccion[r.accion];
  if (capa === "tierra") { const p = proporcion(z.validados, z.potencial); return p === null ? SIN_DATO : rampa(p / 0.45); }
  if (capa === "pauta") return rampa(r.digital);
  if (capa === "meta") { const p = proporcion(z.comprometidos, z.meta); return p === null ? SIN_DATO : semaforo(p / 0.6); }
  return SIN_DATO;
}

export function opacidadZona(capa: Capa, r: Rec): number {
  if (capa === "testigos") return 0.35;
  if (capa === "accion" && r.accion === "mantener") return 0.45;
  return 0.85;
}

export function colorPuesto(mesas: Mesa[]): string {
  const c = porcentajeCobertura(mesas);
  return c >= 0.85 ? "#2eb872" : c >= 0.7 ? "#f0a73a" : "#e5534b";
}

export const estiloMapTiler = (clave: string) => `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${encodeURIComponent(clave)}`;

/** Zonas y puestos como GeoJSON, con el color y la opacidad de la capa elegida ya calculados. */
export function geojsonZonas(zonas: Zona[], capa: Capa, recDe: (id: string) => Rec, seleccion: string | null) {
  return {
    type: "FeatureCollection" as const,
    features: zonas.filter((z) => z.anillo.length >= 4).map((z) => ({
      type: "Feature" as const,
      properties: { id: z.id, nombre: z.nombre, color: colorZona(capa, z, recDe(z.id)), opacidad: opacidadZona(capa, recDe(z.id)), sel: z.id === seleccion },
      geometry: { type: "Polygon" as const, coordinates: [z.anillo] },
    })),
  };
}

export function geojsonPuestos(puestos: Puesto[]) {
  return {
    type: "FeatureCollection" as const,
    features: puestos.map((p) => ({
      type: "Feature" as const,
      properties: { nombre: p.nombre, color: colorPuesto(p.mesas), mesas: p.mesas.length },
      geometry: { type: "Point" as const, coordinates: p.punto },
    })),
  };
}


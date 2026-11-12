// Datos FICTICIOS de una campaña a la Gobernación del Caquetá. La candidata, los líderes, los puestos y todas las
// cifras son inventados. Las zonas llevan nombres de municipios del Caquetá (y de las cuatro comunas urbanas de
// Florencia), pero son una cuadrícula hexagonal ilustrativa: no son límites oficiales ni están en su sitio real.
import { indiceLider, recomendar, type Mesa } from "@ventaja/nucleo";

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(2027);
const entre = (a: number, b: number) => Math.round(a + r() * (b - a));

export const campana = {
  candidato: "Laura Méndez",
  cargo: "Gobernación del Caquetá",
  eleccion: "2027-10-31",
  metaVotos: 74000,
};

export const CENTRO: [number, number] = [-74.1, 1.1];
const RADIO = 0.33; // grados, ≈ 36 km: la cuadrícula cubre más o menos el ancho del departamento
/** Las cifras por zona de la semilla municipal, llevadas a la escala de un departamento. */
const ESCALA = 4;

const nombres = [
  "Florencia Norte", "Florencia Sur", "Florencia Oriental", "Florencia Occidental", "Albania", "Belén de los Andaquíes",
  "Cartagena del Chairá", "Curillo", "El Doncello", "El Paujil", "La Montañita", "Milán", "Morelia",
  "Puerto Rico", "San José del Fragua", "San Vicente del Caguán", "Solano", "Solita", "Valparaíso",
];

function hexagono(cx: number, cy: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    pts.push([cx + RADIO * Math.cos(a) * 0.98, cy + RADIO * Math.sin(a) * 0.98]);
  }
  pts.push(pts[0]);
  return pts;
}

export type Zona = {
  id: string;
  nombre: string;
  centro: [number, number];
  anillo: [number, number][];
  potencial: number;
  bruto: number;
  validados: number;
  comprometidos: number;
  lideres: number;
  alcance: number;
  clics: number;
  gasto: number;
  meta: number;
};

const axiales: [number, number][] = [];
for (let q = -2; q <= 2; q++)
  for (let s = -2; s <= 2; s++) if (Math.abs(q + s) <= 2) axiales.push([q, s]);

export const zonas: Zona[] = axiales.map(([q, s], i) => {
  const cx = CENTRO[0] + RADIO * Math.sqrt(3) * (q + s / 2);
  const cy = CENTRO[1] + RADIO * 1.5 * s;
  const potencial = entre(1400, 4200) * ESCALA;
  const sesgo = r();
  const bruto = Math.round(potencial * (0.12 + sesgo * 0.38));
  const validados = Math.round(bruto * (0.45 + r() * 0.45));
  const alcanceBase = r() < 0.3 ? 0.15 + r() * 0.2 : 0.4 + r() * 0.6;
  return {
    id: `z${i + 1}`,
    nombre: nombres[i],
    centro: [cx, cy],
    anillo: hexagono(cx, cy),
    potencial,
    bruto,
    validados,
    comprometidos: Math.round(validados * (0.35 + r() * 0.3)),
    lideres: Math.max(0, Math.round(validados / entre(55, 110))),
    alcance: Math.round(potencial * 6.5 * alcanceBase),
    clics: Math.round(potencial * 0.32 * alcanceBase),
    gasto: Math.round(potencial * 260 * alcanceBase),
    meta: Math.round(potencial * 0.42),
  };
});

export const recomendaciones = recomendar(
  zonas.map((z) => ({ territorioId: z.id, alcanceDigital: z.alcance, validados: z.validados, potencial: z.potencial }))
);
export const recDe = (id: string) => recomendaciones.find((x) => x.territorioId === id)!;
export const zonaDe = (id: string) => zonas.find((z) => z.id === id)!;

const pila = [
  "Yesenia Barrios", "Rafael Pérez", "Luz Marina Julio", "Edwin Cassiani", "Kelly Herrera", "Jhon Fredy Tapia",
  "Marelvis Cárdenas", "Álvaro Puello", "Diana Mercado", "Hernando Orozco", "Sandra Batista", "Luis Carlos Arrieta",
  "Nayibe Castro", "Wilmer Salgado", "Ana Isabel Ortega", "Ronald Guerrero", "Mónica Padilla", "Fabián Ospino",
  "Zuleima Pacheco", "Germán Rodelo", "Yuranis Simancas", "Óscar Villadiego",
];

export type Lider = {
  id: string; nombre: string; zonaId: string; telefono: string;
  registrados: number; validados: number; duplicadosConOtros: number;
  tareasHechas: number; tareasAsignadas: number; meta: number;
  indice: ReturnType<typeof indiceLider>;
};

export const lideres: Lider[] = pila.map((nombre, i) => {
  const zona = zonas[i % zonas.length];
  const registrados = entre(60, 420);
  const inflado = i === 4 || i === 11 || i === 17;
  const validados = Math.round(registrados * (inflado ? 0.32 + r() * 0.12 : 0.62 + r() * 0.33));
  const duplicadosConOtros = Math.round(registrados * (inflado ? 0.22 + r() * 0.1 : r() * 0.06));
  const tareasAsignadas = entre(8, 30);
  const tareasHechas = Math.round(tareasAsignadas * (inflado ? 0.3 + r() * 0.3 : 0.55 + r() * 0.45));
  const meta = entre(150, 400);
  const s = { registrados, validados, duplicadosConOtros, tareasHechas, tareasAsignadas, meta };
  return { id: `l${i + 1}`, nombre, zonaId: zona.id, telefono: `+57 30${entre(0, 9)} 000 ${String(1000 + i).slice(-4)}`, ...s, indice: indiceLider(s) };
});

export type Puesto = { id: string; nombre: string; zonaId: string; punto: [number, number]; mesas: Mesa[] };

const nombresPuesto = [
  "I.E. Ficticia Central", "Colegio Demo San José", "Escuela Demo La Ceiba", "I.E. Demo El Mirador",
  "Coliseo Demo", "Escuela Demo Las Palmas", "I.E. Demo Bellavista", "Colegio Demo Los Robles",
];

export const puestos: Puesto[] = nombresPuesto.map((nombre, i) => {
  const z = zonas[(i * 2 + 1) % zonas.length];
  const n = entre(6, 18);
  const mesas: Mesa[] = Array.from({ length: n }, (_, k) => ({
    puestoId: `p${i + 1}`,
    mesa: k + 1,
    votosHistoricos: entre(120, 310),
    testigoId: r() < 0.72 ? `t${i}-${k}` : undefined,
  }));
  return { id: `p${i + 1}`, nombre, zonaId: z.id, punto: [z.centro[0] + (r() - 0.5) * RADIO * 0.8, z.centro[1] + (r() - 0.5) * RADIO * 0.8], mesas };
});

export const todasLasMesas = puestos.flatMap((p) => p.mesas);

export const totales = (() => {
  const s = (k: keyof Zona) => zonas.reduce((a, z) => a + (z[k] as number), 0);
  return {
    bruto: s("bruto"), validados: s("validados"), comprometidos: s("comprometidos"),
    lideres: lideres.length, alcance: s("alcance"), clics: s("clics"), gasto: s("gasto"), potencial: s("potencial"),
  };
})();

export const filasPlanilla = [
  { nombre: "MARÍA JOSÉ PEÑA", cedula: "1.047.xxx.218", celular: "300 xxx 4412", barrio: "La Ceiba", confianza: 0.97 },
  { nombre: "JOSÉ LUIS ORTIZ", cedula: "73.1xx.590", celular: "311 xxx 0921", barrio: "Centro", confianza: 0.93 },
  { nombre: "LUZ DARY GÓMEZ", cedula: "1.143.xxx.0?7", celular: "315 xxx 7734", barrio: "Villa Rosa", confianza: 0.61, duda: "cedula" },
  { nombre: "CARLOS DÍAZ M.", cedula: "73.1xx.590", celular: "320 xxx 1180", barrio: "Centro", confianza: 0.9, duplicado: "Misma cédula que la fila 2" },
  { nombre: "ANA RUÍZ", cedula: "1.001.xxx.336", celular: "30? xxx 5521", barrio: "El Mirador", confianza: 0.68, duda: "celular" },
  { nombre: "EDILBERTO CABARCAS", cedula: "9.1xx.204", celular: "313 xxx 6609", barrio: "Las Palmas", confianza: 0.95 },
];

export type Incidencia = { id: string; puestoId: string; mesa: number; tipo: string; hora: string; prioridad: "alta" | "media" | "baja" };

const mesaConTestigo = (p: Puesto, n: number) => p.mesas.filter((m) => m.testigoId)[n]?.mesa ?? 1;

export const incidenciasBase: Incidencia[] = [
  { id: "i1", puestoId: "p3", mesa: mesaConTestigo(puestos[2], 2), tipo: "Testigo no admitido por el jurado", hora: "08:12", prioridad: "alta" },
  { id: "i2", puestoId: "p1", mesa: mesaConTestigo(puestos[0], 0), tipo: "Fila larga, votantes se están yendo", hora: "09:40", prioridad: "media" },
  { id: "i3", puestoId: "p6", mesa: mesaConTestigo(puestos[5], 1), tipo: "Falta material de la mesa", hora: "07:55", prioridad: "media" },
];


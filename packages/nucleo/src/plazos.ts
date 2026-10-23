// Plazos de las solicitudes de los titulares (Ley 1581 de 2012) en días hábiles de Colombia.
// Consultas (conocer sus datos): 10 días hábiles, prorrogables 5 (art. 14).
// Reclamos (actualizar, suprimir, revocar la autorización): 15 días hábiles, prorrogables 8 (art. 15).
// Días hábiles: de lunes a viernes, sin festivos. Los festivos siguen la Ley 51 de 1983 (traslado al lunes).
// Mismo cálculo que privado.sumar_dias_habiles en la base (supabase/migrations/…_cumplimiento.sql).

export type TipoSolicitud = "conocer" | "actualizar" | "suprimir" | "revocar";

export const plazoSolicitud: Record<TipoSolicitud, { dias: number; prorroga: number; clase: "consulta" | "reclamo"; norma: string }> = {
  conocer: { dias: 10, prorroga: 5, clase: "consulta", norma: "Ley 1581 de 2012, art. 14" },
  actualizar: { dias: 15, prorroga: 8, clase: "reclamo", norma: "Ley 1581 de 2012, art. 15" },
  suprimir: { dias: 15, prorroga: 8, clase: "reclamo", norma: "Ley 1581 de 2012, art. 15" },
  revocar: { dias: 15, prorroga: 8, clase: "reclamo", norma: "Ley 1581 de 2012, art. 15" },
};

const DIA = 86400000;
const aFecha = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
const aTexto = (d: Date) => d.toISOString().slice(0, 10);
const mas = (d: Date, n: number) => new Date(d.getTime() + n * DIA);
/** El lunes siguiente (o el mismo día si ya es lunes). */
const alLunes = (d: Date) => mas(d, (8 - d.getUTCDay()) % 7);

/** Domingo de Pascua (algoritmo gregoriano anónimo). */
export function pascua(anio: number): string {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

const cache = new Map<number, Set<string>>();
/** Festivos de Colombia de un año, en aaaa-mm-dd. */
export function festivosColombia(anio: number): Set<string> {
  const guardado = cache.get(anio);
  if (guardado) return guardado;
  const f = (m: number, d: number) => new Date(Date.UTC(anio, m - 1, d));
  const p = aFecha(pascua(anio));
  const fijos = [f(1, 1), f(5, 1), f(7, 20), f(8, 7), f(12, 8), f(12, 25), mas(p, -3), mas(p, -2)];
  const trasladables = [f(1, 6), f(3, 19), f(6, 29), f(8, 15), f(10, 12), f(11, 1), f(11, 11), mas(p, 39), mas(p, 60), mas(p, 68)];
  const r = new Set([...fijos, ...trasladables.map(alLunes)].map(aTexto));
  cache.set(anio, r);
  return r;
}

export function esDiaHabil(fecha: string): boolean {
  const d = aFecha(fecha);
  const s = d.getUTCDay();
  return s !== 0 && s !== 6 && !festivosColombia(d.getUTCFullYear()).has(aTexto(d));
}

/** El n-ésimo día hábil después de `fecha` (el día de recibo no cuenta). */
export function sumarDiasHabiles(fecha: string, n: number): string {
  let d = aFecha(fecha);
  let contados = 0;
  while (contados < n) {
    d = mas(d, 1);
    if (esDiaHabil(aTexto(d))) contados++;
  }
  return aTexto(d);
}

/** Días hábiles que faltan desde `hoy` hasta `vence` (0 si vence hoy, negativo si ya venció). */
export function diasHabilesRestantes(hoy: string, vence: string): number {
  if (vence === hoy) return 0;
  const signo = vence > hoy ? 1 : -1;
  const fin = aFecha(signo > 0 ? vence : hoy);
  let d = aFecha(signo > 0 ? hoy : vence);
  let n = 0;
  while (d < fin) { d = mas(d, 1); if (esDiaHabil(aTexto(d))) n++; }
  return signo * n;
}

/** Semáforo del plazo: rojo si venció o vence en 2 días hábiles o menos; ámbar hasta 5; verde después. */
export function semaforoPlazo(hoy: string, vence: string): "verde" | "ambar" | "rojo" {
  const r = diasHabilesRestantes(hoy, vence);
  return r <= 2 ? "rojo" : r <= 5 ? "ambar" : "verde";
}

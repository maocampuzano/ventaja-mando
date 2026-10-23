// Posibles duplicados, explicables (diseño §7.1).
// Es una SUGERENCIA: una persona decide fusionar, y la fusión queda en la auditoría.
// Trabaja con documentoHash, nunca con la cédula en claro.

export type PersonaComparable = {
  id: string;
  documentoHash?: string;
  nombre: string;
  telefono?: string;
  territorioId: string;
};
export type Coincidencia = { a: string; b: string; puntaje: number; razones: string[] };

export const UMBRAL_DUPLICADO = 0.5;

export const normaliza = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

// Solo dígitos, sin el indicativo de Colombia: «+57 300 123 4567» y «3001234567» son el mismo número.
export function normalizaTelefono(t: string) {
  const d = t.replace(/\D/g, "");
  return d.length === 12 && d.startsWith("57") ? d.slice(2) : d;
}

const tokens = (s: string) => new Set(normaliza(s).split(" ").filter(Boolean));

// Jaccard por palabras: 0..1. Un nombre vacío no se parece a nada.
export function similitudNombre(x: string, y: string): number {
  const a = tokens(x), b = tokens(y);
  if (!a.size || !b.size) return 0;
  const inter = [...a].filter((t) => b.has(t)).length;
  return inter / Math.max(a.size, b.size);
}

export function evaluarPar(p: PersonaComparable, q: PersonaComparable): Coincidencia | null {
  if (p.id === q.id) return null;
  const razones: string[] = [];
  let puntaje = 0;
  if (p.documentoHash && p.documentoHash === q.documentoHash) { puntaje += 0.7; razones.push("mismo documento"); }
  const tp = p.telefono ? normalizaTelefono(p.telefono) : "";
  if (tp && tp === (q.telefono ? normalizaTelefono(q.telefono) : "")) { puntaje += 0.2; razones.push("mismo teléfono"); }
  const sn = similitudNombre(p.nombre, q.nombre);
  if (sn >= 0.75) { puntaje += 0.2 * sn; razones.push(`nombre similar (${Math.round(sn * 100)} %)`); }
  if (p.territorioId === q.territorioId) { puntaje += 0.05; razones.push("mismo territorio"); }
  return puntaje >= UMBRAL_DUPLICADO ? { a: p.id, b: q.id, puntaje: Math.min(1, puntaje), razones } : null;
}

// Agrupa por documento, teléfono y palabras del nombre para no comparar todos contra todos.
// Dos nombres con similitud > 0 comparten al menos una palabra, así que ningún par posible queda por fuera.
export function buscarDuplicados(personas: PersonaComparable[]): Coincidencia[] {
  const grupos = new Map<string, number[]>();
  const agregar = (clave: string, i: number) => {
    const g = grupos.get(clave);
    if (g) g.push(i); else grupos.set(clave, [i]);
  };
  personas.forEach((p, i) => {
    if (p.documentoHash) agregar(`d:${p.documentoHash}`, i);
    if (p.telefono) { const t = normalizaTelefono(p.telefono); if (t) agregar(`t:${t}`, i); }
    for (const palabra of tokens(p.nombre)) agregar(`n:${palabra}`, i);
  });

  const vistos = new Set<string>();
  const resultado: Coincidencia[] = [];
  for (const g of grupos.values()) {
    for (let x = 0; x < g.length; x++) {
      for (let y = x + 1; y < g.length; y++) {
        const [i, j] = g[x] < g[y] ? [g[x], g[y]] : [g[y], g[x]];
        const clave = `${i}:${j}`;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        const c = evaluarPar(personas[i], personas[j]);
        if (c) resultado.push(c);
      }
    }
  }
  return resultado.sort((m, n) => n.puntaje - m.puntaje || m.a.localeCompare(n.a) || m.b.localeCompare(n.b));
}

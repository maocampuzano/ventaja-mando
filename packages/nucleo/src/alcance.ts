// Quién ve qué territorio, con la misma regla que la base de datos (supabase/migrations/…_seguridad.sql).
// En modo «supabase» la seguridad la hace la RLS; esta función solo sirve para que el modo demo se comporte
// igual y para decidir qué mostrar. Ocultar en la interfaz no cuenta como seguridad (regla 8).

export type RolCampana = "administrador" | "gerente" | "candidato" | "coordinador" | "lider" | "testigo";
export type NodoTerritorio = { id: string; padreId?: string | null };

export const nombreRol: Record<RolCampana, string> = {
  administrador: "Administrador",
  gerente: "Gerente",
  candidato: "Candidato",
  coordinador: "Coordinador",
  lider: "Líder",
  testigo: "Testigo",
};

/** Administradores y gerentes solo ven datos con sesión de dos factores. */
export const exige2fa = (rol: RolCampana) => rol === "administrador" || rol === "gerente";

/** Ven el agregado de toda la campaña. El candidato, además, nunca ve personas una por una. */
export const veTodaLaCampana = (rol: RolCampana) => rol === "administrador" || rol === "gerente" || rol === "candidato";

/** Los territorios asignados con todos los que cuelgan de ellos (como privado.territorios_permitidos). */
export function territoriosPermitidos(asignados: readonly string[], arbol: readonly NodoTerritorio[]): Set<string> {
  const hijos = new Map<string, string[]>();
  for (const t of arbol) {
    if (!t.padreId) continue;
    const h = hijos.get(t.padreId);
    if (h) h.push(t.id); else hijos.set(t.padreId, [t.id]);
  }
  const vistos = new Set<string>();
  const pila = [...asignados];
  while (pila.length) {
    const id = pila.pop()!;
    if (vistos.has(id)) continue;
    vistos.add(id);
    pila.push(...(hijos.get(id) ?? []));
  }
  return vistos;
}

/** Territorios del tablero que el rol puede ver. Líder y testigo no usan el tablero: no ven ninguno. */
export function territoriosVisibles(
  rol: RolCampana,
  asignados: readonly string[],
  arbol: readonly NodoTerritorio[],
): Set<string> {
  if (veTodaLaCampana(rol)) return new Set(arbol.map((t) => t.id));
  if (rol === "coordinador") return territoriosPermitidos(asignados, arbol);
  return new Set();
}

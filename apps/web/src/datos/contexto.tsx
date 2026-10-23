import { createContext, useContext } from "react";
import type { Tablero } from "./tablero";
import type { Sesion } from "./tipos";

export type Contexto = Tablero & { sesion: Sesion; modo: "demo" | "supabase" };

export const ContextoTablero = createContext<Contexto | null>(null);

/** Datos del tablero ya recortados al alcance de quien inició sesión. */
export function useTablero(): Contexto {
  const c = useContext(ContextoTablero);
  if (!c) throw new Error("useTablero se usa dentro de <ContextoTablero.Provider>.");
  return c;
}

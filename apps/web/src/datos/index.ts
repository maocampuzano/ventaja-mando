// Elige la fuente de datos. Por defecto, «demo». El proyecto real se enciende con MODO_DATOS=supabase y las
// variables SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY (ver .env.example y vite.config.ts).
import { crearFuenteDemo } from "./demo";
import { crearFuenteSupabase } from "./supabase";
import type { FuenteDatos } from "./tipos";

export function elegirFuente(env: { modo?: string; url?: string; clave?: string }): FuenteDatos {
  if (env.modo === "supabase") {
    if (!env.url || !env.clave) {
      console.warn("MODO_DATOS=supabase, pero faltan SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY: se usa el modo demo.");
      return crearFuenteDemo();
    }
    return crearFuenteSupabase(env.url, env.clave);
  }
  return crearFuenteDemo();
}

export const fuente = elegirFuente({
  modo: import.meta.env.VITE_MODO_DATOS,
  url: import.meta.env.VITE_SUPABASE_URL,
  clave: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

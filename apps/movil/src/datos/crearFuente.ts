// Elige la fuente de datos según app.config (modo demo o el proyecto real). La usan la app y la tarea en segundo plano.
import Constants from "expo-constants";
import { crearFuenteDemo } from "./demo";
import { crearFuenteSupabase } from "./supabase";
import type { FuenteMovil } from "./tipos";

type Extra = { modoDatos?: string; supabaseUrl?: string; supabasePublishableKey?: string };

export function crearFuente(): FuenteMovil {
  const x = (Constants.expoConfig?.extra ?? {}) as Extra;
  if (x.modoDatos === "supabase" && x.supabaseUrl && x.supabasePublishableKey) return crearFuenteSupabase(x.supabaseUrl, x.supabasePublishableKey);
  return crearFuenteDemo();
}

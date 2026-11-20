// Abrir rápido sin señal: si el teléfono ya tiene la sesión de esta persona, la app no espera al servidor más de unos
// segundos. Sin señal, Supabase puede tardar casi medio minuto intentando renovar el token antes de rendirse; mientras
// tanto la persona veía un círculo girando. La confirmación sigue por detrás: si el servidor rechaza la sesión (la
// cuenta se desactivó o se cerró la sesión desde otro lado), se avisa para pedir entrar de nuevo.

/** Cuánto se espera al servidor antes de abrir con la sesión guardada. */
export const ESPERA_SESION_MS = 3000;

/**
 * @param confirmar la confirmación con el servidor: la sesión, la guardada si no hubo señal, o null si la rechazó.
 * @param guardada la sesión guardada en el teléfono, solo si el token guardado es de la misma persona.
 * @param alRechazar se llama si, después de abrir con la guardada, el servidor rechaza la sesión.
 */
export async function primeroLaGuardada<T>(
  confirmar: Promise<T | null>, guardada: T | null, alRechazar: () => void, espera = ESPERA_SESION_MS,
): Promise<T | null> {
  if (!guardada) return confirmar;
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tarde = new Promise<"tarde">((ok) => { reloj = setTimeout(() => ok("tarde"), espera); });
  const primero = await Promise.race([confirmar.then((s) => ({ s }), () => ({ s: guardada })), tarde]);
  clearTimeout(reloj);
  if (primero !== "tarde") return primero.s;
  confirmar.then((s) => { if (s === null) alRechazar(); }, () => undefined);
  return guardada;
}

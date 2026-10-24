import { deleteAsync } from "expo-file-system/legacy";

/** Borra una foto del teléfono. Si ya no estaba, no pasa nada. */
export async function borrarArchivo(uri: string) {
  try { await deleteAsync(uri, { idempotent: true }); } catch { /* no impide el envío */ }
}

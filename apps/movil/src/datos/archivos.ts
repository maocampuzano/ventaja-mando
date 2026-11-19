// Fotos en el teléfono. Se guardan reducidas en la carpeta privada de la app (no en la caché, que el sistema puede
// vaciar) y se borran solo cuando el servidor ya confirmó que las recibió.
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { copyAsync, deleteAsync, documentDirectory, getInfoAsync, makeDirectoryAsync } from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";

const CARPETA = `${documentDirectory}fotos/`;

/** Borra una foto del teléfono. Si ya no estaba, no pasa nada. */
export async function borrarArchivo(uri: string) {
  try { await deleteAsync(uri, { idempotent: true }); } catch { /* no impide el envío */ }
}

/**
 * Deja la foto lista para la cola: lado mayor de 1.600 px, JPEG al 80 % (unos 300 a 500 KB, se envía rápido aun con
 * mala señal) y copiada a la carpeta privada de la app, donde sobrevive a cerrar la app y reiniciar el teléfono.
 */
export async function guardarFoto(uri: string): Promise<string> {
  await makeDirectoryAsync(CARPETA, { intermediates: true }).catch(() => undefined);
  const reducida = await manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.8, format: SaveFormat.JPEG })
    .catch(() => ({ uri }));
  const destino = `${CARPETA}${Crypto.randomUUID()}.jpg`;
  await copyAsync({ from: reducida.uri, to: destino });
  if (reducida.uri !== uri) await borrarArchivo(reducida.uri);
  return destino;
}

/** Huella del archivo (MD5): la misma imagen siempre da la misma huella, y así no se envía dos veces. */
export async function huellaFoto(uri: string): Promise<string | null> {
  try {
    const info = await getInfoAsync(uri, { md5: true });
    return info.exists && "md5" in info && info.md5 ? info.md5.toLowerCase() : null;
  } catch { return null; }
}

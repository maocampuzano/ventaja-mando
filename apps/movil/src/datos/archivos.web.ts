/** En el navegador las fotos viven dentro de la operación (como data URL): no hay archivos que borrar. */
export async function borrarArchivo(uri: string) {
  void uri;
}

/**
 * Deja la foto lista para guardarla en la cola del navegador: la reduce (lado mayor de 1.600 px, JPEG) y la convierte
 * en data URL, para que sobreviva a recargar la página (una dirección blob: muere al recargar).
 */
export async function guardarFoto(uri: string): Promise<string> {
  if (uri.startsWith("data:") && uri.length < 1_500_000) return uri;
  const blob = await (await fetch(uri)).blob();
  const imagen = await createImageBitmap(blob);
  const escala = Math.min(1, 1600 / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  lienzo.getContext("2d")!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  return lienzo.toDataURL("image/jpeg", 0.8);
}

/** Huella de la foto (SHA-256 de su contenido): la misma imagen siempre da la misma huella. */
export async function huellaFoto(uri: string): Promise<string | null> {
  try {
    const bytes = await (await fetch(uri)).arrayBuffer();
    const h = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return null; }
}

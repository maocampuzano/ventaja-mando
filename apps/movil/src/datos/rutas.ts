// Las fotos viven en el bucket privado «evidencias», en <campaña>/<usuario>/<identificador de la operación>.jpg
// (supabase/migrations/20261026000200_app_movil.sql). Al reintentar, la foto se vuelve a subir en la misma ruta y
// reemplaza a la anterior: no se duplica.
export const BUCKET_EVIDENCIAS = "evidencias";

export function rutaFoto(campanaId: string, usuarioId: string, operacionId: string, sufijo = "") {
  return `${campanaId}/${usuarioId}/${operacionId}${sufijo ? `-${sufijo}` : ""}.jpg`;
}

/** ¿Es una foto que todavía está solo en el teléfono? */
export const esArchivoLocal = (ruta: string | null | undefined) => !!ruta && /^(file|content|ph|blob|data):/.test(ruta);

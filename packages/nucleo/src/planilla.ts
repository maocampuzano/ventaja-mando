// Planilla imprimible: cada hoja lleva un código QR que identifica el lote (y por él, al líder) y el número de hoja.
// El QR no lleva datos de personas ni el nombre del líder: solo el identificador del lote, que la base resuelve
// respetando la RLS. Así, una foto de la planilla que se pierda no revela nada por el código.

export const PREFIJO_PLANILLA = "VMP1";
export const FILAS_POR_HOJA = 12;
export const MAX_HOJAS_POR_LOTE = 50;

export type CodigoHoja = { loteId: string; hoja: number; hojas: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Texto que va dentro del QR de cada hoja: `VMP1:<lote>:<hoja>/<hojas>`. */
export function codigoHoja({ loteId, hoja, hojas }: CodigoHoja): string {
  const id = loteId.toLowerCase();
  if (!UUID.test(id)) throw new Error("El identificador del lote no es válido.");
  if (!hojaValida(hoja, hojas)) throw new Error("El número de hoja no es válido.");
  return `${PREFIJO_PLANILLA}:${id}:${hoja}/${hojas}`;
}

/** Lee el QR de una hoja. Devuelve null si el texto no es de una planilla de Comando. */
export function leerCodigoHoja(texto: string): CodigoHoja | null {
  const m = /^VMP1:([0-9a-fA-F-]{36}):(\d{1,3})\/(\d{1,3})$/.exec(texto.trim());
  if (!m) return null;
  const loteId = m[1].toLowerCase();
  const hoja = Number(m[2]);
  const hojas = Number(m[3]);
  if (!UUID.test(loteId) || !hojaValida(hoja, hojas)) return null;
  return { loteId, hoja, hojas };
}

function hojaValida(hoja: number, hojas: number) {
  return Number.isInteger(hoja) && Number.isInteger(hojas) && hoja >= 1 && hoja <= hojas && hojas <= MAX_HOJAS_POR_LOTE;
}

/**
 * Columnas de la planilla, con su ancho relativo. Solo datos de contacto y la firma de autorización (regla 3).
 * Nunca opinión política (regla 2) ni valores en pesos (regla 4): lo verifica una prueba.
 */
export const COLUMNAS_PLANILLA = [
  { id: "numero", titulo: "N.º", ancho: 0.05 },
  { id: "nombre", titulo: "Nombres y apellidos", ancho: 0.27 },
  { id: "cedula", titulo: "Cédula (opcional)", ancho: 0.15 },
  { id: "celular", titulo: "Celular", ancho: 0.15 },
  { id: "barrio", titulo: "Barrio o vereda", ancho: 0.17 },
  { id: "firma", titulo: "Firma: autorizo el uso de mis datos", ancho: 0.21 },
] as const;

/** Lo que se imprime al pie de cada hoja como referencia legible por una persona. */
export function referenciaHoja(numeroLote: number, hoja: number, hojas: number) {
  return `Lote ${numeroLote} · hoja ${hoja} de ${hojas}`;
}

/** Nombre del archivo PDF, sin tildes ni espacios para que abra bien en cualquier equipo. */
export function nombreArchivoPlanilla(numeroLote: number, lider: string) {
  const limpio = lider
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `planilla-lote-${numeroLote}${limpio ? `-${limpio}` : ""}.pdf`;
}

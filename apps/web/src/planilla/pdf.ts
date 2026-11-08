// Planilla imprimible en PDF, generada en el navegador: ni los nombres ni el QR pasan por un servicio externo.
// Tamaño carta horizontal, una hoja por página. Cada hoja lleva un QR vectorial con el lote y el número de hoja
// (packages/nucleo/src/planilla.ts) y, al pie, el texto de autorización exacto con el que se imprimió el lote.
import { COLUMNAS_PLANILLA, FILAS_POR_HOJA, codigoHoja, fecha, referenciaHoja } from "@ventaja/nucleo";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import qrcode from "qrcode-generator";

export type DatosPlanillaPdf = {
  loteId: string;
  numero: number;
  hojas: number;
  candidato: string;
  cargo: string;
  lider: string;
  zona: string;
  textoAutorizacion: string;
  /** Mientras el texto no tenga revisión jurídica (V3), cada hoja lo advierte. */
  borrador: boolean;
  generado: Date;
};

const ANCHO = 792; // carta horizontal, en puntos
const ALTO = 612;
const MARGEN = 32;
const TINTA = rgb(0.1, 0.11, 0.13);
const TENUE = rgb(0.38, 0.4, 0.45);
const LINEA = rgb(0.55, 0.57, 0.62);
const ACENTO = rgb(0x1f / 255, 0x5b / 255, 1);
const ROJO = rgb(0.75, 0.1, 0.1);
const QR_LADO = 92;

// Las fuentes estándar del PDF usan la codificación WinAnsi: cubre el español (tildes, ñ, ¿¡, «», ·, …).
// Cualquier otro carácter (emoji, otros alfabetos) se cambia por «?» para que nunca falle la generación.
const EXTRA_WINANSI = new Set([..."€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"]);
export function aWinAnsi(texto: string) {
  return [...texto.normalize("NFC")]
    .map((c) => {
      const n = c.codePointAt(0)!;
      if (c === "\n" || c === "\t") return " ";
      return (n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff) || EXTRA_WINANSI.has(c) ? c : "?";
    })
    .join("");
}

/** Parte un texto en líneas que caben en `ancho` puntos. */
export function partirLineas(texto: string, fuente: PDFFont, tamano: number, ancho: number): string[] {
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of aWinAnsi(texto).split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (fuente.widthOfTextAtSize(prueba, tamano) <= ancho) { actual = prueba; continue; }
    if (actual) lineas.push(actual);
    // Una palabra más larga que el ancho se corta a la fuerza.
    let resto = palabra;
    while (fuente.widthOfTextAtSize(resto, tamano) > ancho && resto.length > 1) {
      let i = resto.length - 1;
      while (i > 1 && fuente.widthOfTextAtSize(resto.slice(0, i), tamano) > ancho) i--;
      lineas.push(resto.slice(0, i));
      resto = resto.slice(i);
    }
    actual = resto;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** Recorta a una línea con «…» si no cabe. */
function ajustar(texto: string, fuente: PDFFont, tamano: number, ancho: number) {
  const t = aWinAnsi(texto);
  if (fuente.widthOfTextAtSize(t, tamano) <= ancho) return t;
  let i = t.length;
  while (i > 0 && fuente.widthOfTextAtSize(`${t.slice(0, i)}…`, tamano) > ancho) i--;
  return `${t.slice(0, i)}…`;
}

/** Módulos del QR (true = negro), fila por fila de arriba abajo. Corrección de errores M: aguanta manchas y dobleces. */
export function matrizQr(texto: string): boolean[][] {
  const q = qrcode(0, "M");
  q.addData(texto);
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, f) => Array.from({ length: n }, (_, c) => q.isDark(f, c)));
}

export const MARGEN_QR = 2; // zona silenciosa, en módulos

function dibujarQr(pagina: PDFPage, texto: string, x: number, y: number, lado: number) {
  const m = matrizQr(texto);
  const n = m.length;
  const margen = MARGEN_QR;
  const celda = lado / (n + margen * 2);
  pagina.drawRectangle({ x, y, width: lado, height: lado, color: rgb(1, 1, 1) });
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      if (!m[f][c]) continue;
      pagina.drawRectangle({
        x: x + (c + margen) * celda,
        y: y + lado - (f + margen + 1) * celda,
        width: celda,
        height: celda,
        color: rgb(0, 0, 0),
      });
    }
  }
}

export async function generarPlanillaPdf(d: DatosPlanillaPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(aWinAnsi(`Planilla, lote ${d.numero}`));
  doc.setSubject("Planilla de registro con autorización de datos");
  doc.setCreator("Ventaja Mando");
  doc.setProducer("Ventaja Mando");
  doc.setCreationDate(d.generado);
  doc.setModificationDate(d.generado);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const anchoUtil = ANCHO - MARGEN * 2;

  for (let hoja = 1; hoja <= d.hojas; hoja++) {
    const p = doc.addPage([ANCHO, ALTO]);
    let y = ALTO - MARGEN;

    // Encabezado
    p.drawRectangle({ x: MARGEN, y: y - 4, width: 40, height: 4, color: ACENTO });
    y -= 22;
    p.drawText("PLANILLA DE REGISTRO", { x: MARGEN, y, size: 16, font: negrita, color: TINTA });
    const anchoTexto = anchoUtil - QR_LADO - 16;
    const lineasCabeza = [
      `Campaña: ${d.candidato}${d.cargo ? ` · ${d.cargo}` : ""}`,
      `Líder: ${d.lider}${d.zona ? ` · Zona: ${d.zona}` : ""}`,
      `Impresa el ${fecha(d.generado)}`,
    ];
    for (const l of lineasCabeza) {
      y -= 16;
      p.drawText(ajustar(l, normal, 10.5, anchoTexto), { x: MARGEN, y, size: 10.5, font: normal, color: TINTA });
    }
    y -= 14;
    const instruccion = "Una persona por fila. Escriba con letra clara, en mayúscula sostenida. Sin firma, la fila no se registra.";
    p.drawText(ajustar(instruccion, normal, 9, anchoTexto), { x: MARGEN, y, size: 9, font: normal, color: TENUE });

    // QR y referencia legible (esquina superior derecha)
    const qrX = ANCHO - MARGEN - QR_LADO;
    const qrY = ALTO - MARGEN - QR_LADO;
    dibujarQr(p, codigoHoja({ loteId: d.loteId, hoja, hojas: d.hojas }), qrX, qrY, QR_LADO);
    const ref = aWinAnsi(referenciaHoja(d.numero, hoja, d.hojas));
    const anchoRef = negrita.widthOfTextAtSize(ref, 9);
    p.drawText(ref, { x: qrX + (QR_LADO - anchoRef) / 2, y: qrY - 11, size: 9, font: negrita, color: TINTA });

    // Pie: autorización. Se calcula primero para saber cuánto alto queda para la tabla.
    const tamPie = 7.5;
    const lineasPie = partirLineas(d.textoAutorizacion, normal, tamPie, anchoUtil);
    const altoPie = (lineasPie.length + (d.borrador ? 2 : 1)) * (tamPie + 2.5) + 8;

    // Tabla
    const yTabla = Math.min(y, qrY - 18) - 10;
    const altoCabeza = 24;
    const altoFila = (yTabla - altoCabeza - MARGEN - altoPie) / FILAS_POR_HOJA;
    let x = MARGEN;
    const xs = COLUMNAS_PLANILLA.map((c) => { const x0 = x; x += c.ancho * anchoUtil; return x0; });
    p.drawRectangle({ x: MARGEN, y: yTabla - altoCabeza, width: anchoUtil, height: altoCabeza, color: rgb(0.93, 0.94, 0.96) });
    COLUMNAS_PLANILLA.forEach((c, i) => {
      const lineas = partirLineas(c.titulo, negrita, 8, c.ancho * anchoUtil - 8).slice(0, 2);
      lineas.forEach((l, k) => p.drawText(l, {
        x: xs[i] + 4, y: yTabla - 10 - k * 9.5 - (lineas.length === 1 ? 4 : 0), size: 8, font: negrita, color: TINTA,
      }));
    });
    const yFin = yTabla - altoCabeza - altoFila * FILAS_POR_HOJA;
    for (let f = 0; f <= FILAS_POR_HOJA; f++) {
      const yl = yTabla - altoCabeza - f * altoFila;
      p.drawLine({ start: { x: MARGEN, y: yl }, end: { x: MARGEN + anchoUtil, y: yl }, thickness: 0.6, color: LINEA });
      if (f < FILAS_POR_HOJA) {
        const n = String((hoja - 1) * FILAS_POR_HOJA + f + 1);
        p.drawText(n, { x: xs[0] + 4, y: yl - altoFila / 2 - 3, size: 8.5, font: normal, color: TENUE });
      }
    }
    p.drawLine({ start: { x: MARGEN, y: yTabla }, end: { x: MARGEN + anchoUtil, y: yTabla }, thickness: 0.6, color: LINEA });
    [...xs, MARGEN + anchoUtil].forEach((xl) =>
      p.drawLine({ start: { x: xl, y: yTabla }, end: { x: xl, y: yFin }, thickness: 0.6, color: LINEA }));

    // Pie
    let yp = yFin - 12;
    p.drawText("Autorización de datos personales", { x: MARGEN, y: yp, size: tamPie + 0.5, font: negrita, color: TINTA });
    for (const l of lineasPie) {
      yp -= tamPie + 2.5;
      p.drawText(l, { x: MARGEN, y: yp, size: tamPie, font: normal, color: TINTA });
    }
    if (d.borrador) {
      yp -= tamPie + 3;
      p.drawText("BORRADOR SIN REVISIÓN JURÍDICA: no usar con personas reales.", { x: MARGEN, y: yp, size: tamPie, font: negrita, color: ROJO });
    }
  }
  return doc.save();
}

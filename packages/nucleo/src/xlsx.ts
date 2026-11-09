// Libro de Excel (.xlsx) mínimo, sin dependencias: varias hojas con encabezado fijo, anchos de columna, formato de
// pesos y fórmulas. Un .xlsx es un ZIP con archivos XML; aquí el ZIP va sin comprimir («stored»), que Excel, LibreOffice
// y Google Sheets abren sin problema.

export type Celda = string | number | { formula: string; pesos?: boolean } | null | undefined;
export type Columna = { titulo: string; ancho?: number; pesos?: boolean };
export type Hoja = {
  nombre: string;
  /** Hojas de texto (instrucciones): sin encabezado de tabla; la primera fila va en negrita. */
  texto?: string[];
  columnas?: Columna[];
  filas?: Celda[][];
};

const enc = new TextEncoder();
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  // Caracteres de control no válidos en XML 1.0.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

export function letraColumna(i: number): string {
  let s = "", n = i + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// Estilos: 0 normal · 1 encabezado (negrita, fondo, ajuste) · 2 pesos · 3 texto con ajuste · 4 título en negrita
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;\\ #,##0"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F7"/></patternFill></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function celdaXml(ref: string, c: Celda, estilo: number): string {
  if (c === null || c === undefined || c === "") return estilo ? `<c r="${ref}" s="${estilo}"/>` : "";
  if (typeof c === "number") return `<c r="${ref}"${estilo ? ` s="${estilo}"` : ""}><v>${c}</v></c>`;
  if (typeof c === "object") return `<c r="${ref}" s="${c.pesos ? 2 : estilo}"><f>${xml(c.formula)}</f></c>`;
  return `<c r="${ref}" t="inlineStr"${estilo ? ` s="${estilo}"` : ""}><is><t xml:space="preserve">${xml(c)}</t></is></c>`;
}

function hojaXml(h: Hoja): string {
  if (h.texto) {
    const filas = h.texto.map((t, i) => `<row r="${i + 1}">${celdaXml(`A${i + 1}`, t, i === 0 ? 4 : 3)}</row>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="110" customWidth="1"/></cols><sheetData>${filas}</sheetData></worksheet>`;
  }
  const cols = h.columnas ?? [];
  const anchos = cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho ?? 16}" customWidth="1"/>`).join("");
  const encabezado = `<row r="1">${cols.map((c, i) => celdaXml(`${letraColumna(i)}1`, c.titulo, 1)).join("")}</row>`;
  const filas = (h.filas ?? []).map((f, r) =>
    `<row r="${r + 2}">${f.map((c, i) => celdaXml(`${letraColumna(i)}${r + 2}`, c, cols[i]?.pesos && typeof c === "number" ? 2 : 0)).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${anchos ? `<cols>${anchos}</cols>` : ""}<sheetData>${encabezado}${filas}</sheetData></worksheet>`;
}

// ---------- ZIP sin compresión ----------

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(archivos: { nombre: string; datos: Uint8Array }[]): Uint8Array {
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let desplazamiento = 0;
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre);
    const crc = crc32(a.datos);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); // UTF-8
    local.setUint16(8, 0, true); local.setUint32(14, crc, true); local.setUint32(18, a.datos.length, true);
    local.setUint32(22, a.datos.length, true); local.setUint16(26, nombre.length, true);
    partes.push(new Uint8Array(local.buffer), nombre, a.datos);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, a.datos.length, true); c.setUint32(24, a.datos.length, true);
    c.setUint16(28, nombre.length, true); c.setUint32(42, desplazamiento, true);
    central.push(new Uint8Array(c.buffer), nombre);
    desplazamiento += 30 + nombre.length + a.datos.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true); fin.setUint32(16, desplazamiento, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const salida = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of todo) { salida.set(p, o); o += p.length; }
  return salida;
}

/** Arma el .xlsx con las hojas en orden. Los nombres de hoja se recortan a 31 caracteres (límite de Excel). */
export function crearXlsx(hojas: readonly Hoja[]): Uint8Array {
  const nombres = hojas.map((h) => h.nombre.replace(/[[\]:*?/\\]/g, " ").slice(0, 31));
  const archivos = [
    { nombre: "[Content_Types].xml", texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { nombre: "_rels/.rels", texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { nombre: "xl/workbook.xml", texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nombres.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
    { nombre: "xl/_rels/workbook.xml.rels", texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { nombre: "xl/styles.xml", texto: ESTILOS },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, texto: hojaXml(h) })),
  ];
  return zip(archivos.map((a) => ({ nombre: a.nombre, datos: enc.encode(a.texto) })));
}

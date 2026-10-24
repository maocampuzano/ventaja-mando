// Archivo CSV de una exportación, con marca: un encabezado con la referencia, quién y cuándo exportó, y la
// misma referencia corta en cada fila, para que la marca sobreviva si alguien recorta el archivo.
// Separador «;» y BOM: así lo abre bien Excel en español.
import type { Exportacion } from "./tipos";

const celda = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function csvExportacion(e: Exportacion, campana: string): string {
  const ref = e.referencia.slice(0, 8).toUpperCase();
  const lineas = [
    [`EXPORTACIÓN CONFIDENCIAL · Ventaja Mando · ${campana}`],
    [`Referencia ${e.referencia} · Exportado por ${e.exportadoPor || "(sin nombre)"} el ${e.exportadoEn} · Finalidad: ${e.finalidad}`],
    ["Uso exclusivo para la finalidad autorizada por cada titular (Ley 1581 de 2012). No se comparte ni se vende. Esta exportación quedó registrada en la auditoría."],
    [],
    ["Nombre", "Celular", "Zona", "Líder", "Relación", "Estado", "Autorizó el", "Marca"],
    ...e.filas.map((f) => [f.nombre, f.celular, f.zona, f.lider, f.relacion, f.estado, f.autorizada_el, ref]),
  ];
  return "﻿" + lineas.map((l) => l.map(celda).join(";")).join("\r\n") + "\r\n";
}

export const nombreArchivoExportacion = (e: Exportacion) => `ventaja-mando-exportacion-${e.referencia.slice(0, 8)}.csv`;

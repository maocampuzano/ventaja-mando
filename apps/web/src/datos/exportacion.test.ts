import { describe, expect, it } from "vitest";
import { csvExportacion, nombreArchivoExportacion } from "./exportacion";

const e = {
  referencia: "abcd1234-0000-4000-8000-000000000000", exportadoPor: "Gerente Demo", exportadoEn: "24/10/2026 10:30",
  finalidad: "contacto_campana",
  filas: [{ nombre: "Ana; Peña", celular: "+57 300 000 5000", zona: "Centro", lider: "Yesenia Barrios", relacion: "simpatizante", estado: "validado", autorizada_el: "05/03/2026" }],
};

describe("exportación con marca", () => {
  it("lleva la referencia, quién y cuándo en el encabezado, y la marca en cada fila", () => {
    const csv = csvExportacion(e, "Campaña de prueba");
    expect(csv.startsWith("﻿EXPORTACIÓN CONFIDENCIAL")).toBe(true);
    expect(csv).toContain("Referencia abcd1234-0000-4000-8000-000000000000 · Exportado por Gerente Demo el 24/10/2026 10:30");
    expect(csv.trim().split("\r\n").at(-1)).toMatch(/;ABCD1234$/);
  });

  it("escapa el separador dentro de los datos", () => {
    expect(csvExportacion(e, "X")).toContain('"Ana; Peña"');
  });

  it("el nombre del archivo lleva la referencia", () => {
    expect(nombreArchivoExportacion(e)).toBe("ventaja-mando-exportacion-abcd1234.csv");
  });
});

import { codigoHoja, leerCodigoHoja } from "@ventaja/nucleo";
import jsQR from "jsqr";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { MARGEN_QR, aWinAnsi, generarPlanillaPdf, matrizQr, partirLineas, type DatosPlanillaPdf } from "./pdf";

const LOTE = "3f2b6c1e-8a4d-4f0b-9c7e-1d2a3b4c5d6e";
const base: DatosPlanillaPdf = {
  loteId: LOTE, numero: 14, hojas: 3, candidato: "Laura Méndez", cargo: "Alcaldía de Turbaco", lider: "Yesenia Barrios",
  zona: "La Ceiba", textoAutorizacion: "Autorizo a la campaña… (texto ficticio de prueba).", borrador: true,
  generado: new Date("2026-11-08T15:00:00Z"),
};

/** Pinta la matriz como lo hace el PDF (con su zona silenciosa) y la lee con jsQR, como lo hará la fase 4. */
function leerMatriz(m: boolean[][], px = 4) {
  const n = m.length + MARGEN_QR * 2;
  const lado = n * px;
  const datos = new Uint8ClampedArray(lado * lado * 4).fill(255);
  m.forEach((fila, f) => fila.forEach((negro, c) => {
    if (!negro) return;
    for (let dy = 0; dy < px; dy++) for (let dx = 0; dx < px; dx++) {
      const i = (((f + MARGEN_QR) * px + dy) * lado + (c + MARGEN_QR) * px + dx) * 4;
      datos[i] = datos[i + 1] = datos[i + 2] = 0;
    }
  }));
  return jsQR(datos, lado, lado)?.data ?? null;
}

describe("planilla en PDF", () => {
  it("una página por hoja, con título y sin autor personal", async () => {
    const pdf = await PDFDocument.load(await generarPlanillaPdf(base));
    expect(pdf.getPageCount()).toBe(3);
    expect(pdf.getTitle()).toBe("Planilla, lote 14");
    expect(pdf.getAuthor()).toBeUndefined();
    const [ancho, alto] = [pdf.getPage(0).getWidth(), pdf.getPage(0).getHeight()];
    expect([ancho, alto]).toEqual([792, 612]); // carta horizontal
  });

  it("el QR de cada hoja se lee y dice su lote y su hoja", () => {
    for (let hoja = 1; hoja <= 3; hoja++) {
      const texto = leerMatriz(matrizQr(codigoHoja({ loteId: LOTE, hoja, hojas: 3 })));
      expect(leerCodigoHoja(texto ?? "")).toEqual({ loteId: LOTE, hoja, hojas: 3 });
    }
  });

  it("aguanta datos extremos: nombres larguísimos, emoji y otros alfabetos", async () => {
    const pdf = await generarPlanillaPdf({
      ...base, hojas: 1, lider: "María de los Ángeles Castro-Villadiego Pacheco Simancas de la Hoz ".repeat(4) + "😀",
      candidato: "Ηλίας 李雷", zona: "Vereda " + "x".repeat(300), textoAutorizacion: "Autorizo ".repeat(400),
    });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });

  it("50 hojas (el máximo por lote) salen en un archivo razonable", async () => {
    const bytes = await generarPlanillaPdf({ ...base, hojas: 50 });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(50);
    expect(bytes.length).toBeLessThan(3_000_000);
  });
});

describe("textos", () => {
  it("conserva el español y cambia lo que la fuente no tiene", () => {
    expect(aWinAnsi("Ñandú «¿Cuándo?» · 15.419 — ok…")).toBe("Ñandú «¿Cuándo?» · 15.419 — ok…");
    expect(aWinAnsi("Hola 😀 李")).toBe("Hola ? ?");
  });

  it("parte en líneas que caben, aun con palabras larguísimas", async () => {
    const doc = await PDFDocument.create();
    const f = await doc.embedFont(StandardFonts.Helvetica);
    const lineas = partirLineas("corta " + "x".repeat(200) + " fin", f, 8, 100);
    expect(lineas.length).toBeGreaterThan(2);
    for (const l of lineas) expect(f.widthOfTextAtSize(l, 8)).toBeLessThanOrEqual(100);
  });
});

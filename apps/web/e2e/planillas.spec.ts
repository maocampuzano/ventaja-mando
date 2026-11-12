import { expect, test, type Page } from "@playwright/test";
import { irA } from "./ayudas";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { lideres } from "../src/data";

async function entrarComo(page: Page, rol: RegExp, codigo?: string) {
  await page.goto("/");
  await page.getByRole("button", { name: rol }).click();
  if (codigo) {
    await page.getByLabel("Código").fill(codigo);
    await page.getByRole("button", { name: "Verificar" }).click();
  }
  await irA(page, "Planillas");
}

test("la gerencia imprime un lote de planillas en PDF con su QR y queda registrado", async ({ page }) => {
  await entrarComo(page, /Gerente/, "123456");
  const caja = page.getByRole("region", { name: "Imprimir planillas" });
  await expect(caja.getByText("Todavía no se ha impreso ningún lote.")).toBeVisible();

  const lider = caja.getByLabel("Líder");
  const primero = (await lider.locator("option").first().textContent())!.split(" · ")[0];
  await caja.getByLabel(/^Hojas/).fill("2");
  await expect(caja.getByRole("button", { name: "Descargar 24 renglones en PDF" })).toBeEnabled();

  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    caja.getByRole("button", { name: "Descargar 24 renglones en PDF" }).click(),
  ]);
  expect(descarga.suggestedFilename()).toMatch(/^planilla-lote-1-[a-z0-9-]+\.pdf$/);
  const bytes = await readFile((await descarga.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(2);
  expect(pdf.getTitle()).toBe("Planilla, lote 1");

  await expect(caja.getByRole("status")).toContainText(`Lote 1 listo: 2 hojas para ${primero}`);
  const tabla = caja.getByRole("table", { name: "Lotes impresos" });
  await expect(tabla.getByRole("row")).toHaveCount(2);
  await expect(tabla).toContainText(primero);

  // El siguiente lote toma el número siguiente.
  await caja.getByLabel(/^Hojas/).fill("1");
  const [otra] = await Promise.all([
    page.waitForEvent("download"),
    caja.getByRole("button", { name: "Descargar 12 renglones en PDF" }).click(),
  ]);
  expect(otra.suggestedFilename()).toMatch(/^planilla-lote-2-/);
  await expect(tabla.getByRole("row")).toHaveCount(3);
});

test("regla 3: sin ninguna finalidad marcada no se imprime", async ({ page }) => {
  await entrarComo(page, /Gerente/, "123456");
  const caja = page.getByRole("region", { name: "Imprimir planillas" });
  for (const casilla of await caja.getByRole("checkbox").all()) await casilla.uncheck();
  await expect(caja.getByRole("button", { name: /Descargar/ })).toBeDisabled();
});

test("la coordinadora solo imprime para los líderes de sus zonas", async ({ page }) => {
  await entrarComo(page, /Coordinador/);
  const opciones = await page.getByRole("region", { name: "Imprimir planillas" }).getByLabel("Líder").locator("option").allTextContents();
  const suyos = lideres.filter((l) => ["z1", "z2", "z3"].includes(l.zonaId)).map((l) => l.nombre).sort();
  expect(suyos.length).toBeGreaterThan(0);
  expect(suyos.length).toBeLessThan(lideres.length);
  expect(opciones.map((o) => o.split(" · ")[0]).sort()).toEqual(suyos);
});

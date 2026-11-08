import { expect, test, type Page } from "@playwright/test";

async function entrar(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Gerente/ }).click();
  await page.getByLabel("Código").fill("123456");
  await page.getByRole("button", { name: "Verificar" }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Planillas" }).click();
}

test("regla 7: una hoja leída solo se aprueba después de confirmar cada fila dudosa", async ({ page }) => {
  await entrar(page);
  const caja = page.getByRole("region", { name: "Planillas por revisar" });
  await caja.getByRole("button", { name: "Revisar" }).click();

  const tabla = page.getByRole("table", { name: "Filas leídas" });
  await expect(tabla.getByRole("row")).toHaveCount(7);
  const aprobar = page.getByRole("button", { name: /Aprobar la hoja/ });
  await expect(aprobar).toBeDisabled();
  await expect(page.getByText("3 filas por confirmar (en ámbar o rojo).")).toBeVisible();

  // Renglón 3: la cédula se leyó con un «?»; al corregirla deja de estar en duda.
  const r3 = tabla.getByRole("row", { name: "Renglón 3" });
  await expect(r3.getByLabel("Cédula")).toHaveClass(/duda/);
  await r3.getByLabel("Cédula").fill("1143000017");
  await expect(r3.getByLabel("Cédula")).not.toHaveClass(/duda/);

  // Renglón 4: misma cédula que el 2 (rojo). Renglón 5: celular dudoso, se confirma contra la foto.
  const r4 = tabla.getByRole("row", { name: "Renglón 4" });
  await expect(r4.getByText("Misma cédula que el renglón 2")).toBeVisible();
  await r4.getByLabel("Descartar").check();
  const r5 = tabla.getByRole("row", { name: "Renglón 5" });
  await r5.getByLabel("Celular").fill("3000005521");

  // Renglón 6: sin firma, no se registra (regla 3).
  await expect(tabla.getByRole("row", { name: "Renglón 6" })).toContainText("Sin firma de autorización");

  await expect(page.getByText("Todo revisado.")).toBeVisible();
  await expect(aprobar).toHaveText("Aprobar la hoja (4 registros)");
  await aprobar.click();
  await expect(caja.getByRole("status")).toHaveText("Hoja aprobada: 4 personas nuevas como «sin contactar», 1 sin firma (no se registran), 1 descartadas.");
  await expect(page.getByRole("table", { name: "Filas leídas" })).toHaveCount(0);
});

test("sin vincular la hoja impresa no se aprueba; se vincula con un lote del mismo líder", async ({ page }) => {
  await entrar(page);
  const caja = page.getByRole("region", { name: "Planillas por revisar" });
  const fila = caja.getByRole("row").filter({ hasText: "Sin vincular" });
  const lider = (await fila.locator("td").first().textContent())!;

  // Imprimir un lote para ese líder, para poder vincular la foto con su hoja.
  const imprimir = page.getByRole("region", { name: "Imprimir planillas" });
  await imprimir.getByLabel("Líder").selectOption({ label: (await imprimir.getByLabel("Líder").locator("option", { hasText: lider }).textContent())! });
  await imprimir.getByLabel(/^Hojas/).fill("1");
  await Promise.all([page.waitForEvent("download"), imprimir.getByRole("button", { name: /Descargar/ }).click()]);

  await fila.getByRole("button", { name: "Leer con IA" }).click();
  await expect(caja.getByRole("status")).toContainText("Se leyeron 6 filas");
  await expect(page.getByText("Falta vincular la hoja impresa.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Aprobar la hoja/ })).toBeDisabled();

  const vincular = page.getByRole("group", { name: "Vincular con la hoja impresa" });
  await vincular.getByLabel("Lote impreso").selectOption({ index: 1 });
  await vincular.getByLabel("Hoja").fill("1");
  await vincular.getByRole("button", { name: "Vincular" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`Planilla de ${lider} · lote \\d+, hoja 1`) })).toBeVisible();
});

import { expect, test, type Page } from "@playwright/test";

async function entrarComoGerente(page: Page) {
  await page.goto("/");
  await page.getByLabel("Correo").fill("gerente@demo.co");
  await page.getByLabel("Contraseña").fill("demo2027");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByLabel("Código").fill("123456");
  await page.getByRole("button", { name: "Verificar" }).click();
}
const ir = (page: Page, vista: string) => page.getByRole("navigation").getByRole("button", { name: vista }).click();

test("la dirección revisa la auditoría y la filtra", async ({ page }) => {
  await entrarComoGerente(page);
  await ir(page, "Datos");
  const caja = page.getByRole("region", { name: "Auditoría" });
  const tabla = caja.getByRole("table", { name: "Registro de auditoría" });
  await expect(tabla).toContainText("Exportó personas");
  await expect(tabla).toContainText("Sin sesión (enlace)");
  await caja.getByLabel("Acción").selectOption("ver_documento");
  await expect(tabla.locator("tbody tr")).toHaveCount(1);
  await expect(tabla).toContainText("Vio una cédula completa");
});

test("un error del panel queda registrado sin el celular que traía", async ({ page }) => {
  await entrarComoGerente(page);
  await ir(page, "Mando");
  await page.evaluate(() => { setTimeout(() => { throw new Error("Falló al guardar el celular 300 000 9001"); }); });
  await page.waitForTimeout(200);
  await ir(page, "Datos");
  const errores = page.getByRole("region", { name: "Errores del panel" });
  await expect(errores).toContainText("Falló al guardar el celular ‹número›");
  await expect(errores).not.toContainText("9001");
});

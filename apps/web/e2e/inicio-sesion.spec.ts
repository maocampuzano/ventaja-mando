import { expect, test, type Page } from "@playwright/test";

async function entrar(page: Page, correo: string, clave = "demo2027") {
  await page.goto("/");
  await page.getByLabel("Correo").fill(correo);
  await page.getByLabel("Contraseña").fill(clave);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test("una contraseña equivocada no deja entrar", async ({ page }) => {
  await entrar(page, "gerente@demo.co", "otra");
  await expect(page.getByRole("alert")).toHaveText("El correo o la contraseña no coinciden.");
});

test("el gerente necesita el código de dos pasos y luego ve toda la campaña", async ({ page }) => {
  await entrar(page, "gerente@demo.co");
  await expect(page.getByRole("heading", { name: "Verificación en dos pasos" })).toBeVisible();
  await page.getByLabel("Código").fill("000000");
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page.getByRole("alert")).toHaveText("El código no es válido o ya venció.");

  await page.getByLabel("Código").fill("123456");
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page.locator("polygon.zona")).toHaveCount(19);
  for (const s of ["Mando", "Líderes", "Planillas", "Día E", "Datos"]) {
    await expect(page.getByRole("navigation").getByRole("button", { name: s })).toBeVisible();
  }
  await page.getByRole("navigation").getByRole("button", { name: "Líderes" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(22);
});

test("la coordinadora solo ve sus tres zonas y sus líderes", async ({ page }) => {
  await entrar(page, "coordinadora@demo.co");
  await expect(page.locator("polygon.zona")).toHaveCount(3);
  await expect(page.getByRole("navigation").getByRole("button", { name: "Datos" })).toHaveCount(0);
  await expect(page.getByRole("navigation").getByRole("button", { name: "Día E" })).toHaveCount(0);
  await page.getByRole("navigation").getByRole("button", { name: "Líderes" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(6);
});

test("la candidata entra a su resumen y no ve la lista de líderes", async ({ page }) => {
  await entrar(page, "candidata@demo.co");
  await expect(page.getByRole("heading", { name: /Buenos días, Laura/ })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("button", { name: "Líderes" })).toHaveCount(0);
});

test("salir vuelve a la pantalla de inicio de sesión", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Coordinador/ }).click();
  await expect(page.locator("polygon.zona")).toHaveCount(3);
  await page.getByRole("button", { name: "Salir" }).first().click();
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
});

import { expect, test, type Page } from "@playwright/test";
import { irA, menu } from "./ayudas";

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
  await expect(page.getByRole("heading", { name: "Para hoy" })).toBeVisible();
  await expect(menu(page).getByRole("button")).toHaveText(["Hoy", "Mi gente", "Contactar", "Cuentas", "Día E", "Cumplimiento", "Ajustes"]);
  await irA(page, "Mapa y asesor");
  await expect(page.locator("polygon.zona")).toHaveCount(19);
  await irA(page, "Líderes");
  await expect(page.locator("tbody tr")).toHaveCount(22);
});

test("la coordinadora solo ve sus tres zonas y sus líderes", async ({ page }) => {
  await entrar(page, "coordinadora@demo.co");
  await expect(menu(page).getByRole("button")).toHaveText(["Hoy", "Mi gente", "Día E"]);
  await irA(page, "Mapa y asesor");
  await expect(page.locator("polygon.zona")).toHaveCount(3);
  await irA(page, "Líderes");
  await expect(page.locator("tbody tr")).toHaveCount(6);
});

test("la candidata entra a su resumen y no ve la lista de líderes", async ({ page }) => {
  await entrar(page, "candidata@demo.co");
  await expect(page.getByRole("heading", { name: /Buenos días, Laura/ })).toBeVisible();
  await expect(menu(page).getByRole("button")).toHaveText(["Hoy", "Contactar", "Cuentas", "Día E"]);
});

test("salir vuelve a la pantalla de inicio de sesión", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Coordinador/ }).click();
  await expect(page.getByRole("heading", { name: "Para hoy" })).toBeVisible();
  await page.getByRole("button", { name: "Salir" }).first().click();
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
});

test("la demostración entra con un clic por rol, sin contraseña ni código", async ({ page }) => {
  await page.goto("/");
  const demo = page.getByRole("region", { name: "Véalo por dentro" });
  await expect(demo.getByRole("button")).toHaveCount(6);
  await demo.getByRole("button", { name: /Gerente/ }).click();
  await expect(page.getByRole("heading", { name: "Para hoy" })).toBeVisible();
  await page.reload(); // la sesión de la demostración se mantiene en la pestaña
  await expect(page.getByRole("heading", { name: "Para hoy" })).toBeVisible();
  await page.getByRole("button", { name: "Salir" }).first().click();
  await page.getByRole("region", { name: "Véalo por dentro" }).getByRole("button", { name: /Candidato/ }).click();
  await expect(page.getByRole("heading", { name: /Laura/ })).toBeVisible();
});

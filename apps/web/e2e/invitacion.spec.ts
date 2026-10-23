import { expect, test, type Page } from "@playwright/test";

async function entrarComoGerente(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Gerente/ }).click();
  await page.getByLabel("Código").fill("123456");
  await page.getByRole("button", { name: "Verificar" }).click();
}

test("una invitación con QR lleva a la persona a su rol y sus zonas", async ({ page }) => {
  await entrarComoGerente(page);
  await page.getByRole("navigation").getByRole("button", { name: "Equipo" }).click();
  await expect(page.getByRole("option", { name: "Administrador" })).toHaveCount(0); // gerencia no invita administradores

  await page.getByLabel("Correo de la persona").fill("Nueva.Coordinadora@Ficticio.co");
  await page.getByLabel("Rol").selectOption("coordinador");
  await page.getByRole("button", { name: "Crear invitación" }).click();
  await expect(page.getByRole("alert")).toHaveText("Indique al menos una zona para el rol coordinador.");

  await page.getByLabel("Centro").check();
  await page.getByLabel("La Ceiba").check();
  await page.getByRole("button", { name: "Crear invitación" }).click();
  await expect(page.getByRole("img", { name: /Código QR de la invitación/ })).toBeVisible();
  await expect(page.getByText("nueva.coordinadora@ficticio.co")).toHaveCount(2); // en la tarjeta y en pendientes
  const enlace = await page.getByLabel("Enlace de la invitación").inputValue();
  expect(enlace).toMatch(/\?invitacion=[\w-]{32}$/);
  const whatsapp = await page.getByRole("link", { name: "Enviar por WhatsApp" }).getAttribute("href");
  expect(whatsapp).toMatch(/^https:\/\/wa\.me\/\?text=/); // se abre en el teléfono de quien invita; no hay envío automático

  await page.getByRole("button", { name: "Salir" }).first().click();
  await page.goto(enlace);
  await page.getByLabel("Su nombre completo").fill("Coordinadora Ficticia Nueva");
  await page.getByLabel("Correo").fill("otra@ficticio.co");
  await page.getByLabel(/Contraseña nueva/).fill("clave-ficticia-larga");
  await page.getByRole("button", { name: "Aceptar la invitación" }).click();
  await expect(page.getByRole("alert")).toHaveText("La invitación es para otro correo.");

  await page.getByLabel("Correo").fill("nueva.coordinadora@ficticio.co");
  await page.getByRole("button", { name: "Aceptar la invitación" }).click();
  await expect(page.locator("polygon.zona")).toHaveCount(2);
  await expect(page.getByText("Coordinadora Ficticia Nueva")).toBeVisible();
  expect(page.url()).not.toContain("invitacion=");

  // La invitación ya se usó: el mismo enlace no sirve otra vez.
  await page.getByRole("button", { name: "Salir" }).first().click();
  await page.goto(enlace);
  await page.getByRole("tab", { name: "Ya tengo cuenta" }).click();
  await page.getByLabel("Correo").fill("nueva.coordinadora@ficticio.co");
  await page.getByLabel("Contraseña").fill("clave-ficticia-larga");
  await page.getByRole("button", { name: "Aceptar la invitación" }).click();
  await expect(page.getByRole("alert")).toHaveText("La invitación no existe, ya se usó o venció.");
});

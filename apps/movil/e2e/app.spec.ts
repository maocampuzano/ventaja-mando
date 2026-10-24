import { expect, test, type Page } from "@playwright/test";

async function entrar(page: Page, correo: string) {
  await page.goto("/");
  await page.getByLabel("Correo").fill(correo);
  await page.getByLabel("Contraseña").fill("cualquiera");
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("el líder registra sin señal y se envía al volver la señal", async ({ page }) => {
  await entrar(page, "lider@demo.co");
  await expect(page.getByText("Hola, Yesenia")).toBeVisible();
  await expect(page.getByText("Todo enviado")).toBeVisible();

  await page.getByLabel("Simular sin señal").click();
  await page.getByRole("checkbox", { name: /Visitar a 8 simpatizantes/ }).click();
  await page.getByRole("tab", { name: "Registrar" }).click();
  await page.getByLabel("Nombre completo").fill("Ana Ficticia Ruiz");
  await page.getByLabel("Celular (opcional)").fill("300 000 9911");

  // Sin autorización no se guarda (regla 3).
  await page.getByRole("button", { name: "Guardar registro" }).click();
  await expect(page.getByText(/Falta la autorización/)).toBeVisible();
  await page.getByRole("checkbox", { name: /Contacto de la campaña/ }).click();
  await page.getByRole("checkbox", { name: /aceptó/ }).click();
  await page.getByRole("button", { name: "Guardar registro" }).click();
  await expect(page.getByText("Ana Ficticia Ruiz quedó guardada en el teléfono")).toBeVisible();
  await expect(page.getByText("2 esperando señal para enviarse")).toBeVisible();

  await page.getByRole("tab", { name: "Mi gente" }).click();
  await expect(page.getByText("Ana Ficticia Ruiz")).toBeVisible();
  await expect(page.getByText("Por enviar")).toBeVisible();

  await page.getByLabel("Simular sin señal").click();
  await expect(page.getByText("Todo enviado")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Sincronización/ }).click();
  await expect(page.getByText(/0 por enviar · 2 enviados/)).toBeVisible();
});

test("WhatsApp: solo un enlace que el líder abre, y nunca para quien retiró la autorización", async ({ page }) => {
  // Sin salir a internet: se responde aquí la página de WhatsApp para ver a dónde lleva el enlace.
  await page.context().route(/https:\/\/(wa\.me|api\.whatsapp\.com)\/.*/, (r) => r.fulfill({ body: "WhatsApp" }));
  await entrar(page, "lider@demo.co");
  await page.getByRole("tab", { name: "Mi gente" }).click();
  await expect(page.getByText("Retiró su autorización: no se le puede contactar.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Escribir por WhatsApp a Yulieth Julio" })).toHaveCount(0);
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("link", { name: "Escribir por WhatsApp a Ana Ruiz" }).click(),
  ]);
  expect(popup.url()).toMatch(/^https:\/\/wa\.me\/573000001005\?text=Hola%2C%20Ana\./);
  await popup.close();
});

test("el testigo reporta la apertura y una novedad", async ({ page }) => {
  await entrar(page, "testigo@demo.co");
  await expect(page.getByText("Mesa 3")).toBeVisible();
  await page.getByRole("button", { name: "Ya estoy en la mesa" }).click();
  await expect(page.getByText("Reportó que la mesa está instalada. Gracias.")).toBeVisible();
  await page.getByRole("radio", { name: /Posible compra de votos/ }).click();
  await expect(page.getByText(/No confronte a nadie/)).toBeVisible();
  await page.getByRole("button", { name: "Enviar novedad" }).click();
  await expect(page.getByText("Todo enviado")).toBeVisible({ timeout: 10_000 });
});

test("la app no deja entrar con cuentas que no son del demo", async ({ page }) => {
  await entrar(page, "alguien@ejemplo.co");
  await expect(page.getByText(/entre con lider@demo.co o testigo@demo.co/)).toBeVisible();
});

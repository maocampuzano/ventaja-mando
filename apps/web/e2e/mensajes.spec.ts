import { expect, test, type Page } from "@playwright/test";
import { irA } from "./ayudas";

const MIERCOLES_10AM = new Date("2027-10-27T10:00:00-05:00");
const DOMINGO = new Date("2027-10-24T10:00:00-05:00");

async function entrar(page: Page, correo: string, hora = MIERCOLES_10AM) {
  await page.clock.setFixedTime(hora);
  await page.goto("/");
  await page.getByLabel("Correo").fill(correo);
  await page.getByLabel("Contraseña").fill("demo2027");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  if (correo.startsWith("gerente")) {
    await page.getByLabel("Código").fill("123456");
    await page.getByRole("button", { name: "Verificar" }).click();
  }
}
const irAMensajes = (page: Page) => irA(page, "Mensajes");

test("la dirección arma, aprueba y envía un SMS solo a personas autorizadas", async ({ page }) => {
  await entrar(page, "gerente@demo.co");
  await irAMensajes(page);
  await page.getByRole("button", { name: "Nuevo envío" }).click();
  const caja = page.getByRole("region", { name: "Nuevo envío" });
  await caja.getByLabel("Nombre interno del envío").fill("Invitación al cierre");

  // Regla 1: nada de WhatsApp en un mensaje masivo.
  await caja.getByLabel("Mensaje").fill("Escríbenos a wa.me/573000000000");
  await expect(caja.getByText(/regla 1/)).toBeVisible();
  await expect(caja.getByRole("button", { name: "Guardar borrador" })).toBeDisabled();

  await caja.getByLabel("Mensaje").fill("Hola {nombre}, te esperamos el sabado.");
  await expect(caja.getByText(/el SMS ocupa 1 mensaje \(GSM-7\)/)).toBeVisible(); // con el pie y el enlace de baja
  const conteo = caja.getByRole("status");
  await expect(conteo).toContainText(/\d/);
  const todos = Number((await conteo.locator("strong").innerText()).replace(/\./g, ""));
  await caja.getByLabel("Validados").check();
  await expect(conteo.locator("strong")).not.toHaveText(String(todos));
  await caja.getByRole("button", { name: "Guardar borrador" }).click();

  const envio = page.getByRole("region", { name: "Envíos" }).getByLabel("Invitación al cierre");
  await expect(envio).toContainText("Borrador");
  page.once("dialog", (d) => d.accept());
  await envio.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Aprobado para \d/ })).toBeVisible();
  await envio.getByRole("button", { name: "Enviar el primer lote" }).click();
  await expect(page.getByRole("status").filter({ hasText: "no salió ningún mensaje de verdad" })).toBeVisible();
});

test("advierte de palabras que pueden sugerir dádivas y del costo de las tildes", async ({ page }) => {
  await entrar(page, "gerente@demo.co");
  await irAMensajes(page);
  await page.getByRole("button", { name: "Nuevo envío" }).click();
  const caja = page.getByRole("region", { name: "Nuevo envío" });
  await caja.getByLabel("Mensaje").fill("Ven a la reunión y recibe tu mercado");
  await expect(caja.getByText(/no ofrezca nada a cambio del voto.*\(mercado\)/)).toBeVisible();
  await expect(caja.getByText(/«ó».*70 caracteres/)).toBeVisible();
});

test("los domingos se puede armar, pero no enviar", async ({ page }) => {
  await entrar(page, "gerente@demo.co", DOMINGO);
  await irAMensajes(page);
  await expect(page.getByText("Ahora no se puede enviar: Los domingos no se envían mensajes.")).toBeVisible();
});

test("la candidata ve los envíos, pero no arma ninguno; la coordinación no tiene mensajes", async ({ page }) => {
  await entrar(page, "candidata@demo.co");
  await irAMensajes(page);
  await expect(page.getByRole("heading", { name: "Mensajes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nuevo envío" })).toHaveCount(0);
  await page.getByRole("button", { name: "Salir" }).click();
  await entrar(page, "coordinadora@demo.co");
  await expect(page.getByRole("navigation").getByRole("button", { name: "Contactar" })).toHaveCount(0);
});

test("la baja se da en un paso desde el enlace del mensaje, sin cuenta", async ({ page }) => {
  await page.goto("/#b/1742.0123456789ab");
  await page.getByRole("button", { name: "No quiero recibir más mensajes" }).click();
  await expect(page.getByRole("heading", { name: "Listo" })).toBeVisible();
  await expect(page.getByText(/no le volverá a enviar mensajes/)).toBeVisible();

  await page.goto("/#baja/inventado");
  await page.reload();
  await page.getByRole("button", { name: "No quiero recibir más mensajes" }).click();
  await expect(page.getByRole("alert")).toHaveText("El enlace no es válido.");
});

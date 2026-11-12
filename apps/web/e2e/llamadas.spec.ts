import { expect, test, type Page } from "@playwright/test";
import { irA } from "./ayudas";

const MIERCOLES_10AM = new Date("2027-10-27T10:00:00-05:00");

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

test("la dirección arma una cola solo con personas autorizadas y le asigna una operadora", async ({ page }) => {
  await entrar(page, "gerente@demo.co");
  await irA(page, "Llamadas");
  await page.getByRole("button", { name: "Nueva cola" }).click();
  const caja = page.getByRole("region", { name: "Nueva cola" });
  await caja.getByLabel("Nombre de la cola").fill("Invitación al sábado");
  await caja.getByLabel("Guion para el operador").fill("Buenos días, le hablo de la campaña.");
  await caja.getByLabel("Comprometidos").check();
  await expect(caja.getByRole("status")).toContainText("con autorización vigente para contacto, sin baja y con celular");
  await caja.getByRole("button", { name: "Crear la cola" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Cola creada con \d/ })).toBeVisible();

  const cola = page.getByRole("region", { name: "Invitación al sábado" });
  await cola.getByLabel("Operadora Demo").check();
  await expect(page.getByRole("status").filter({ hasText: "Operadores actualizados." })).toBeVisible();
  await expect(cola.getByLabel("Operadora Demo")).toBeChecked();
});

test("la operadora llama a una persona a la vez y registra resultados sin opinión política", async ({ page }) => {
  await entrar(page, "operador@demo.co");
  // Solo tiene su espacio: nada del tablero ni de la base.
  await expect(page.getByRole("navigation").getByRole("button")).toHaveText(["Llamar"]);
  const llamada = page.getByRole("region", { name: "Llamada en curso" });
  const primera = await llamada.getByRole("heading", { level: 2 }).innerText();
  await expect(llamada.getByRole("link", { name: /Llamar al 300/ })).toHaveAttribute("href", /^tel:\d+$/);
  await expect(llamada).toContainText("Buenos días, le hablo de la campaña de Laura Méndez");
  // Regla 2: ningún botón registra apoyo ni intención de voto.
  await expect(llamada.getByRole("button", { name: /apoya|vot/i })).toHaveCount(0);

  await llamada.getByRole("button", { name: /No contestó/ }).click();
  await expect(llamada.getByRole("heading", { level: 2 })).not.toHaveText(primera);

  page.once("dialog", (d) => d.accept());
  await llamada.getByRole("button", { name: /No quiere que la vuelvan a contactar/ }).click();
  await expect(llamada.getByRole("heading", { level: 2 })).toBeVisible();
});

test("fuera del horario la operadora no recibe llamadas", async ({ page }) => {
  await entrar(page, "operador@demo.co", new Date("2027-10-27T20:00:00-05:00"));
  await expect(page.getByText(/Fuera del horario de llamadas/).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Llamada en curso" })).toHaveCount(0);
});

test("la coordinación y la candidata no manejan colas", async ({ page }) => {
  await entrar(page, "coordinadora@demo.co");
  await expect(page.getByRole("navigation").getByRole("button", { name: "Llamadas" })).toHaveCount(0);
  await page.getByRole("button", { name: "Salir" }).click();
  await entrar(page, "candidata@demo.co");
  await expect(page.getByRole("navigation").getByRole("button", { name: "Llamadas" })).toHaveCount(0);
});

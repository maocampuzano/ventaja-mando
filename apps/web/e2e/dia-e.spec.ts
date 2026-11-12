import { expect, test, type Page } from "@playwright/test";
import { irA } from "./ayudas";

async function entrar(page: Page, correo: string) {
  await page.goto("/");
  await page.getByLabel("Correo").fill(correo);
  await page.getByLabel("Contraseña").fill("demo2027");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  if (correo.startsWith("gerente")) {
    await page.getByLabel("Código").fill("123456");
    await page.getByRole("button", { name: "Verificar" }).click();
  }
  await irA(page, "Día E");
}

test("el centro de mando muestra el semáforo con su motivo y se rotula como consolidación privada", async ({ page }) => {
  await entrar(page, "gerente@demo.co");
  await expect(page.getByText("Consolidación privada de la campaña")).toBeVisible();
  await expect(page.getByLabel("Hora de la jornada")).toContainText("4:40");
  const mesa = page.locator("button.mesa").first();
  await expect(mesa).toHaveAttribute("aria-label", /Mesa \d+, .+: .+/);
  await mesa.click();
  await expect(page.getByRole("region", { name: /^Mesa \d+$/ })).toBeVisible();

  // Filtrar deja solo las mesas en ámbar o rojo.
  await page.getByLabel("Ver solo las mesas que piden atención").check();
  await expect(page.locator("button.mesa.verde")).toHaveCount(0);
});

test("regla 7: el E-14 se suma solo después de que una persona lo revisa", async ({ page }) => {
  await entrar(page, "gerente@demo.co");
  const caja = page.getByRole("region", { name: "E-14 por revisar" });
  await expect(page.getByText("0 revisados por una persona")).toBeVisible();
  await caja.getByRole("button", { name: "Revisar" }).first().click();

  await expect(page.getByRole("heading", { name: /Revisar E-14: .+, mesa \d+/ })).toBeVisible();
  // Quien revisa corrige el total: las alertas se recalculan con lo que escribe.
  await page.getByLabel("Total de votos").fill("1");
  await expect(page.getByRole("list", { name: "Alertas del acta" })).toContainText("no coincide con el total escrito");
  await page.getByLabel("Votos de la opción 1").fill("");
  await expect(page.getByRole("button", { name: /Confirmar/ })).toBeDisabled();
  await page.getByLabel("Votos de la opción 1").fill("100");
  await page.getByRole("button", { name: /Confirmar/ }).click();

  await expect(page.getByRole("status").filter({ hasText: "Acta revisada." })).toBeVisible();
  await expect(page.getByText("1 revisado por una persona")).toBeVisible();
});

test("las novedades se atienden desde el panel", async ({ page }) => {
  await entrar(page, "gerente@demo.co");
  const caja = page.getByRole("region", { name: "Novedades" });
  const antes = await caja.getByRole("button", { name: "Marcar atendida" }).count();
  test.skip(antes === 0, "La semilla no dejó novedades abiertas a esta hora.");
  await caja.getByRole("button", { name: "Marcar atendida" }).first().click();
  await expect(caja.getByRole("button", { name: "Marcar atendida" })).toHaveCount(antes - 1);
});

test("un simulacro corre aparte y se borra al terminar", async ({ page }) => {
  await entrar(page, "gerente@demo.co");
  await page.getByRole("button", { name: "Iniciar simulacro" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Simulacro en curso" })).toBeVisible();
  const hora = page.getByLabel("Hora de la jornada");
  await expect(hora).toContainText("7:5");
  await expect(hora).not.toContainText("7:5", { timeout: 8000 }); // la jornada simulada avanza
  await expect(page.getByRole("region", { name: "E-14 por revisar" })).toContainText("No hay actas pendientes.");

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Terminar simulacro" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Simulacro terminado." })).toBeVisible();
  await expect(hora).toContainText("4:40");
});

test("la coordinadora maneja sus puestos, pero no inicia simulacros", async ({ page }) => {
  await entrar(page, "coordinadora@demo.co");
  await expect(page.locator("button.mesa").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar simulacro" })).toHaveCount(0);
});

test("la candidata ve el tablero, pero no atiende novedades ni revisa actas", async ({ page }) => {
  await entrar(page, "candidata@demo.co");
  await expect(page.locator("button.mesa").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Marcar atendida" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "E-14 por revisar" }).getByRole("button", { name: "Revisar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Iniciar simulacro" })).toHaveCount(0);
});

test("cumplimiento de líderes: agregado, con umbral y con su advertencia", async ({ page }) => {
  await entrar(page, "gerente@demo.co");
  const caja = page.getByRole("region", { name: "Cumplimiento de los líderes contra el E-14" });
  await expect(caja).toContainText("no identifica votos individuales");
  const tabla = caja.getByRole("table", { name: "Cumplimiento por líder" });
  await expect(tabla.getByRole("row")).toHaveCount(23); // encabezado + 22 líderes
  await expect(tabla.getByText("Sin datos suficientes").first()).toBeVisible();

  // Sin configurar la opción del E-14, no calcula.
  await caja.getByLabel("Cómo aparece la candidata en el E-14").fill("");
  await caja.getByRole("button", { name: "Guardar" }).click();
  await expect(caja.getByText("Escriba cómo aparece la candidata en el E-14 para calcularlo.")).toBeVisible();
  await expect(tabla).toHaveCount(0);
});

test("la candidata ve el cumplimiento, pero no lo configura", async ({ page }) => {
  await entrar(page, "candidata@demo.co");
  const caja = page.getByRole("region", { name: "Cumplimiento de los líderes contra el E-14" });
  await expect(caja.getByRole("table")).toBeVisible();
  await expect(caja.getByRole("button", { name: "Guardar" })).toHaveCount(0);
});

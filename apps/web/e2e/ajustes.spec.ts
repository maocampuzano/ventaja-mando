import { expect, test } from "@playwright/test";
import { irA, menu } from "./ayudas";

test("la dirección tiene Ajustes: datos de la campaña, tope de gastos, roles y apariencia", async ({ page }) => {
  await page.goto("/#gerente-ajustes");
  await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible();
  const campana = page.getByRole("region", { name: "La campaña" });
  await expect(campana).toContainText("Laura Méndez");
  await expect(campana).toContainText("31/10/2027");
  await expect(campana).toContainText("18.500");

  const tope = page.getByRole("region", { name: "Tope de gastos del CNE" });
  await tope.getByLabel("Tope en pesos").fill("500000000");
  await tope.getByRole("button", { name: "Guardar el tope" }).click();
  await expect(tope.getByRole("status")).toHaveText("Tope de gastos guardado.");
  await irA(page, "Cuentas");
  await expect(page.getByLabel("Tope de gastos en pesos")).toHaveValue("$ 500.000.000");

  await irA(page, "Ajustes");
  await page.getByLabel("Usar el modo sala en todo el panel").check();
  await expect(page.locator("main.lienzo")).toHaveClass(/tema-sala/);
  await page.getByRole("region", { name: "Quién entra y con qué rol" }).getByRole("button", { name: "Invitar o ver el equipo" }).click();
  await expect(page.getByRole("heading", { name: "Equipo", exact: true })).toBeVisible();
});

test("solo la dirección ve Ajustes", async ({ page }) => {
  await page.goto("/#coordinador-hoy");
  await expect(menu(page).getByRole("button", { name: "Ajustes" })).toHaveCount(0);
  await page.goto("/#candidato-resumen"); await page.reload();
  await expect(menu(page).getByRole("button", { name: "Ajustes" })).toHaveCount(0);
});

test("sin pauta conectada, el mapa y el resumen no muestran cifras de pauta", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#gerente-mando");
  await expect(page.getByRole("group", { name: "Capas del mapa" }).getByRole("button")).toHaveText(
    ["Qué hacer en cada zona", "Simpatizantes validados", "Avance frente a la meta", "Cobertura de testigos"]);
  await expect(page.getByRole("region", { name: "Recomendaciones de hoy" })).not.toContainText(/pauta|digital/i);
  await page.goto("/#candidato-resumen"); await page.reload();
  await expect(page.getByText("La pauta")).toHaveCount(0);
  await expect(page.getByText("El equipo")).toBeVisible();
});

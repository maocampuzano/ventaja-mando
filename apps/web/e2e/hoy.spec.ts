import { expect, test } from "@playwright/test";
import { menu } from "./ayudas";

test("la gerencia entra a «Hoy», ve qué hacer y cada pendiente la lleva a donde se resuelve", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Gerente/ }).click();
  await page.getByLabel("Código").fill("123456");
  await page.getByRole("button", { name: "Verificar" }).click();

  await expect(page.getByRole("heading", { name: /^(Buenos días|Buenas tardes|Buenas noches), Gerente$/ })).toBeVisible();
  const paraHoy = page.getByRole("region", { name: "Para hoy" });
  await expect(paraHoy.getByText(/Revisar \d+ planillas? que/)).toBeVisible();
  await expect(paraHoy.getByText(/Asignar testigos a \d+ mesas? sin cubrir/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Cómo vamos frente a la meta" })).toContainText("meta de votos");

  await paraHoy.getByRole("button", { name: "Revisar" }).click();
  await expect(menu(page).getByRole("button", { name: "Mi gente" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Dentro de Mi gente" }).getByRole("button", { name: "Planillas" })).toHaveAttribute("aria-current", "page");

  await menu(page).getByRole("button", { name: "Hoy" }).click();
  await page.getByRole("button", { name: "Abrir el Asesor IA" }).click();
  await expect(page.getByRole("tab", { name: "Asesor IA" })).toHaveAttribute("aria-selected", "true");
});

test("la coordinación ve «Hoy» con la meta de sus zonas y sin lo que es solo de la dirección", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Coordinador/ }).click();
  await expect(page.getByRole("region", { name: "Cómo vamos frente a la meta" })).toContainText("meta de sus zonas");
  await expect(page.getByRole("region", { name: "Para hoy" }).getByText(/envío/)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Avisos" }).getByText(/tope/)).toHaveCount(0);
  await expect(menu(page).getByRole("button")).toHaveText(["Hoy", "Mi gente", "Día E"]);
});

test("cada sección abre con sus pestañas y el enlace directo sigue funcionando", async ({ page }) => {
  await page.goto("/#gerente-llamadas");
  await expect(menu(page).getByRole("button", { name: "Contactar" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Dentro de Contactar" }).getByRole("button")).toHaveText(["Mensajes", "Llamadas"]);
  await menu(page).getByRole("button", { name: "Mi gente" }).click();
  await expect(page.getByRole("navigation", { name: "Dentro de Mi gente" }).getByRole("button")).toHaveText(["Líderes", "Equipo", "Importar", "Formularios", "Planillas"]);
  await menu(page).getByRole("button", { name: "Cuentas" }).click();
  await expect(page.getByRole("navigation", { name: /^Dentro de/ })).toHaveCount(0);
});

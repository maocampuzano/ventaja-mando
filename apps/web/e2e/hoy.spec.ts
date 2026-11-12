import { expect, test } from "@playwright/test";
import { menu } from "./ayudas";

test("la gerencia entra a «Hoy», ve qué hacer y cada pendiente la lleva a donde se resuelve", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Gerente/ }).click();

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

test("el panel abre en claro, el mapa y el día E van en modo sala y el botón pone todo en oscuro", async ({ page }) => {
  await page.goto("/#gerente-hoy");
  const lienzo = page.locator("main.lienzo");
  await expect(lienzo).not.toHaveClass(/tema-sala/);
  await page.getByRole("navigation", { name: "Dentro de Hoy" }).getByRole("button", { name: "Mapa y asesor" }).click();
  await expect(lienzo).toHaveClass(/tema-sala/);
  await menu(page).getByRole("button", { name: "Día E" }).click();
  await expect(lienzo).toHaveClass(/tema-sala/);
  await menu(page).getByRole("button", { name: "Cuentas" }).click();
  await expect(lienzo).not.toHaveClass(/tema-sala/);

  await page.getByRole("button", { name: "Modo sala" }).click();
  await expect(lienzo).toHaveClass(/tema-sala/);
  await page.goto("/#gerente-finanzas"); await page.reload(); // la elección se recuerda en ese navegador
  await expect(page.locator("main.lienzo")).toHaveClass(/tema-sala/);
  await page.getByRole("button", { name: "Modo claro" }).click();
  await expect(page.locator("main.lienzo")).not.toHaveClass(/tema-sala/);
});

test("la dirección ve los pasos para poner la campaña en marcha y cada uno lleva a su pantalla", async ({ page }) => {
  await page.goto("/#gerente-hoy");
  const arranque = page.getByRole("region", { name: "Ponga su campaña en marcha" });
  await expect(arranque.getByRole("listitem")).toHaveCount(7);
  const siguiente = arranque.locator('li[aria-current="step"]');
  await expect(siguiente).toContainText("Imprimir las primeras planillas");
  await expect(arranque.locator("li.hecho").first()).toContainText("Fijar el tope");
  await siguiente.getByRole("button", { name: "Imprimir" }).click();
  await expect(page.getByRole("navigation", { name: "Dentro de Mi gente" }).getByRole("button", { name: "Planillas" })).toHaveAttribute("aria-current", "page");

  await menu(page).getByRole("button", { name: "Hoy" }).click();
  await page.getByRole("region", { name: "Ponga su campaña en marcha" }).getByRole("button", { name: "Ocultar" }).click();
  await expect(page.getByRole("region", { name: "Ponga su campaña en marcha" })).toHaveCount(0);
  await page.goto("/#gerente-hoy"); await page.reload(); // ocultarlo se recuerda en ese navegador
  await expect(page.getByText(/Faltan \d pasos? para tener la campaña en marcha/)).toBeVisible();
  await page.getByRole("button", { name: "Ver los pasos" }).click();
  await expect(page.getByRole("region", { name: "Ponga su campaña en marcha" })).toBeVisible();
});

test("la coordinación no ve el arranque guiado", async ({ page }) => {
  await page.goto("/#coordinador-hoy");
  await expect(page.getByRole("heading", { name: "Para hoy" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ponga su campaña en marcha" })).toHaveCount(0);
});

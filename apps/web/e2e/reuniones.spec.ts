import { expect, test } from "@playwright/test";
import { irA, menu } from "./ayudas";

test("la dirección registra una reunión, redacta el acta, la aprueba y la encuentra en la base de conocimiento", async ({ page }) => {
  await page.goto("/#gerente-reuniones");
  await expect(page.getByRole("heading", { name: "Reuniones", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Nueva reunión" }).click();
  await page.getByLabel("Título").fill("Reunión con líderes de Milán");
  await page.getByLabel("Zona").selectOption({ label: "Milán" });
  await page.getByLabel("Personas de la comunidad que asistieron").fill("30");
  await page.getByRole("button", { name: "Crear la reunión" }).click();

  await page.getByLabel("Notas de la reunión").fill(
    "Los líderes de Milán pidieron mejorar el acueducto y el agua potable. Doña Rosa dejó su celular 310 000 4321.\nVisitar la vereda La Esperanza con el ingeniero.");
  await page.getByRole("button", { name: "Redactar con IA" }).click();
  await expect(page.getByLabel("Resumen")).toHaveValue(/acueducto/);
  await expect(page.getByLabel("Resumen")).not.toHaveValue(/310 000 4321/);
  await expect(page.getByLabel("Qué se va a hacer")).toHaveValue("Visitar la vereda La Esperanza con el ingeniero");

  // Regla 4: un compromiso con beneficios no deja aprobar.
  await page.getByRole("button", { name: "Agregar compromiso" }).click();
  await page.getByLabel("Qué se va a hacer").nth(1).fill("Llevar mercados a los asistentes");
  await expect(page.getByText("Este compromiso habla de dinero o beneficios")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aprobar el acta" })).toBeDisabled();
  await page.getByRole("button", { name: "Quitar" }).nth(1).click();

  await page.getByRole("button", { name: "Aprobar el acta" }).click();
  await expect(page.getByRole("status")).toContainText("Acta aprobada. 1 compromiso quedó como tarea.");

  await page.getByLabel("Qué busca").fill("acueducto");
  await page.getByRole("button", { name: "Buscar en las actas" }).click();
  await expect(page.getByLabel("Resultados de la búsqueda")).toContainText("Reunión con líderes de Milán");
});

test("la candidata ve sus reuniones; la coordinadora solo las de sus municipios; el líder no tiene reuniones", async ({ page }) => {
  await page.goto("/#candidato-reuniones");
  await expect(page.getByRole("table")).toContainText("Encuentro comunitario en Albania");
  await expect(page.getByRole("table")).toContainText("Reunión de equipo en San Vicente del Caguán");
  await page.goto("/#coordinador-reuniones"); await page.reload();
  await expect(page.getByRole("table")).toContainText("Encuentro comunitario en Albania");
  await expect(page.getByRole("table")).not.toContainText("San Vicente del Caguán");
  await page.goto("/#lider-bandeja"); await page.reload();
  await expect(menu(page).getByRole("button", { name: "Mi gente" })).toHaveCount(0);
});

test("Hoy avisa de las actas por aprobar y lleva a Reuniones", async ({ page }) => {
  await page.goto("/#gerente-hoy");
  const pendiente = page.getByRole("region", { name: "Para hoy" }).getByText("Aprobar 1 acta de reunión");
  await expect(pendiente).toBeVisible();
  await page.getByRole("region", { name: "Para hoy" }).getByRole("button", { name: "Ver actas" }).click();
  await expect(page.getByRole("heading", { name: "Reuniones", exact: true })).toBeVisible();
  await irA(page, "Reuniones");
});

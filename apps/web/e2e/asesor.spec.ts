import { expect, test, type Page } from "@playwright/test";
import { irA } from "./ayudas";
import { lideres } from "../src/data";

async function abrirAsesor(page: Page, rol: RegExp) {
  await page.goto("/");
  await page.getByRole("button", { name: rol }).click();
  await irA(page, "Mapa y asesor");
  await page.getByRole("tab", { name: "Asesor IA" }).click();
}

test("Asesor IA responde con fuentes y propone tareas que se aprueban con un clic", async ({ page }) => {
  await abrirAsesor(page, /Gerente/);
  await page.getByRole("button", { name: "¿Dónde actúo esta semana?" }).click();

  const turno = page.getByLabel("Pregunta: ¿Dónde actúo esta semana?");
  await expect(turno.getByRole("list", { name: "Fuentes" })).toBeVisible();
  await expect(turno.getByRole("list", { name: "Fuentes" })).toContainText("Cifras por zona");
  const aprobar = turno.getByRole("button", { name: "Aprobar tarea" });
  await expect(aprobar.first()).toBeVisible();
  const antes = await aprobar.count();
  await aprobar.first().click();
  await expect(turno.getByText("Aprobada y asignada")).toBeVisible();
  await expect(turno.getByRole("button", { name: "Aprobar tarea" })).toHaveCount(antes - 1);
});

test("los líderes llegan como referencias y la pantalla muestra su nombre", async ({ page }) => {
  await abrirAsesor(page, /Gerente/);
  await page.getByRole("button", { name: "¿Qué líderes debo revisar?" }).click();
  const turno = page.getByLabel("Pregunta: ¿Qué líderes debo revisar?");
  await expect(turno.locator(".mensaje.ia").first()).not.toContainText("Revisando");
  const contenido = await turno.textContent();
  expect(contenido).not.toMatch(/\bL-\d{2,}\b/); // ninguna referencia sin traducir
  expect(lideres.some((l) => contenido!.includes(l.nombre))).toBe(true);
});

test("se puede escribir una pregunta propia", async ({ page }) => {
  await abrirAsesor(page, /Gerente/);
  await page.getByLabel("Pregunta para el Asesor IA").fill("¿Cómo vamos frente a la meta de votos?");
  await page.getByRole("button", { name: "Preguntar" }).click();
  const turno = page.getByLabel("Pregunta: ¿Cómo vamos frente a la meta de votos?");
  await expect(turno).toContainText("no una predicción");
});

test("la coordinadora pregunta con los datos de sus zonas", async ({ page }) => {
  await abrirAsesor(page, /Coordinador/);
  await page.getByRole("button", { name: "¿Qué líderes debo revisar?" }).click();
  const turno = page.getByLabel("Pregunta: ¿Qué líderes debo revisar?");
  await expect(turno.locator(".mensaje.ia").first()).not.toContainText("Revisando");
  const contenido = (await turno.textContent())!;
  const ajenos = lideres.filter((l) => !["z1", "z2", "z3"].includes(l.zonaId));
  for (const l of ajenos) expect(contenido).not.toContain(l.nombre);
});

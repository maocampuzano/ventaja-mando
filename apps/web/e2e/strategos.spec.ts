import { expect, test, type Page } from "@playwright/test";
import { lideres } from "../src/data";

async function abrirStrategos(page: Page, rol: RegExp, codigo?: string) {
  await page.goto("/");
  await page.getByRole("button", { name: rol }).click();
  if (codigo) {
    await page.getByLabel("Código").fill(codigo);
    await page.getByRole("button", { name: "Verificar" }).click();
  }
  await page.getByRole("tab", { name: "Strategos" }).click();
}

test("Strategos responde con fuentes y propone tareas que se aprueban con un clic", async ({ page }) => {
  await abrirStrategos(page, /Gerente/, "123456");
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
  await abrirStrategos(page, /Gerente/, "123456");
  await page.getByRole("button", { name: "¿Qué líderes debo revisar?" }).click();
  const turno = page.getByLabel("Pregunta: ¿Qué líderes debo revisar?");
  await expect(turno.locator(".mensaje.ia").first()).not.toContainText("Revisando");
  const contenido = await turno.textContent();
  expect(contenido).not.toMatch(/\bL-\d{2,}\b/); // ninguna referencia sin traducir
  expect(lideres.some((l) => contenido!.includes(l.nombre))).toBe(true);
});

test("se puede escribir una pregunta propia", async ({ page }) => {
  await abrirStrategos(page, /Gerente/, "123456");
  await page.getByLabel("Pregunta para Strategos").fill("¿Cómo vamos frente a la meta de votos?");
  await page.getByRole("button", { name: "Preguntar" }).click();
  const turno = page.getByLabel("Pregunta: ¿Cómo vamos frente a la meta de votos?");
  await expect(turno).toContainText("no una predicción");
});

test("la coordinadora pregunta con los datos de sus zonas", async ({ page }) => {
  await abrirStrategos(page, /Coordinador/);
  await page.getByRole("button", { name: "¿Qué líderes debo revisar?" }).click();
  const turno = page.getByLabel("Pregunta: ¿Qué líderes debo revisar?");
  await expect(turno.locator(".mensaje.ia").first()).not.toContainText("Revisando");
  const contenido = (await turno.textContent())!;
  const ajenos = lideres.filter((l) => !["z1", "z2", "z3"].includes(l.zonaId));
  for (const l of ajenos) expect(contenido).not.toContain(l.nombre);
});

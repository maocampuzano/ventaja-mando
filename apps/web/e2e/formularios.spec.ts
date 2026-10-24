import { expect, test } from "@playwright/test";

test("el constructor arma un formulario y bloquea preguntas por el voto", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Gerente/ }).click();
  await page.getByLabel("Código").fill("123456");
  await page.getByRole("button", { name: "Verificar" }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Formularios" }).click();
  await expect(page.getByText("Visita casa a casa (ejemplo)")).toBeVisible();

  await page.getByRole("button", { name: "Nuevo formulario" }).click();
  const editor = page.getByRole("region", { name: "Editor de formulario" });
  await editor.getByLabel("Nombre del formulario").fill("Jornada de salud (ficticia)");
  await editor.getByRole("button", { name: "Una opción" }).click();
  const p1 = editor.getByRole("group", { name: "Pregunta 1" });
  await p1.getByLabel("Pregunta", { exact: true }).fill("¿Por quién va a votar?");
  await p1.getByLabel(/Opciones/).fill("Candidata A\nCandidato B");

  // Regla 2: no se puede guardar.
  await expect(editor.getByRole("list", { name: "Errores del formulario" })).toContainText("regla 2");
  await expect(editor.getByRole("button", { name: "Guardar formulario" })).toBeDisabled();

  await p1.getByLabel("Pregunta", { exact: true }).fill("¿Qué servicio de salud usa?");
  await p1.getByLabel(/Opciones/).fill("EPS\nHospital público\nNinguno");
  await p1.getByLabel("Obligatoria").check();
  await editor.getByRole("button", { name: "Sí o no" }).click();
  await editor.getByRole("group", { name: "Pregunta 2" }).getByLabel("Pregunta", { exact: true }).fill("¿Asistiría a una jornada?");

  // La vista previa muestra las preguntas tal como las verá quien llena.
  const vista = page.getByRole("complementary", { name: "Vista previa" });
  await expect(vista).toContainText("Jornada de salud (ficticia)");
  await expect(vista.getByRole("combobox").first()).toContainText("Hospital público");

  await editor.getByRole("button", { name: "Guardar formulario" }).click();
  await expect(page.getByRole("status")).toHaveText("Formulario «Jornada de salud (ficticia)» guardado (versión 1).");

  // Editarlo sube la versión.
  await page.getByRole("region", { name: "Formularios de la campaña" }).getByRole("button", { name: "Editar" }).first().click();
  await editor.getByRole("button", { name: "Texto" }).click();
  await editor.getByRole("group", { name: "Pregunta 3" }).getByLabel("Pregunta", { exact: true }).fill("Comentario");
  await editor.getByRole("button", { name: "Guardar formulario" }).click();
  await expect(page.getByRole("status")).toHaveText("Formulario «Jornada de salud (ficticia)» guardado (versión 2).");
});

import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("solicitudes de titulares con plazo legal y exportación con marca", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Gerente/ }).click();
  await page.getByLabel("Código").fill("123456");
  await page.getByRole("button", { name: "Verificar" }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Datos" }).click();
  await expect(page.locator('[data-prueba="abiertas"]')).toHaveText("0");

  // Una persona ficticia pide que se supriman sus datos.
  const form = page.getByRole("form", { name: "Registrar solicitud" });
  await form.getByLabel("Qué pide el titular").selectOption("suprimir");
  await form.getByLabel(/Buscar a la persona/).fill("0009000002");
  await form.getByRole("button", { name: "Buscar" }).click();
  await form.getByRole("combobox", { name: "Persona", exact: true }).selectOption({ index: 1 });
  await form.getByLabel("Detalle").fill("Llegó por correo (ficticio)");
  await form.getByRole("button", { name: "Registrar" }).click();
  await expect(page.locator('[data-prueba="abiertas"]')).toHaveText("1");

  const solicitud = page.getByLabel("Solicitud: Suprimir sus datos");
  await expect(solicitud).toContainText("Luz Dary Julio Cabarcas");
  await expect(solicitud).toContainText("15 días hábiles");
  await expect(solicitud).toContainText("Ley 1581 de 2012, art. 15");

  page.once("dialog", (d) => d.accept());
  await solicitud.getByRole("button", { name: "Suprimir a la persona" }).click();
  await expect(page.getByRole("status")).toContainText("Persona suprimida");
  await solicitud.getByLabel("Respuesta al titular").fill("Datos suprimidos e informado por correo (ficticio)");
  await solicitud.getByRole("button", { name: "Marcar resuelta" }).click();
  await expect(page.locator('[data-prueba="abiertas"]')).toHaveText("0");

  // Exportación: archivo con marca, sin cédulas y sin la persona suprimida.
  const descarga = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  const archivo = await descarga;
  expect(archivo.suggestedFilename()).toMatch(/^ventaja-mando-exportacion-[0-9a-f]{8}\.csv$/);
  const csv = readFileSync((await archivo.path())!, "utf8");
  expect(csv).toContain("EXPORTACIÓN CONFIDENCIAL");
  expect(csv).toMatch(/Referencia [0-9a-f-]{36} · Exportado por Gerente Demo/);
  expect(csv).not.toMatch(/000900000\d/);
  expect(csv).not.toContain("Luz Dary Julio Cabarcas");
  expect(csv).toContain("Marca");
  const ref = /Referencia ([0-9a-f]{8})/.exec(csv)![1].toUpperCase();
  expect(csv.trim().split("\r\n").at(-1)).toMatch(new RegExp(`;${ref}$`));
  await expect(page.getByRole("status")).toContainText("Quedó registrada en la auditoría");
});

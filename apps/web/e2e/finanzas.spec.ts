import { expect, test, type Page } from "@playwright/test";

async function entrar(page: Page, correo: string) {
  await page.goto("/");
  await page.getByLabel("Correo").fill(correo);
  await page.getByLabel("Contraseña").fill("demo2027");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  if (correo.startsWith("gerente")) {
    await page.getByLabel("Código").fill("123456");
    await page.getByRole("button", { name: "Verificar" }).click();
  }
  await page.getByRole("navigation").getByRole("button", { name: "Finanzas" }).click();
}

test("un aporte de particular exige quién lo da, las verificaciones y respeta el 10 % del tope", async ({ page }) => {
  await entrar(page, "gerente@demo.co");
  await page.getByRole("button", { name: "Registrar movimiento" }).click();
  const caja = page.getByRole("region", { name: "Registrar movimiento" });
  await caja.getByLabel("Ingreso").check();
  await caja.getByLabel("Código del CNE").selectOption("102");
  await caja.getByLabel("Valor", { exact: true }).fill("50000000"); // tope demo: $ 450.000.000 → máximo $ 45.000.000 por aportante
  await caja.getByLabel("Concepto").fill("Donación (ficticia)");
  await caja.getByLabel("Nombre o razón social").fill("Aportante Ficticio");
  await caja.getByLabel("Cédula o NIT").fill("1047000001");
  await expect(caja.getByText(/Confirme las verificaciones de fuentes prohibidas/)).toBeVisible();
  for (const c of await caja.getByRole("group", { name: /Fuentes prohibidas/ }).getByRole("checkbox").all()) await c.check();
  await expect(caja.getByText(/máximo por aportante es el 10 % del tope \(\$ 45\.000\.000\)/)).toBeVisible();
  await expect(caja.getByRole("button", { name: "Registrar" })).toBeDisabled();

  await caja.getByLabel("Valor", { exact: true }).fill("10000000");
  await caja.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Movimiento registrado." })).toBeVisible();
  await expect(page.getByRole("table", { name: "Libro de ingresos y gastos" })).toContainText("Aportante Ficticio");
});

test("una persona jurídica necesita el acta", async ({ page }) => {
  await entrar(page, "gerente@demo.co");
  await page.getByRole("button", { name: "Registrar movimiento" }).click();
  const caja = page.getByRole("region", { name: "Registrar movimiento" });
  await caja.getByLabel("Ingreso").check();
  await caja.getByLabel("Código del CNE").selectOption("102");
  await caja.getByLabel("Valor", { exact: true }).fill("1000000");
  await caja.getByLabel("Tipo de persona").selectOption("juridica");
  await caja.getByLabel("Cédula o NIT").fill("900000099");
  for (const c of await caja.getByRole("group", { name: /Fuentes prohibidas/ }).getByRole("checkbox").all()) await c.check();
  await expect(caja.getByText(/necesita el número del acta/)).toBeVisible();
  await caja.getByLabel("Número del acta que aprobó el aporte").fill("Acta 3 de 2027");
  await expect(caja.getByText(/necesita el número del acta/)).toHaveCount(0);
});

test("el tope muestra el avance y la exportación para el contador sale en Excel", async ({ page }) => {
  await entrar(page, "gerente@demo.co");
  await expect(page.getByText("Tope de gastos del CNE")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Resumen por código" })).toContainText("208 Propaganda electoral");
  const descarga = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar para el contador" }).click();
  const archivo = await descarga;
  expect(archivo.suggestedFilename()).toBe("cuentas-claras-DEMO.xlsx");
  await expect(page.getByRole("status").filter({ hasText: "queda registrada en la auditoría" })).toBeVisible();
});

test("la candidata ve las finanzas pero no registra; la coordinación no las ve", async ({ page }) => {
  await entrar(page, "candidata@demo.co");
  await expect(page.getByRole("table", { name: "Libro de ingresos y gastos" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar movimiento" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Anular" })).toHaveCount(0);
  await page.getByRole("button", { name: "Salir" }).click();
  await page.getByLabel("Correo").fill("coordinadora@demo.co");
  await page.getByLabel("Contraseña").fill("demo2027");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("navigation").getByRole("button", { name: "Finanzas" })).toHaveCount(0);
});

test("la propaganda pide el medio y cualquiera con acceso baja la plantilla vacía", async ({ page }) => {
  await entrar(page, "candidata@demo.co");
  const descarga = page.waitForEvent("download");
  await page.getByRole("button", { name: "Plantilla vacía" }).click();
  expect((await descarga).suggestedFilename()).toBe("plantilla-cuentas-claras.xlsx");
  await page.getByRole("button", { name: "Salir" }).click();

  await page.getByLabel("Correo").fill("gerente@demo.co");
  await page.getByLabel("Contraseña").fill("demo2027");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByLabel("Código").fill("123456");
  await page.getByRole("button", { name: "Verificar" }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Finanzas" }).click();
  await page.getByRole("button", { name: "Registrar movimiento" }).click();
  const caja = page.getByRole("region", { name: "Registrar movimiento" });
  await caja.getByLabel("Código del CNE").selectOption("208");
  await caja.getByLabel("Valor", { exact: true }).fill("800000");
  await expect(caja.getByRole("button", { name: "Registrar" })).toBeDisabled();
  await caja.getByLabel("Medio de la propaganda").selectOption("radio");
  await caja.getByLabel("Factura o recibo No. (opcional)").fill("FE-77");
  await caja.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Movimiento registrado." })).toBeVisible();
});

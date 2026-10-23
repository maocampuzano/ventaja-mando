import { expect, test } from "@playwright/test";
import writeExcelFile from "write-excel-file/node";

// Excel FICTICIO de 5.000 filas: 49 sin autorización y 100 con la cédula de otra fila.
async function crearExcel(ruta: string) {
  const nombres = ["María", "José", "Luz", "Carlos", "Ana", "Andrés", "Leidy", "Jorge", "Katerine", "Wilson"];
  const apellidos = ["Peña", "Ortiz", "Gómez", "Díaz", "Ruiz", "Julio", "Herrera", "Tapia", "Puello", "Castro"];
  const zonas = ["Centro", "La Ceiba", "Villa Rosa"];
  const filas: (string | number | Date)[][] = [["Nombre completo", "Cédula", "Celular", "Barrio", "Autoriza datos", "Fecha de autorización"]];
  for (let i = 0; i < 5000; i++) {
    const cedula = i < 4900 ? 9000000 + i : 9000000 + (i - 4900) * 2 + 1;
    filas.push([
      `${nombres[i % 10]} ${apellidos[(i * 7) % 10]} ${apellidos[(i * 3) % 10]}`,
      cedula, `300${String(1000000 + i).slice(-7)}`, zonas[i % 3],
      i < 4900 && i % 100 === 50 ? "No" : "Sí", new Date(Date.UTC(2026, 2, 5)),
    ]);
  }
  await writeExcelFile(filas, { dateFormat: "dd/mm/yyyy" }).toFile(ruta);
}

test("un Excel de 5.000 filas termina con su reporte de duplicados", async ({ page }, info) => {
  test.setTimeout(90_000);
  const ruta = info.outputPath("base-ficticia.xlsx");
  await crearExcel(ruta);

  await page.goto("/");
  await page.getByLabel("Correo").fill("gerente@demo.co");
  await page.getByLabel("Contraseña").fill("demo2027");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByLabel("Código").fill("123456");
  await page.getByRole("button", { name: "Verificar" }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Importar" }).click();

  await page.getByLabel("Archivo para importar").setInputFiles(ruta);
  await expect(page.getByText("5.000 filas")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-prueba="listas"]')).toHaveText("4.851");
  await expect(page.locator('[data-prueba="rechazadas"]')).toHaveText("149");
  await expect(page.locator('[data-prueba="duplicados"]')).toHaveText("100");

  await page.getByText(/Por qué son duplicados/).click();
  await expect(page.getByText(/Fila 4902 con la fila 3: mismo documento/)).toBeVisible();
  await page.getByText(/Filas que no entran/).click();
  await expect(page.getByText(/sin autorización de datos/).first()).toBeVisible();

  const importar = page.getByRole("button", { name: "Importar 4.851 personas" });
  await expect(importar).toBeDisabled();
  await page.getByLabel("Dónde está la prueba de la autorización").fill("Planillas firmadas (ficticias), sede de la campaña");
  await importar.click();
  await expect(page.getByRole("heading", { name: "Simulación terminada" })).toBeVisible();
  await expect(page.getByText("Modo demostración: no se guardó nada.")).toBeVisible();
});

test("sin columna de autorización no se puede importar", async ({ page }) => {
  // Carpeta temporal propia: la de la prueba lleva tildes (sale del título) y el selector de archivos no la toma.
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const ruta = `${mkdtempSync(`${tmpdir()}/vm-`)}/sin-autorizacion.csv`;
  writeFileSync(ruta, "Nombre;Celular;Barrio\nAna Ficticia;3000000001;Centro\n");
  await page.goto("/");
  await page.getByRole("button", { name: /Coordinador/ }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Importar" }).click();
  await page.getByLabel("Archivo para importar").setInputFiles(ruta);
  await expect(page.getByRole("alert")).toContainText("Falta indicar: Autoriza datos");
});

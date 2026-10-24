import { expect, test } from "@playwright/test";

test("con una clave de mapas que falla, el Mando vuelve al mapa SVG", async ({ page }) => {
  const cargados: string[] = [];
  page.on("response", (r) => { if (r.url().includes("/vendor/maplibre-")) cargados.push(`${r.status()} ${r.url().split("/").pop()}`); });
  const avisos: string[] = [];
  page.on("console", (m) => { if (m.type() === "warning") avisos.push(m.text()); });

  await page.goto("http://localhost:5175/");
  await page.getByRole("button", { name: /Coordinador/ }).click();

  // MapLibre se pidió desde la carpeta vendor y, al fallar la clave, aparece el mapa SVG con las 3 zonas.
  await expect(page.locator("polygon.zona")).toHaveCount(3, { timeout: 20_000 });
  expect(cargados).toContain("200 maplibre-gl.mjs");
  expect(avisos.join(" ")).toContain("se usa el mapa SVG");
});

test("sin clave de mapas no se descarga MapLibre", async ({ page }) => {
  const pedidos: string[] = [];
  page.on("request", (r) => { if (r.url().includes("maplibre")) pedidos.push(r.url()); });
  await page.goto("/");
  await page.getByRole("button", { name: /Coordinador/ }).click();
  await expect(page.locator("polygon.zona")).toHaveCount(3);
  expect(pedidos).toEqual([]);
});

test("con una clave válida se dibuja el mapa de MapLibre con las zonas", async ({ page }) => {
  // Responde como MapTiler, con un estilo mínimo: así se prueba el mapa real sin red ni clave.
  await page.route("https://api.maptiler.com/**", (r) => r.request().url().includes("style.json")
    ? r.fulfill({ json: { version: 8, sources: {}, glyphs: "https://api.maptiler.com/fonts/{fontstack}/{range}.pbf",
        layers: [{ id: "fondo", type: "background", paint: { "background-color": "#10161f" } }] } })
    : r.fulfill({ status: 404 }));
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));

  await page.goto("http://localhost:5175/");
  await page.getByRole("button", { name: /Coordinador/ }).click();
  const mapa = page.locator('[data-mapa="maplibre"]');
  await expect(mapa.locator("canvas")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await expect(mapa).toBeVisible(); // no volvió al SVG
  await expect(page.locator("polygon.zona")).toHaveCount(0);
  await page.getByRole("button", { name: "Cobertura de testigos" }).click();
  await page.waitForTimeout(500);
  await expect(mapa).toBeVisible();
  expect(errores).toEqual([]);
});

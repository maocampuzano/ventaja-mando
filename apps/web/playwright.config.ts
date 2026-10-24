import { defineConfig, devices } from "@playwright/test";

// Pruebas de los flujos críticos del panel, siempre en modo demo (datos ficticios, sin red).
// CHROMIUM_PATH permite usar un Chromium ya instalado (por ejemplo, /opt/pw-browsers/chromium en el entorno de nube).
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:5174",
    locale: "es-CO",
    timezoneId: "America/Bogota",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    { command: "npx vite --port 5174 --strictPort", url: "http://localhost:5174", reuseExistingServer: !process.env.CI, env: { MODO_DATOS: "demo", MAPTILER_KEY: "" } },
    // Con una clave de mapas falsa: MapLibre se carga, la clave falla y el panel debe volver al mapa SVG.
    { command: "npx vite --port 5175 --strictPort", url: "http://localhost:5175", reuseExistingServer: !process.env.CI, env: { MODO_DATOS: "demo", MAPTILER_KEY: "clave-falsa-de-prueba" } },
  ],
});

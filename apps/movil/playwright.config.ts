import { defineConfig, devices } from "@playwright/test";

// La app en su vista web, en modo demo (datos ficticios, sin red). En el teléfono se usa SQLite; aquí, memoria.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:5180",
    locale: "es-CO",
    timezoneId: "America/Bogota",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: "telefono", use: { ...devices["Pixel 7"], browserName: "chromium" } }],
  webServer: {
    command: "npx expo export --platform web --output-dir dist && node e2e/servir.mjs",
    url: "http://localhost:5180",
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: { CI: "1", MODO_DATOS: "demo" },
  },
});

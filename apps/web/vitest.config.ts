import { defineConfig } from "vitest/config";

// Pruebas unitarias del panel (las de navegador están en e2e/ y corren con Playwright).
export default defineConfig({ test: { include: ["src/**/*.test.ts"], environment: "node" } });

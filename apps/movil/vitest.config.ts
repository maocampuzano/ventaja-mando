import { defineConfig } from "vitest/config";

// Solo la lógica sin React Native (almacén SQLite, armado de rutas, datos demo). Las pantallas se prueban en web.
export default defineConfig({ test: { include: ["src/**/*.test.ts"], environment: "node" } });

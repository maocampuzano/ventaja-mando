import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build` deja todo (JS y CSS) dentro de dist/index.html, listo para publicar como una sola página.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
});

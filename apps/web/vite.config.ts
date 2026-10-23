import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build` deja todo (JS y CSS) dentro de dist/index.html, listo para publicar como una sola página.
// Solo estas tres variables llegan al navegador. La clave secreta de Supabase nunca se incluye.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, "../..", ""), ...process.env };
  const supabase = env.MODO_DATOS === "supabase"; // en modo demo no se incluye nada del proyecto real
  const url = supabase ? (env.SUPABASE_URL ?? "").replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/$/, "") : "";
  return {
    plugins: [react(), viteSingleFile()],
    define: {
      "import.meta.env.VITE_MODO_DATOS": JSON.stringify(supabase ? "supabase" : "demo"),
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(url),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabase ? env.SUPABASE_PUBLISHABLE_KEY ?? "" : ""),
    },
  };
});

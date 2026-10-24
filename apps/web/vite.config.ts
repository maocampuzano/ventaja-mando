import { createReadStream, copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// MapLibre 6 carga su worker como un archivo aparte, que no cabe en una página de un solo archivo. Se sirve al lado,
// en una carpeta con su versión, y la página lo importa solo cuando hay clave de mapas (ver src/MapaReal.tsx).
const require = createRequire(import.meta.url);
const maplibre = require("maplibre-gl/package.json") as { version: string };
const DIR_MAPLIBRE = join(dirname(require.resolve("maplibre-gl/package.json")), "dist");
const ARCHIVOS_MAPLIBRE = ["maplibre-gl.mjs", "maplibre-gl-worker.mjs", "maplibre-gl.css"];
export const RUTA_MAPLIBRE = `vendor/maplibre-${maplibre.version}`;

function maplibreAparte(): Plugin {
  return {
    name: "maplibre-aparte",
    configureServer(server) {
      server.middlewares.use(`/${RUTA_MAPLIBRE}/`, (req, res, next) => {
        const archivo = (req.url ?? "").split("?")[0].replace(/^\//, "");
        if (!ARCHIVOS_MAPLIBRE.includes(archivo)) return next();
        res.setHeader("Content-Type", archivo.endsWith(".css") ? "text/css" : "text/javascript");
        createReadStream(join(DIR_MAPLIBRE, archivo)).pipe(res);
      });
    },
    writeBundle(opciones) {
      const destino = join(opciones.dir ?? "dist", RUTA_MAPLIBRE);
      mkdirSync(destino, { recursive: true });
      for (const a of ARCHIVOS_MAPLIBRE) copyFileSync(join(DIR_MAPLIBRE, a), join(destino, a));
    },
  };
}

// `npm run build` deja la aplicación (JS y CSS) dentro de dist/index.html, más MapLibre aparte en dist/vendor/.
// Solo estas variables llegan al navegador. La clave secreta de Supabase nunca se incluye. La de MapTiler es pública
// por diseño: se protege restringiéndola a los dominios del panel en la cuenta de MapTiler.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, "../..", ""), ...process.env };
  const supabase = env.MODO_DATOS === "supabase"; // en modo demo no se incluye nada del proyecto real
  const url = supabase ? (env.SUPABASE_URL ?? "").replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/$/, "") : "";
  return {
    plugins: [react(), viteSingleFile(), maplibreAparte()],
    define: {
      "import.meta.env.VITE_MODO_DATOS": JSON.stringify(supabase ? "supabase" : "demo"),
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(url),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabase ? env.SUPABASE_PUBLISHABLE_KEY ?? "" : ""),
      "import.meta.env.VITE_MAPTILER_KEY": JSON.stringify(env.MAPTILER_KEY ?? ""),
      "import.meta.env.VITE_RUTA_MAPLIBRE": JSON.stringify(RUTA_MAPLIBRE),
    },
  };
});

import { createHash } from "node:crypto";
import { createReadStream, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

// Política de seguridad de contenido (CSP). La página es un solo archivo con el código en línea: en vez de permitir
// cualquier script en línea, se permite solo este, por su huella SHA-256, que se calcula al compilar y se escribe en
// dist/_headers (Cloudflare Pages). Si alguien lograra inyectar un script, el navegador no lo ejecuta.
function politicaDeContenido(supabaseUrl: string): Plugin {
  return {
    name: "politica-de-contenido",
    apply: "build",
    enforce: "post",
    writeBundle(opciones) {
      const dir = opciones.dir ?? "dist";
      const html = readFileSync(join(dir, "index.html"), "utf8");
      const huellas = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
        .filter((m) => m[1].trim())
        .map((m) => `'sha256-${createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
      const supa = supabaseUrl ? `${supabaseUrl} ${supabaseUrl.replace(/^https:/, "wss:")}` : "";
      const csp = [
        "default-src 'self'",
        `script-src 'self' ${huellas.join(" ")}`,
        "worker-src 'self' blob:",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        `img-src 'self' data: blob: https://api.maptiler.com ${supabaseUrl}`.trim(),
        `connect-src 'self' https://api.maptiler.com ${supa}`.trim(),
        "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
      ].join("; ");
      const archivo = join(dir, "_headers");
      if (!existsSync(archivo)) return;
      const cabeceras = readFileSync(archivo, "utf8");
      writeFileSync(archivo, cabeceras.replace("  Referrer-Policy: no-referrer", `  Content-Security-Policy: ${csp}\n  Referrer-Policy: no-referrer`));
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
    plugins: [react(), viteSingleFile(), maplibreAparte(), politicaDeContenido(url)],
    define: {
      "import.meta.env.VITE_MODO_DATOS": JSON.stringify(supabase ? "supabase" : "demo"),
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(url),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabase ? env.SUPABASE_PUBLISHABLE_KEY ?? "" : ""),
      "import.meta.env.VITE_MAPTILER_KEY": JSON.stringify(env.MAPTILER_KEY ?? ""),
      "import.meta.env.VITE_RUTA_MAPLIBRE": JSON.stringify(RUTA_MAPLIBRE),
      // La web del líder y del testigo (apps/movil exportada para el navegador).
      "import.meta.env.VITE_URL_APP_LIDER": JSON.stringify(env.URL_APP_LIDER || "https://app.ventaja-mando-prueba.pages.dev"),
    },
  };
});

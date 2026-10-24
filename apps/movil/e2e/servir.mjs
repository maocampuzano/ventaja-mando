// Sirve la vista web exportada (dist/) para las pruebas. Solo para pruebas locales y de CI.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";

const raiz = new URL("../dist/", import.meta.url).pathname;
const tipos = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".ttf": "font/ttf" };
createServer((req, res) => {
  let f = join(raiz, decodeURIComponent((req.url ?? "/").split("?")[0]));
  if (!f.startsWith(raiz) || !existsSync(f) || statSync(f).isDirectory()) f = join(raiz, "index.html");
  res.setHeader("Content-Type", tipos[extname(f)] ?? "application/octet-stream");
  createReadStream(f).pipe(res);
}).listen(Number(process.env.PUERTO ?? 5180));

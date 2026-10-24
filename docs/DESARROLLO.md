# Cómo correr Ventaja Mando en local

## Requisitos

- Node.js 22 o superior (la integración continua usa Node 22) y npm 10 o superior.
- Git.

Por ahora no hace falta ninguna clave: el prototipo funciona con datos ficticios y sin backend. Las claves que se irán necesitando están en `.env.example`. Para usarlas en local, copie ese archivo como `.env` y llénelo; `.env` nunca se sube al repositorio.

## Estructura

```
apps/web          Panel web (hoy, el prototipo navegable). React + TypeScript + Vite.
apps/movil        App del líder y del testigo. Expo (React Native) con SQLite y cola de sincronización.
packages/nucleo   Tipos y lógica compartida (@ventaja/nucleo), con sus pruebas en Vitest.
supabase/         Migraciones, semilla ficticia y pruebas de RLS (ver supabase/LEEME.md).
docs/             Diseño, análisis de mercado, este documento y el estado de las fases.
```

Es un monorepo con *npm workspaces*: un solo `npm install` en la raíz instala todo, y `@ventaja/nucleo` queda enlazado para que la web (y luego la app) lo importen directamente desde su código fuente, sin compilarlo aparte.

## Comandos

Todos se corren desde la raíz del repositorio.

| Comando | Qué hace |
|---|---|
| `npm install` | Instala las dependencias de todos los paquetes. En la integración continua se usa `npm ci`. |
| `npm run dev -w apps/web` | Abre el prototipo en http://localhost:5173 (también sirve `npm run dev`). |
| `npm run build -w apps/web` | Genera `apps/web/dist/index.html`, un solo archivo con todo adentro. |
| `npm run typecheck` | Verifica los tipos de todos los paquetes. |
| `npm run lint` | Revisa el código con ESLint. |
| `npm test` | Corre las pruebas de Vitest y las del script de carga de territorios. |
| `npm run test:e2e -w apps/web` | Pruebas de Playwright del panel en modo demo: inicio de sesión por rol, 2FA y alcance por territorio. En el entorno de nube: `CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e -w apps/web`. |
| `npm run start -w apps/movil` | Abre la app del celular con Expo (ver `apps/movil/LEEME.md`). |
| `npm run test:e2e -w apps/movil` | Exporta la app en su vista web y prueba los flujos del líder y del testigo en modo demo, incluido el registro sin señal. En el entorno de nube: `CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e -w apps/movil`. |
| `npm run test:db` | Crea una base desde cero, aplica migraciones y semilla, y corre las pruebas de RLS (necesita PostgreSQL 16 con PostGIS y pgTAP; ver `supabase/LEEME.md`). |
| `node supabase/scripts/aplicar-remoto.mjs verificar` | Revisa el proyecto real de Supabase: migraciones, RLS, Vault y territorios cargados (necesita `SUPABASE_ACCESS_TOKEN`; ver `supabase/LEEME.md`). |
| `npm run test -w packages/nucleo -- --watch` | Pruebas de `nucleo` en modo observación, mientras se programa. |

Antes de abrir un PR deben pasar `typecheck`, `lint`, `test` y `test:db`. La integración continua (`.github/workflows/ci.yml`) los corre en cada PR, junto con la compilación de la web.

## Modo demo y modo Supabase

El panel tiene dos fuentes de datos con la misma interfaz (`apps/web/src/datos/`):

- **demo** (por defecto): la semilla ficticia de Turbaco, en el navegador. La pantalla de entrada muestra los usuarios de prueba (contraseña `demo2027`; el código de dos pasos del gerente es `123456`). Recorta los datos con la misma regla de alcance que la base (`packages/nucleo/src/alcance.ts`), pero no es seguridad: todo está en el navegador.
- **supabase**: el proyecto real. Se enciende con `MODO_DATOS=supabase` más `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. Inicia sesión con Supabase Auth, pide el código de dos pasos a administradores y gerentes, y lee el tablero con las funciones `tablero_zonas` y `tablero_lideres`, que solo devuelven agregados y aplican el alcance de cada rol en la base.

En la página compilada en modo demo no queda nada del proyecto real; en modo supabase queda la URL y la clave publicable (que es pública por diseño), nunca la secreta.

## Publicar la versión de prueba

`bash scripts/publicar-prueba.sh` publica dos versiones del panel en Cloudflare Pages:

- `https://ventaja-mando-prueba.pages.dev`: conectada al proyecto de **prueba** de Supabase.
- `https://demo.ventaja-mando-prueba.pages.dev`: modo demo, con la semilla ficticia.

Además guarda en Supabase la dirección del sitio, a la que vuelven los enlaces de confirmación de correo. Necesita `CLOUDFLARE_API_TOKEN` (permiso «Cloudflare Pages: Edit») y `CLOUDFLARE_ACCOUNT_ID`. En el entorno de nube, `api.cloudflare.com` debe estar en los dominios permitidos. Las cabeceras de seguridad están en `apps/web/public/_headers`: sin referer (los enlaces de invitación llevan un código) y sin indexación en buscadores. Esto **no** es producción: producción es la fase 9 y requiere V3 y V6.

## Mapa

Con `MAPTILER_KEY`, el Mando usa MapLibre con teselas de MapTiler (estilo `dataviz-dark`). Sin clave, o si la clave falla o el navegador no tiene WebGL, vuelve solo al mapa SVG del prototipo, que no depende de nada externo. MapLibre no cabe en la página de un solo archivo (su *worker* es un archivo aparte): `vite.config.ts` lo copia a `dist/vendor/maplibre-<versión>/` y la página lo carga solo cuando hay clave. La clave es pública por diseño; se protege en la cuenta de MapTiler restringiéndola a `ventaja-mando-prueba.pages.dev`, `*.ventaja-mando-prueba.pages.dev` y `localhost`.

## Dónde va cada cosa

- **Lógica de negocio sin interfaz** (índices, recomendaciones, duplicados, formatos): en `packages/nucleo/src`, con un archivo de pruebas `*.test.ts` al lado. No use APIs del navegador ni de Node en `nucleo`: lo comparten la web, la app y las funciones del servidor.
- **Formatos de Colombia:** use `miles`, `pct`, `moneda` y `fecha` de `@ventaja/nucleo` en vez de formatear a mano.
- **Datos de prueba:** siempre ficticios. La semilla del prototipo está en `apps/web/src/data.ts`.

## Entorno de nube (claude.ai/code)

El script de preparación del entorno es `scripts/preparar-entorno.sh`: si encuentra un `package.json` en la raíz, corre `npm ci`. No hay que cambiarlo después de la fase 0.

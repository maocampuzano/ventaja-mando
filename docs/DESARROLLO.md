# Cómo correr Ventaja Mando en local

## Requisitos

- Node.js 22 o superior (la integración continua usa Node 22) y npm 10 o superior.
- Git.

Por ahora no hace falta ninguna clave: el prototipo funciona con datos ficticios y sin backend. Las claves que se irán necesitando están en `.env.example`. Para usarlas en local, copie ese archivo como `.env` y llénelo; `.env` nunca se sube al repositorio.

## Estructura

```
apps/web          Panel web (hoy, el prototipo navegable). React + TypeScript + Vite.
apps/movil        App del líder y del testigo en Expo. Vacía hasta la fase 3.
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
| `npm run test:db` | Crea una base desde cero, aplica migraciones y semilla, y corre las pruebas de RLS (necesita PostgreSQL 16 con PostGIS y pgTAP; ver `supabase/LEEME.md`). |
| `node supabase/scripts/aplicar-remoto.mjs verificar` | Revisa el proyecto real de Supabase: migraciones, RLS, Vault y territorios cargados (necesita `SUPABASE_ACCESS_TOKEN`; ver `supabase/LEEME.md`). |
| `npm run test -w packages/nucleo -- --watch` | Pruebas de `nucleo` en modo observación, mientras se programa. |

Antes de abrir un PR deben pasar `typecheck`, `lint`, `test` y `test:db`. La integración continua (`.github/workflows/ci.yml`) los corre en cada PR, junto con la compilación de la web.

## Modo demo y modo Supabase

El panel tiene dos fuentes de datos con la misma interfaz (`apps/web/src/datos/`):

- **demo** (por defecto): la semilla ficticia de Turbaco, en el navegador. La pantalla de entrada muestra los usuarios de prueba (contraseña `demo2027`; el código de dos pasos del gerente es `123456`). Recorta los datos con la misma regla de alcance que la base (`packages/nucleo/src/alcance.ts`), pero no es seguridad: todo está en el navegador.
- **supabase**: el proyecto real. Se enciende con `MODO_DATOS=supabase` más `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. Inicia sesión con Supabase Auth, pide el código de dos pasos a administradores y gerentes, y lee el tablero con las funciones `tablero_zonas` y `tablero_lideres`, que solo devuelven agregados y aplican el alcance de cada rol en la base.

En la página compilada en modo demo no queda nada del proyecto real; en modo supabase queda la URL y la clave publicable (que es pública por diseño), nunca la secreta.

## Dónde va cada cosa

- **Lógica de negocio sin interfaz** (índices, recomendaciones, duplicados, formatos): en `packages/nucleo/src`, con un archivo de pruebas `*.test.ts` al lado. No use APIs del navegador ni de Node en `nucleo`: lo comparten la web, la app y las funciones del servidor.
- **Formatos de Colombia:** use `miles`, `pct`, `moneda` y `fecha` de `@ventaja/nucleo` en vez de formatear a mano.
- **Datos de prueba:** siempre ficticios. La semilla del prototipo está en `apps/web/src/data.ts`.

## Entorno de nube (claude.ai/code)

El script de preparación del entorno es `scripts/preparar-entorno.sh`: si encuentra un `package.json` en la raíz, corre `npm ci`. No hay que cambiarlo después de la fase 0.

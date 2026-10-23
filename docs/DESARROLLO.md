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
| `npm run test:db` | Crea una base desde cero, aplica migraciones y semilla, y corre las pruebas de RLS (necesita PostgreSQL 16 con PostGIS y pgTAP; ver `supabase/LEEME.md`). |
| `node supabase/scripts/aplicar-remoto.mjs verificar` | Revisa el proyecto real de Supabase: migraciones, RLS, Vault y territorios cargados (necesita `SUPABASE_ACCESS_TOKEN`; ver `supabase/LEEME.md`). |
| `npm run test -w packages/nucleo -- --watch` | Pruebas de `nucleo` en modo observación, mientras se programa. |

Antes de abrir un PR deben pasar `typecheck`, `lint`, `test` y `test:db`. La integración continua (`.github/workflows/ci.yml`) los corre en cada PR, junto con la compilación de la web.

## Dónde va cada cosa

- **Lógica de negocio sin interfaz** (índices, recomendaciones, duplicados, formatos): en `packages/nucleo/src`, con un archivo de pruebas `*.test.ts` al lado. No use APIs del navegador ni de Node en `nucleo`: lo comparten la web, la app y las funciones del servidor.
- **Formatos de Colombia:** use `miles`, `pct`, `moneda` y `fecha` de `@ventaja/nucleo` en vez de formatear a mano.
- **Datos de prueba:** siempre ficticios. La semilla del prototipo está en `apps/web/src/data.ts`.

## Entorno de nube (claude.ai/code)

El script de preparación del entorno es `scripts/preparar-entorno.sh`: si encuentra un `package.json` en la raíz, corre `npm ci`. No hay que cambiarlo después de la fase 0.

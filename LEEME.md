# Ventaja Mando: paquete para construir en la nube

Este paquete tiene todo lo necesario para que Claude construya el producto en sesiones de nube (claude.ai/code), fase por fase:

| Archivo | Qué es |
|---|---|
| `CLAUDE.md` | Reglas del proyecto. Claude lo lee solo al empezar cada sesión. |
| `PLAN-DE-TRABAJO.md` | Las 9 fases (0 a 8), con entregables, criterios de aceptación y lo que usted debe aportar en cada una. |
| `PROMPT-NUBE.md` | Los textos para pegar al abrir cada sesión. |
| `docs/02-diseno-producto.md` | Diseño de producto, arquitectura, modelo de datos y lógica. |
| `docs/01-analisis-mercado.md` | Análisis de VOTOMAP y la competencia (contexto). |
| `docs/captura-*.jpg/png` | Capturas del prototipo. |
| `prototipo/` | Prototipo navegable (React + Vite + TS, datos ficticios de Turbaco). |
| `.claude/skills/` | Skills que Claude usa en la nube (se cargan solas, no hay que instalarlas). |
| `.env.example` | Las claves que se irán necesitando. |
| `scripts/` | Subir a GitHub y preparar el entorno de nube. |

## Skills incluidas

Vienen dentro de `.claude/skills/`, así que cualquier sesión que abra este repositorio ya las tiene:

| Skill | Para qué |
|---|---|
| `cumplimiento-electoral` | **Propia del proyecto.** Lista de revisión de Ley 1581, WhatsApp y riesgo penal antes de cada PR. |
| `frontend-design` | Dirección visual de pantallas nuevas. |
| `ui-ux-pro-max` | Patrones de interfaz, accesibilidad y componentes. |
| `emil-design-eng` | Pulido de detalle de la interfaz. |
| `animate` | Movimiento en la web. |
| `mobile-native` y `animate-expo` | App móvil en Expo y gestos. |
| `break-ui` | Probar cada pantalla con datos extremos. |

La skill `claude-api`, para integrar Strategos con la API de Claude, viene incluida en Claude Code y no hay que agregarla. Las skills de terceros son de uso personal: **mantenga el repositorio privado**.

## Paso a paso

### 1. Subir el paquete a GitHub (una vez, desde este Mac)

Descomprima el zip y, desde una terminal dentro de la carpeta `ventaja-mando`:

```bash
bash scripts/subir-a-github.sh
```

Crea el repositorio **privado** `ventaja-mando` en su cuenta de GitHub (maocampuzano) y lo sube.

### 2. Conectar el repositorio en su otra cuenta de Claude

1. Entre a **claude.ai/code** con la cuenta que tiene el saldo.
2. Conecte GitHub cuando se lo pida. Si esa cuenta de Claude usa otro usuario de GitHub, invítelo primero como colaborador del repositorio: GitHub → `ventaja-mando` → Settings → Collaborators.
3. Cree un **entorno** para el repositorio:
   - **Setup script:** el contenido de `scripts/preparar-entorno.sh`.
   - **Variables de entorno:** las de `.env.example` que ya tenga. Para la fase 0 no hace falta ninguna; para la fase 1 necesita las de Supabase.
   - **Acceso a la red:** que permita npm y GitHub. Desde la fase 1, también su proyecto de Supabase.

### 3. Lanzar la fase 0

Abra una sesión nueva con el repositorio y el entorno, y pegue el **prompt de arranque** de `PROMPT-NUBE.md`. Al terminar, la sesión deja un PR para que lo revise.

### 4. Revisar, fusionar y seguir

- Revise el PR. Si quiere una segunda opinión, use el prompt «Para revisar un PR» de `PROMPT-NUBE.md` en otra sesión.
- Fusione el PR y lance la fase siguiente con el prompt general.
- Las fases 2 y 3 se pueden lanzar en dos sesiones a la vez.

## Lo que usted debe preparar (en orden)

1. **Ya mismo:** pedir acceso a la API de Meta (app con `ads_read`) y el *developer token* de Google Ads. Tardan semanas en aprobarse.
2. **Antes de la fase 1:** proyecto en Supabase (región São Paulo), con sus tres claves en el entorno.
3. **Antes de la fase 2:** clave de MapTiler o Stadia.
4. **Antes de la fase 4:** clave de la API de Anthropic.
5. **Antes de publicar la app:** Apple Developer (99 USD/año) y Google Play (25 USD).
6. **Antes de datos reales:** abogado de datos personales y dominio propio.

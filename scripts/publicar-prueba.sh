#!/usr/bin/env bash
# Publica el panel en el entorno de PRUEBA (Cloudflare Pages), con datos ficticios o del proyecto de prueba:
#   https://<proyecto>.pages.dev       → modo supabase (el proyecto de prueba de Supabase)
#   https://demo.<proyecto>.pages.dev  → modo demo (semilla ficticia, sin servidor)
# Necesita CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID (ver docs/DESARROLLO.md, «Publicar la versión de prueba»),
# más las variables de Supabase. En el entorno de nube, api.cloudflare.com debe estar en los dominios permitidos.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CLOUDFLARE_API_TOKEN:?Falta CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?Falta CLOUDFLARE_ACCOUNT_ID}"
PROYECTO="${PROYECTO_PAGES:-ventaja-mando-prueba}"
WRANGLER="npx --yes wrangler@4.152.0"
export WRANGLER_SEND_METRICS=false NODE_USE_ENV_PROXY=1 NODE_NO_WARNINGS=1

echo "→ Proyecto de Cloudflare Pages: $PROYECTO"
$WRANGLER pages project list 2>/dev/null | grep -q " $PROYECTO " \
  || $WRANGLER pages project create "$PROYECTO" --production-branch main --force
# --force: crea un proyecto clásico de Pages. Sin él, wrangler 4 intenta pasarlo a Workers y falla en un monorepo.

echo "→ Panel conectado al proyecto de prueba de Supabase"
MODO_DATOS=supabase npm run build -w apps/web >/dev/null
$WRANGLER pages deploy apps/web/dist --project-name "$PROYECTO" --branch main --commit-dirty=true

echo "→ Panel de demostración (datos ficticios)"
MODO_DATOS=demo npm run build -w apps/web >/dev/null
$WRANGLER pages deploy apps/web/dist --project-name "$PROYECTO" --branch demo --commit-dirty=true

echo "→ Supabase: dirección del sitio para los correos de confirmación"
node supabase/scripts/aplicar-remoto.mjs url-sitio "https://$PROYECTO.pages.dev"
echo "Listo: https://$PROYECTO.pages.dev y https://demo.$PROYECTO.pages.dev"

#!/usr/bin/env bash
# Publica las funciones de IA («asesor» y «lectura») en el proyecto de Supabase y les carga la clave de Anthropic.
# Uso, desde la raíz del repositorio: bash supabase/scripts/activar-ia.sh
#
# Lee SUPABASE_URL, SUPABASE_ACCESS_TOKEN, ANTHROPIC_API_KEY, MODELO_ASESOR y MODELO_LECTURA del archivo .env. La clave nunca se
# imprime ni queda en otro archivo: se pasa a Supabase con un archivo temporal que se borra al terminar.
# Sin ANTHROPIC_API_KEY, publica la función igual y el Asesor IA responde con el modelo simulado.
set -euo pipefail
cd "$(dirname "$0")/../.."
CLI="supabase@2.122.1"

[ -f .env ] || { echo "Falta el archivo .env (ver docs/TRASPASO.md)."; exit 1; }
leer() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '[:space:]'; }

URL="$(leer SUPABASE_URL)"
export SUPABASE_ACCESS_TOKEN="$(leer SUPABASE_ACCESS_TOKEN)"
[ -n "$URL" ] && [ -n "$SUPABASE_ACCESS_TOKEN" ] || { echo "Faltan SUPABASE_URL o SUPABASE_ACCESS_TOKEN en .env."; exit 1; }
REF="$(printf '%s' "$URL" | sed -E 's#^https://([a-z0-9]+)\.supabase\.co.*#\1#')"
[ -n "$REF" ] && [ "$REF" != "$URL" ] || { echo "SUPABASE_URL no tiene la forma https://<proyecto>.supabase.co"; exit 1; }

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
CLAVE="$(leer ANTHROPIC_API_KEY)"
MODELO="$(leer MODELO_ASESOR)"
[ -n "$CLAVE" ] && printf 'ANTHROPIC_API_KEY=%s\n' "$CLAVE" >> "$TMP"
[ -n "$MODELO" ] && printf 'MODELO_ASESOR=%s\n' "$MODELO" >> "$TMP"
LECTURA="$(leer MODELO_LECTURA)"
[ -n "$LECTURA" ] && printf 'MODELO_LECTURA=%s\n' "$LECTURA" >> "$TMP"

if [ -s "$TMP" ]; then
  echo "→ Secretos de la función (los valores no se muestran)"
  npx --yes "$CLI" secrets set --project-ref "$REF" --env-file "$TMP" >/dev/null
else
  echo "→ Sin ANTHROPIC_API_KEY en .env: el Asesor IA responderá con el modelo simulado."
fi

echo "→ Publicando la función asesor en $REF"
npx --yes "$CLI" functions deploy asesor --project-ref "$REF" --use-api
echo "→ Publicando la función lectura en $REF"
npx --yes "$CLI" functions deploy lectura --project-ref "$REF" --use-api
# «enviar» no manda nada mientras no haya proveedor de SMS o correo configurado (ver supabase/functions/enviar).
echo "→ Publicando la función enviar en $REF"
npx --yes "$CLI" functions deploy enviar --project-ref "$REF" --use-api
echo "Listo. Pruebe en el panel: Mando → Asesor IA → «¿Dónde actúo esta semana?»."

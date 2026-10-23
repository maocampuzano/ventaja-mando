#!/usr/bin/env bash
# Script de preparación del entorno de nube (péguelo en "Setup script" del entorno en claude.ai/code).
# Instala dependencias; funciona antes y después de la fase 0.
set -euo pipefail

if [ -f package.json ]; then
  npm ci || npm install
elif [ -f prototipo/package.json ]; then
  (cd prototipo && (npm ci || npm install))
fi

# CLI de Supabase para migraciones (fase 1 en adelante); no falla si no se puede instalar.
npx --yes supabase@2 --version >/dev/null 2>&1 || echo "Aviso: la CLI de Supabase no quedó disponible; se instalará en la fase 1."

#!/usr/bin/env bash
# Crea el repositorio PRIVADO "ventaja-mando" en su GitHub y sube este paquete.
# Requiere la herramienta gh con sesión iniciada (gh auth login).
# Uso, desde la carpeta del paquete:  bash scripts/subir-a-github.sh
set -euo pipefail

NOMBRE="${1:-ventaja-mando}"
cd "$(dirname "$0")/.."

if ! gh auth status >/dev/null 2>&1; then
  echo "Primero inicie sesión en GitHub con: gh auth login"
  exit 1
fi

if [ ! -d .git ]; then
  git init -b main
  git add .
  git commit -m "Paquete inicial: prototipo, diseño, plan de trabajo y skills"
fi

gh repo create "$NOMBRE" --private --source . --remote origin --push \
  --description "Ventaja Mando: centro de mando para campañas electorales (privado)"

echo "Listo. Repositorio privado: $(gh repo view "$NOMBRE" --json url -q .url)"

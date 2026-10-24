# Traspaso: seguir Ventaja Mando en su computador

Este documento explica cómo pasar el trabajo de la sesión en la nube (claude.ai/code) a una sesión de **Claude Code
en su computador**, con otra cuenta de Claude. Todo lo hecho hasta ahora está en GitHub, en
`maocampuzano/ventaja-mando`, rama `main`. No se pierde nada al cambiar de cuenta: el código vive en GitHub, no en
la cuenta de Claude.

Estado al 24/10/2026: fases 0, 1 y 2 terminadas y la fase 3 casi cerrada (PR #15 y #16 fusionados). Detalle en
`docs/ESTADO.md`.

## Parte 1. Preparar el computador (una sola vez)

1. **Instale Node.js 22.**
   1. Entre a https://nodejs.org.
   2. Descargue la versión **22 LTS** e instálela con las opciones por defecto.
   3. Para saber si quedó bien: abra la Terminal (en Mac: Aplicaciones → Utilidades → Terminal; en Windows: menú
      Inicio → escriba «PowerShell»), escriba `node -v` y presione Enter. Debe salir algo como `v22.…`.
2. **Instale Git.**
   1. Entre a https://git-scm.com/downloads e instálelo.
   2. Para comprobarlo, escriba `git --version` en la Terminal.
3. **Instale Claude Code.**
   1. Siga https://code.claude.com/docs.
   2. Inicie sesión con la otra cuenta de Claude.
4. **Descargue el proyecto.**
   1. En la Terminal escriba:
      ```
      git clone https://github.com/maocampuzano/ventaja-mando.git
      cd ventaja-mando
      npm install
      ```
   2. Si Git le pide entrar a GitHub, use su usuario `maocampuzano`.
5. **Cree el archivo de claves `.env`.** Nunca pegue las claves en el chat con Claude ni las suba a GitHub. El archivo
   `.env` está excluido del repositorio a propósito.
   1. En la carpeta `ventaja-mando`, copie `.env.example` y llame a la copia `.env`.
   2. Ábrala con el Bloc de notas (Windows) o TextEdit (Mac).
   3. Llene estos valores. Son los mismos que tiene cargados en el entorno de claude.ai/code. Si no los tiene a mano,
      sáquelos de nuevo así:
      - `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`: supabase.com → su proyecto `ventaja-mando-prueba` → **Project
        Settings** → **API Keys**.
      - `SUPABASE_SECRET_KEY`: en esa misma página, en la sección de claves secretas.
      - `SUPABASE_ACCESS_TOKEN`: supabase.com → su foto (arriba a la derecha) → **Account** → **Access Tokens** →
        **Generate new token**.
      - `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`: los mismos que creó para la versión de prueba.
      - `MAPTILER_KEY`: cloud.maptiler.com → **API keys**.
   4. Guarde el archivo.
   5. Para comprobar que quedó bien: en la Terminal, dentro de `ventaja-mando`, escriba
      `node --env-file=.env supabase/scripts/aplicar-remoto.mjs verificar`. Debe mostrar las migraciones aplicadas,
      `"tablas_sin_rls": []` y 12.922 puestos.
6. **Opcional: las pruebas de la base en su computador** (`npm run test:db`). Necesitan PostgreSQL 16 con PostGIS y
   pgTAP. No es obligatorio: GitHub las corre en cada PR. Si quiere instalarlas, pídale a Claude el paso a paso para
   su sistema operativo.

## Parte 2. Abrir Claude Code y pegarle el mensaje

1. En la Terminal, dentro de la carpeta `ventaja-mando`, escriba `claude` y presione Enter.
2. Copie y pegue el mensaje del recuadro de abajo, completo.

```
Sigue con Ventaja Mando según PLAN-DE-TRABAJO.md (versión 2, aprobada), docs/ESTADO.md y docs/TRASPASO.md.
Vienes de una sesión en la nube (claude.ai/code) con otra cuenta; ahora trabajas en mi computador.

Contexto que debes leer primero, en este orden: CLAUDE.md (reglas que no se negocian y forma de trabajar),
docs/02-diseno-producto.md, PLAN-DE-TRABAJO.md, docs/ESTADO.md, docs/DESARROLLO.md, supabase/LEEME.md y
apps/movil/LEEME.md.

Dónde quedamos:
- Fases 0, 1 y 2 terminadas. Fase 3 fusionada en los PR #15 (cola de sincronización idempotente y funciones *_movil)
  y #16 (app Expo del líder y del testigo, bucket privado «evidencias», actualizar_tarea_movil).
- Todas las migraciones hasta 20261026000200_app_movil están aplicadas en el proyecto real de Supabase
  (ventaja-mando-prueba, us-east-2). Se aplican con supabase/scripts/aplicar-remoto.mjs (API de gestión con
  SUPABASE_ACCESS_TOKEN). En mi computador las claves están en .env: usa `node --env-file=.env …`. Aquí NO hace falta
  NODE_USE_ENV_PROXY (eso era del entorno de nube).
- No cargues la semilla de usuarios ficticios en el proyecto real sin preguntarme.
- Versión de prueba del panel en Cloudflare Pages: scripts/publicar-prueba.sh.

Qué sigue:
1. Verifica sin mostrar valores que .env tiene las claves de Supabase y que hay conexión (aplicar-remoto.mjs
   verificar). Si falta algo, dime el paso a paso para conseguirlo.
2. Cierra la fase 3 con su último PR: planilla imprimible en PDF con QR que identifica al líder y al lote
   (rama fase-3-planilla-pdf). Actualiza docs/ESTADO.md al cerrar la fase.
3. Luego sigue con la fase 4 (IA: lectura de planillas y E-14 con revisión humana obligatoria, y Strategos con
   herramientas sobre vistas agregadas). Sin ANTHROPIC_API_KEY, deja el modelo simulado y dime cómo activarla.

Pendientes que no debes olvidar:
- V2: cuenta de Expo para probar la app en un teléfono (pídemela con paso a paso cuando la app esté lista para eso).
- V3 (abogado): texto de autorización (packages/nucleo/src/autorizacion.ts), si basta la aceptación en pantalla como
  prueba, aviso de aceptación de invitaciones, leyenda de exportación, interpretación del conteo de plazos y que los
  datos quedan fuera de Colombia (us-east-2).
- Registrar que el líder abrió el WhatsApp (solo el hecho) va con la fase 6. La tipografía Archivo en la app está
  pendiente. Coordinadores ven fotos de su territorio con la fase 4.
- Mapa real: MAPTILER_KEY ya está restringida a los dominios del panel; falta publicar con la clave (scripts/publicar-prueba.sh).

Forma de trabajar (de CLAUDE.md): cada fase en su rama y PR a main con qué se hizo, cómo probarlo, pendiente, qué
necesitas de mí y «Cumplimiento» (usa la skill cumplimiento-electoral si toca datos de personas o mensajería). Nunca
subas a main directo. Antes del PR deben pasar typecheck, lint, test, test:db (lo corre GitHub si no tengo Postgres)
y las pruebas de Playwright (npx playwright install chromium la primera vez). Yo fusiono los PR. Datos de prueba
siempre ficticios. Soy principiante: todo lo que necesites de mí, con paso a paso numerado.
```

## Parte 3. El paquete de respaldo

Junto con este documento se entregó `ventaja-mando-respaldo-24-10-2026.zip`. Es una copia del código de `main` y de
su historial (`ventaja-mando.bundle`), por si algún día GitHub no estuviera disponible. **No trae claves.** Para el
trabajo diario no hace falta: use `git clone` como en la Parte 1.

Para recuperar el proyecto desde el respaldo:

1. Descomprima el zip.
2. En la Terminal, entre a la carpeta que salió y escriba `git clone ventaja-mando.bundle ventaja-mando`.

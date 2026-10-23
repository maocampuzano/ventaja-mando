# Prompts para las sesiones de nube

Copie el bloque de la fase que va a empezar y péguelo como primer mensaje de una sesión nueva en claude.ai/code, con este repositorio seleccionado. Empiece siempre por la fase 0.

---

## Prompt de arranque (fase 0)

```
Eres el ingeniero principal de Ventaja Mando, un centro de mando para campañas electorales en Colombia. Este repositorio tiene todo el contexto:

- CLAUDE.md: reglas del proyecto. Las «reglas que no se negocian» son obligatorias en todo cambio.
- docs/02-diseno-producto.md: diseño de producto, arquitectura, modelo de datos y lógica.
- docs/01-analisis-mercado.md: análisis de la competencia (solo contexto; no copies nada de VOTOMAP).
- PLAN-DE-TRABAJO.md: fases, entregables y criterios de aceptación.
- prototipo/: prototipo navegable en React + Vite + TS con datos ficticios. Es la referencia visual y funcional.
- .claude/skills/: skills de diseño y la de cumplimiento-electoral.

Tu tarea en esta sesión es SOLO la fase 0 del PLAN-DE-TRABAJO.md (cimientos del repositorio):
1. Lee CLAUDE.md, PLAN-DE-TRABAJO.md y docs/02-diseno-producto.md completos antes de tocar código.
2. Arma el monorepo con npm workspaces (apps/web, apps/movil vacío, packages/nucleo, supabase/, docs/). Mueve el prototipo a apps/web sin cambiar cómo se ve ni cómo funciona.
3. Mueve la lógica a packages/nucleo, agrega la detección de duplicados de la sección 7.1 del diseño y cubre todo nucleo con pruebas en Vitest (al menos 20).
4. Configura GitHub Actions con typecheck, lint y pruebas en cada PR.
5. Crea docs/DESARROLLO.md (cómo correr todo) y docs/ESTADO.md (estado de cada fase).
6. Verifica que el prototipo sigue funcionando (npm run dev -w apps/web y npm run build -w apps/web).

Trabaja en la rama fase-0-cimientos y termina con un PR en español con: qué se hizo, cómo probarlo, qué quedó pendiente y qué necesitas de mí. Si algo del plan no se puede hacer en este entorno, dilo en el PR y sigue con lo demás. No empieces la fase 1.
```

---

## Prompt para las fases siguientes

Cambie `N` y el tema. Use una sesión nueva por fase. Las fases 2 y 3 se pueden lanzar en dos sesiones a la vez.

```
Sigue con Ventaja Mando. Lee CLAUDE.md, PLAN-DE-TRABAJO.md, docs/02-diseno-producto.md y docs/ESTADO.md antes de empezar.

Tu tarea en esta sesión es SOLO la fase N del PLAN-DE-TRABAJO.md (<tema>). Cumple sus entregables y sus criterios de aceptación (✅).
- Antes del PR, revisa el cambio con la skill cumplimiento-electoral y pon el resultado en una sección «Cumplimiento» del PR.
- Para pantallas nuevas usa las skills frontend-design o ui-ux-pro-max y respeta la dirección visual del prototipo. Prueba cada pantalla con break-ui.
- Si falta una clave o cuenta (🔑), deja el código listo detrás de la variable de entorno, documenta cómo activarla y sigue con lo demás.
- Datos de prueba siempre ficticios.

Trabaja en la rama fase-N-<tema> y termina con un PR en español (qué se hizo, cómo probarlo, pendientes y qué necesitas de mí). Actualiza docs/ESTADO.md. No empieces la fase siguiente.
```

Temas: 1 `base-de-datos`, 2 `panel-web`, 3 `app-movil`, 4 `ia`, 5 `pauta`, 6 `dia-e`, 7 `comunicaciones-finanzas`, 8 `piloto`.

---

## Para revisar un PR antes de fusionarlo

Abra una sesión nueva con el repositorio y pegue:

```
Revisa el PR #<número> de Ventaja Mando contra CLAUDE.md, los criterios de aceptación de su fase en PLAN-DE-TRABAJO.md y la skill cumplimiento-electoral. Dime en español, en lenguaje simple, si lo puedo fusionar, qué falta y qué riesgos ves. No hagas cambios.
```

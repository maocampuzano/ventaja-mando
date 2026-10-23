# Estado de las fases

Cada fase actualiza su fila al cerrarse, con la fecha, el PR, qué quedó y qué falta. El detalle de cada fase y los puntos de validación (V1 a V7) están en `PLAN-DE-TRABAJO.md` (versión 2, aprobada el 23/10/2026).

| Fase | Estado | Fecha | PR | Qué quedó | Qué falta |
|---|---|---|---|---|---|
| 0. Cimientos del repositorio | Fusionada | 23/10/2026 | [#1](https://github.com/maocampuzano/ventaja-mando/pull/1) | Monorepo con npm workspaces; prototipo en `apps/web` sin cambios visibles; lógica en `packages/nucleo` con detección de duplicados y 43 pruebas; integración continua en verde; `docs/DESARROLLO.md`. | Alinear la sección 7.4 del diseño con los umbrales del prototipo. |
| 1. Base de datos, seguridad y cuentas | Fusionada | 23/10/2026 | [#4](https://github.com/maocampuzano/ventaja-mando/pull/4) | Modelo completo con RLS en todas las tablas, reglas 1, 2, 3, 4 y 7 en la base, cédula cifrada y con HMAC, duplicados, fusión auditada, invitaciones, semilla de Turbaco, script de carga de territorios y 77 pruebas pgTAP en la integración continua. | Aplicar a su proyecto de Supabase (V2), activar el 2FA y cargar DIVIPOLE y puestos cuando se permita `datos.gov.co`. |
| 2. Panel web con datos reales | Sin empezar | | | | Clave de MapTiler o Stadia. |
| 3. App del líder y del testigo | Sin empezar | | | | |
| 4. IA | Sin empezar | | | | Clave de la API de Anthropic. |
| 5. Tierra + pauta | Sin empezar | | | | Permisos de Meta (`ads_read`) y *developer token* de Google Ads. |
| 6. Día E | Sin empezar | | | | |
| 7. Comunicaciones, telemarketing y finanzas | Sin empezar | | | | Proveedores de SMS y correo. |
| 8. Piloto y producción | Sin empezar | | | | Abogado de datos personales y dominio propio. |

# Estado de las fases

Cada fase actualiza su fila al cerrarse, con la fecha, el PR, qué quedó y qué falta. El detalle de cada fase y los puntos de validación (V1 a V7) están en `PLAN-DE-TRABAJO.md` (versión 2, aprobada el 23/10/2026).

| Fase | Estado | Fecha | PR | Qué quedó | Qué falta |
|---|---|---|---|---|---|
| 0. Cimientos del repositorio | Fusionada | 23/10/2026 | [#1](https://github.com/maocampuzano/ventaja-mando/pull/1) | Monorepo con npm workspaces; prototipo en `apps/web` sin cambios visibles; lógica en `packages/nucleo` con detección de duplicados y 43 pruebas; integración continua en verde; `docs/DESARROLLO.md`. | Alinear la sección 7.4 del diseño con los umbrales del prototipo. |
| 1. Base de datos, seguridad y cuentas | Fusionada | 23/10/2026 | [#4](https://github.com/maocampuzano/ventaja-mando/pull/4) | Modelo completo con RLS en todas las tablas, reglas 1, 2, 3, 4 y 7 en la base, cédula cifrada y con HMAC, duplicados, fusión auditada, invitaciones, semilla de Turbaco, script de carga de territorios y 77 pruebas pgTAP en la integración continua. | Aplicar a su proyecto de Supabase (V2) y activar el 2FA. Ver «Proyecto real de Supabase» abajo. |
| 2. Panel web con datos | En curso | | | Capa de datos demo/supabase, inicio de sesión por rol con 2FA, alcance por territorio en la base y en el demo, Playwright en la integración continua. | Importación de Excel, invitaciones con QR, formularios, datos y cumplimiento, MapLibre. Clave de MapTiler o Stadia (sin ella, el mapa usa el SVG del prototipo). |
| 3. App del líder y del testigo | Sin empezar | | | | Cuenta de Expo para los builds de prueba. |
| 4. IA: lectura de planillas y E-14, y Strategos | Sin empezar | | | | Clave de la API de Anthropic. |
| 5. Día E | Sin empezar | | | | |
| 6. Comunicaciones, telemarketing y finanzas | Sin empezar | | | | Proveedores de SMS y correo. |
| 7. Tierra + pauta | Sin empezar | | | | Permisos de Meta (`ads_read`) y *developer token* de Google Ads. |
| 8. Endurecimiento y despliegue de prueba | Sin empezar | | | | Claves de V2 para el entorno de prueba. |
| 9. Piloto y producción | Sin empezar | | | | V3 (abogado de datos personales) y V6 (producción). |

## Proyecto real de Supabase (V2)

| Paso | Estado |
|---|---|
| Variables `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` y `SUPABASE_DB_URL` en el entorno | Llegan (23/10/2026). La API del proyecto responde con ambas claves. `SUPABASE_URL` trae `/rest/v1/` al final y hay que dejarla solo con el dominio. |
| Migraciones y secretos del Vault | Pendiente: el entorno no permite conexiones a Postgres (puerto 5432). Se aplican por la API de administración con `supabase/scripts/aplicar-remoto.mjs`, que necesita `SUPABASE_ACCESS_TOKEN` y el dominio `api.supabase.com` permitido. |
| Municipios (DANE) y puestos (Registraduría) | Descargados de datos.gov.co y probados en local: 33 departamentos, 1.122 municipios y 12.922 puestos (12.914 con ubicación). Se cargan al proyecto real junto con las migraciones. Ver `supabase/datos/informe-datos-abiertos.md`. |
| Semilla ficticia de Turbaco | No se carga en el proyecto real sin autorización expresa. |
| 2FA (TOTP) | Pendiente: lo activa usted en el panel de Supabase (paso 4 de `supabase/LEEME.md`). |

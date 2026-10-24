# Estado de las fases

Cada fase actualiza su fila al cerrarse, con la fecha, el PR, qué quedó y qué falta. El detalle de cada fase y los puntos de validación (V1 a V7) están en `PLAN-DE-TRABAJO.md` (versión 2, aprobada el 23/10/2026).

| Fase | Estado | Fecha | PR | Qué quedó | Qué falta |
|---|---|---|---|---|---|
| 0. Cimientos del repositorio | Fusionada | 23/10/2026 | [#1](https://github.com/maocampuzano/ventaja-mando/pull/1) | Monorepo con npm workspaces; prototipo en `apps/web` sin cambios visibles; lógica en `packages/nucleo` con detección de duplicados y 43 pruebas; integración continua en verde; `docs/DESARROLLO.md`. | Alinear la sección 7.4 del diseño con los umbrales del prototipo. |
| 1. Base de datos, seguridad y cuentas | Fusionada | 23/10/2026 | [#4](https://github.com/maocampuzano/ventaja-mando/pull/4) | Modelo completo con RLS en todas las tablas, reglas 1, 2, 3, 4 y 7 en la base, cédula cifrada y con HMAC, duplicados, fusión auditada, invitaciones, semilla de Turbaco, script de carga de territorios y 77 pruebas pgTAP en la integración continua. | Aplicar a su proyecto de Supabase (V2) y activar el 2FA. Ver «Proyecto real de Supabase» abajo. |
| 2. Panel web con datos | En curso | | | Capa de datos demo/supabase, inicio de sesión por rol con 2FA, alcance por territorio en la base y en el demo, Playwright en la integración continua. Importación de Excel o CSV con revisión, duplicados explicables y autorización obligatoria. Equipo con invitaciones por correo, enlace, QR y WhatsApp manual; registro solo por invitación. Datos y cumplimiento: solicitudes de titulares con plazos en días hábiles, revocatoria y supresión, exportación con marca y auditoría. | Constructor de formularios y MapLibre (clave de MapTiler), formularios, datos y cumplimiento, MapLibre. Clave de MapTiler o Stadia (sin ella, el mapa usa el SVG del prototipo). |
| 3. App del líder y del testigo | Sin empezar | | | | Cuenta de Expo para los builds de prueba. |
| 4. IA: lectura de planillas y E-14, y Strategos | Sin empezar | | | | Clave de la API de Anthropic. |
| 5. Día E | Sin empezar | | | | |
| 6. Comunicaciones, telemarketing y finanzas | Sin empezar | | | | Proveedores de SMS y correo. |
| 7. Tierra + pauta | Sin empezar | | | | Permisos de Meta (`ads_read`) y *developer token* de Google Ads. |
| 8. Endurecimiento y despliegue de prueba | Sin empezar | | | | Claves de V2 para el entorno de prueba. |
| 9. Piloto y producción | Sin empezar | | | | V3 (abogado de datos personales) y V6 (producción). |

## Proyecto real de Supabase (V2)

Proyecto `ventaja-mando-prueba`, Postgres 17. Revisado el 23/10/2026.

| Paso | Estado |
|---|---|
| Variables `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL` y `SUPABASE_ACCESS_TOKEN` | Llegan. La API responde con las claves y con el token. |
| Migraciones de la fase 1 | Aplicadas las 4 con `aplicar-remoto.mjs`: 30 tablas, todas con RLS, y 61 políticas. |
| Secretos del Vault | `clave_documento` y `pepper_documento` creados dentro de la base; el cifrado y el HMAC de la cédula funcionan. |
| Municipios (DANE) y puestos (Registraduría) | Cargados: 1.155 territorios (33 departamentos y 1.122 municipios) y 12.922 puestos, 12.914 con ubicación. Ver `supabase/datos/informe-datos-abiertos.md`. |
| Prueba desde afuera con la clave pública y sin sesión | No se ve ninguna tabla, y `ver_documento` responde «permiso denegado». |
| Migraciones de la fase 2 | Aplicadas: tablero, importación y peso del celular en duplicados (24/10/2026). |
| Versión de prueba publicada | `https://ventaja-mando-prueba.pages.dev` (proyecto de prueba de Supabase) y `https://demo.ventaja-mando-prueba.pages.dev` (datos ficticios), en Cloudflare Pages, 24/10/2026. |
| Registro de cuentas | Abierto solo para correos con invitación vigente (hook `before user created`); contraseña de mínimo 12 caracteres. Verificado: un correo sin invitación recibe 403. |
| Semilla ficticia de Turbaco | No cargada; solo con autorización expresa. |
| 2FA (TOTP) | Pendiente: lo activa Mauricio (paso 4 de `supabase/LEEME.md`). |
| Región | `us-east-2` (Estados Unidos). **Decisión de Mauricio del 24/10/2026: se deja así.** Supabase no tiene región en Colombia; la más cercana es São Paulo. Antes de cargar datos reales, el abogado de datos personales debe revisar que los datos se guardan fuera del país (V3). |

Para aplicar desde el entorno de nube, Node necesita `NODE_USE_ENV_PROXY=1` para salir por el proxy: `NODE_USE_ENV_PROXY=1 node supabase/scripts/aplicar-remoto.mjs verificar`.

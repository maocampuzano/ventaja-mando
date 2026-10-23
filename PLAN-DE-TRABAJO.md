# Plan de trabajo, versión 2: de prototipo a producto

Versión 2 del 23/10/2026. Reemplaza al plan original y conserva su meta: un MVP piloteado con una campaña real antes de las elecciones territoriales de octubre de 2027. Las fechas oficiales del calendario electoral se toman de la Registraduría cuando se publiquen.

## Qué cambia y por qué

El plan original detenía cada fase en dos esperas: la revisión y fusión de cada PR, y las claves de cada servicio. Con ese esquema, una clave que tardara semanas (por ejemplo, el permiso de Meta) frenaba todo lo que venía después. Este plan cambia tres cosas:

1. **Avanzo sin esperar las claves.** Cada servicio externo (Supabase, mapas, IA, pauta, SMS, correo) queda detrás de un adaptador con un modo de demostración que funciona con datos ficticios. Cuando usted entrega una clave, el servicio real se enciende con una variable de entorno, sin reescribir nada.
2. **Fusiono mis propios PR**, cuando la integración continua está en verde y pasa la revisión de cumplimiento. Cada fase sigue teniendo su rama y su PR, para que quede trazabilidad completa y usted pueda revisar después lo que quiera.
3. **Su validación se pide solo en los puntos de la sección siguiente.** Son los que implican dinero, cuentas a su nombre, decisiones legales, datos reales o producción. Todo lo demás lo decido yo y queda explicado en el PR de la fase.

## Lo que necesita su validación

Solo estos puntos me detienen. Si uno de ellos llega en mitad de una fase, sigo con lo que no dependa de él y se lo pregunto.

| | Punto de validación | Cuándo aparece |
|---|---|---|
| **V1** | **Aprobar este plan.** | Ahora. |
| **V2** | **Cuentas y claves a su nombre:** Supabase, proveedor de mapas, API de Anthropic, Expo (EAS), Meta y Google Ads, SMS y correo. Usted las crea y las carga en el entorno; yo le digo exactamente cuáles y dónde. No bloquean el desarrollo: solo encienden el servicio real. | Escalonado (ver la sección «Lo que necesito de usted»). |
| **V3** | **Textos y decisiones legales:** el texto de la autorización de datos, el aviso de privacidad, la política de tratamiento y el contrato de encargado. Yo preparo borradores; los valida un abogado de datos personales. | Antes de cualquier dato real. |
| **V4** | **Cualquier excepción a las reglas que no se negocian de `CLAUDE.md`**, por ejemplo activar la tabla de opinión política para una campaña o cambiar una regla. Nunca lo hago por mi cuenta. | Si surge. |
| **V5** | **Enviar código o datos a un servicio externo que no esté ya aprobado** (por ejemplo, Superdesign), o agregar una dependencia de pago. | Si surge. |
| **V6** | **Producción:** desplegar, apuntar un dominio, cargar datos reales, publicar en las tiendas, gastar dinero o hacer cualquier cambio irreversible sobre la base de producción. | Fases 8 y 9. |
| **V7** | **Decisiones de negocio:** precios, nombre definitivo y alcance que se recorte por tiempo. | Cuando haga falta; le presento opciones con mi recomendación. |

**Revisiones sin bloqueo.** Al terminar el panel web (fase 2) y la app (fase 3) le dejo un enlace o un video corto para que los vea. Sigo con la fase siguiente mientras tanto, y sus comentarios entran como ajustes en un PR aparte.

## Lo que decido yo

- Arquitectura, librerías (de código abierto y con licencias permisivas), estructura del código y orden de trabajo dentro de cada fase.
- Fusionar mis PR con la integración continua en verde y la revisión de cumplimiento hecha. Nunca subo cambios directo a `main` ni reescribo su historial.
- Corregir inconsistencias de la documentación (por ejemplo, alinear la sección 7.4 del diseño con los umbrales del prototipo).
- Hacer varias fases seguidas en una misma sesión cuando no dependan de nada suyo.
- Datos de prueba: siempre ficticios, a partir de la semilla de Turbaco.

## Fases

| Fase | Tema | Necesita algo suyo para empezar | Qué enciende la clave cuando llegue |
|---|---|---|---|
| 0 | Cimientos del repositorio | — | ✅ Hecha (PR #1). |
| 1 | Base de datos, seguridad y cuentas | No | Aplicar las migraciones a su proyecto de Supabase y activar el 2FA. |
| 2 | Panel web con datos | No | Datos reales de Supabase y teselas del mapa. |
| 3 | App del líder y del testigo | No | Builds de prueba en Android e iOS (Expo). |
| 4 | IA: lectura de planillas y E-14, y Strategos | No | Respuestas reales de Claude. |
| 5 | Día E | No | — |
| 6 | Comunicaciones, telemarketing y finanzas | No | Envíos reales de SMS y correo. |
| 7 | Tierra + pauta | No | Métricas reales de Meta y Google Ads. |
| 8 | Endurecimiento y despliegue de prueba | Claves de V2 para el entorno de prueba | — |
| 9 | Piloto y producción | V3 y V6 | — |

### Fase 1: base de datos, seguridad y cuentas

En un Postgres 16 con PostGIS local, que imita a Supabase:
- Migraciones del modelo de datos de la sección 6 del diseño.
- RLS en todas las tablas con datos de personas, basada en `membresia` (rol y territorios).
- Pruebas SQL de RLS: un líder no ve otra zona, un candidato no ve la base de otro candidato del mismo partido y un testigo solo ve su mesa.
- Cédula cifrada y `documento_hash`.
- Funciones de duplicados, fusión con auditoría y registro de autorización.
- Semilla ficticia de Turbaco.
- Un esquema `auth` mínimo que simula al de Supabase.

Las pruebas de RLS entran a la integración continua. La carga de DIVIPOLE y del catálogo de puestos queda lista como script; corre cuando se permita el dominio de datos abiertos (ver «Lo que necesito de usted»).

✅ Las migraciones se aplican desde cero y las pruebas de RLS pasan en la integración continua. Ningún dato de persona se puede leer sin membresía.

### Fase 2: panel web con datos

- Una capa de datos con dos modos: «demo» (la semilla, en el navegador) y «supabase» (real).
- Inicio de sesión por rol.
- Importación de Excel con vista previa, duplicados explicables y validación.
- Gestión del equipo con invitaciones, enlaces y QR por rol.
- Constructor básico de formularios.
- Datos y cumplimiento: autorizaciones, solicitudes de titulares con plazos y exportaciones con marca de agua.
- Mapa con MapLibre, y el SVG actual como respaldo.
- Playwright para el inicio de sesión, la importación y la invitación.

✅ En modo demo, un gerente ve toda la campaña y un coordinador solo su territorio. Un Excel de 5.000 filas ficticias termina con su reporte de duplicados. Las pruebas de Playwright pasan.

### Fase 3: app del líder y del testigo

- Expo con SQLite local y cola de sincronización, con estados visibles (pendiente, enviado, revisado).
- Líder: tareas, registro con autorización, metas, WhatsApp manual y escáner de planillas.
- Testigo: su mesa, apertura, foto del E-14 y novedades.
- Planilla imprimible en PDF con QR.

La sincronización se prueba con pruebas automáticas que simulan quedarse sin señal. No tengo teléfonos reales: la prueba en un equipo físico la hace usted o alguien del equipo, con el build de prueba (V2: cuenta de Expo).

✅ Sin conexión, 10 registros y 2 planillas se sincronizan sin duplicar al volver la señal (prueba automática).

### Fase 4: IA

- Lectura de planillas y del E-14 con visión, con revisión humana obligatoria.
- Strategos con *tool use* sobre vistas agregadas, con fuentes en cada respuesta y tareas aprobables con un clic.
- Registro de uso y costo por campaña, y cupos por plan.

Sin clave, un modelo simulado devuelve respuestas fijas para las pruebas.

✅ Una prueba automática verifica que ninguna herramienta de Strategos devuelve filas de personas. Con la clave, Strategos responde «¿dónde actúo esta semana?» con la semilla y sus fuentes.

### Fase 5: Día E

Antes estaba después de la pauta. La adelanto porque no depende de nada externo.
- Centro de mando en tiempo real: mesas con semáforo, E-14 recibidos y novedades con prioridad, responsable y escalamiento.
- Índice de cumplimiento del líder, agregado por mesa.
- Modo simulacro.

✅ Un simulacro con 100 mesas y 20 usuarios simultáneos funciona sin errores (prueba de carga automática).

### Fase 6: comunicaciones, telemarketing y finanzas

- SMS y correo detrás de adaptadores, solo a contactos autorizados, con baja en un paso.
- Colas de telemarketing con guion y resultado de cada llamada.
- Finanzas: presupuesto, topes, soportes y exportación para el contador.
- Panel de partido sin cruce de datos personales.

El formato de Cuentas Claras lo armo a partir de la documentación pública del CNE. Si no logro confirmarlo desde aquí, le pido un ejemplo real del contador.

### Fase 7: tierra + pauta

- Conectores de Meta Ads y Google Ads con OAuth del cliente.
- Asignación de las métricas a zonas, con su método y sus límites documentados.
- Capa del mapa y recomendación con datos reales.

Se construye con respuestas de ejemplo de las APIs mientras llegan los permisos.

### Fase 8: endurecimiento y despliegue de prueba

- Revisión de seguridad, copias de respaldo, monitoreo de errores, registro de auditoría revisable y plan de incidentes.
- Despliegue de un entorno de **prueba** (Cloudflare Pages y Supabase), con datos ficticios.

### Fase 9: piloto y producción

Requiere V3 y V6.
- Producción.
- Piloto con una campaña pequeña (concejo o JAL), con capacitación y soporte.

## Lo que necesito de usted, por orden

1. **Ahora:** aprobar este plan (V1).
2. **Ahora, porque tarda semanas:** pedir el acceso a la API de Meta (app con `ads_read`) y el *developer token* de Google Ads. No frena el desarrollo, pero sin ellos la fase 7 se queda en modo demo.
3. **Ahora, en la red del entorno** (Edit → Network access → Allowed domains, con «Allow package managers» marcado):
   - `www.datos.gov.co`, para cargar DIVIPOLE y el catálogo de puestos;
   - más adelante, el dominio de su proyecto de Supabase (`*.supabase.co`) y el del proveedor de mapas.
4. **Durante las fases 1 y 2:** el proyecto de Supabase en São Paulo, con sus tres claves en el entorno, y la clave de MapTiler o Stadia.
5. **Durante la fase 3:** una cuenta de Expo, para los builds de prueba.
6. **Durante la fase 4:** la clave de la API de Anthropic.
7. **Durante la fase 6:** los proveedores de SMS y correo.
8. **Antes de la fase 9:** el abogado de datos personales, el dominio propio y las cuentas de Apple Developer y Google Play.

## Cómo le informo

- Cada fase termina en un PR en español con qué se hizo, cómo probarlo, qué quedó pendiente, qué necesito de usted y la sección «Cumplimiento».
- `docs/ESTADO.md` dice en qué va cada fase y qué está esperando su validación.
- Cuando algo requiera un punto de validación, se lo pregunto directamente en la sesión, con mi recomendación.

## Límites del entorno que debe conocer

- **Red restringida.** Cada servicio externo necesita su dominio permitido. Lo que no esté permitido queda en modo demo hasta que lo esté.
- **Sin teléfonos reales.** La app se prueba con pruebas automáticas y en el navegador. La prueba en un equipo físico la tiene que hacer una persona.
- **Contenedor efímero.** Todo lo que vale queda en el repositorio: nada importante vive solo en la sesión.
- **Revisión legal.** No reemplazo a un abogado. Los textos legales que prepare son borradores hasta que pasen por V3.

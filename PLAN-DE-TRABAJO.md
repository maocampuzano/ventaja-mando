# Plan de trabajo: de prototipo a producto

**Meta:** un MVP piloteado con una campaña real antes de las elecciones territoriales de octubre de 2027. Las fechas oficiales del calendario electoral se toman de la Registraduría cuando se publiquen.

Cada fase se hace en **una o varias sesiones de nube**. Cada sesión trabaja en su rama y termina en un PR que Mauricio revisa y fusiona. Una fase no empieza hasta que la anterior esté fusionada, salvo donde se indica que se puede trabajar **en paralelo**.

**Leyenda:**
- 🔑 lo que Mauricio debe entregar o hacer;
- ✅ criterios de aceptación.

---

## Fase 0: cimientos del repositorio (1 sesión)

**Objetivo:** pasar del prototipo suelto a un monorepo ordenado, con integración continua.

1. Crear el monorepo con npm workspaces:
   ```
   apps/web          ← mover aquí el prototipo (src, index.html, vite.config.ts)
   apps/movil        ← vacío por ahora (lo crea la fase 3)
   packages/nucleo   ← mover aquí src/logic.ts, tipos compartidos y formatos (miles, pct, fechas)
   supabase/         ← migraciones, semillas y pruebas (lo llena la fase 1)
   docs/
   ```
2. Que `apps/web` importe la lógica de `packages/nucleo`. Pruebas unitarias con Vitest para todo `nucleo`: índice del líder, recomendación tierra + pauta, cobertura de mesas, enlace de WhatsApp manual y duplicados (sección 7.1 del diseño).
3. GitHub Actions: *typecheck*, *lint* y pruebas en cada PR.
4. `.env.example` completo y un `docs/DESARROLLO.md` con cómo correr todo en local.

✅ `npm run dev -w apps/web` abre el prototipo igual que antes. `npm test` pasa con al menos 20 pruebas de `nucleo`. La integración continua está en verde.

---

## Fase 1: base de datos, seguridad y cuentas (2-3 sesiones)

**Objetivo:** el corazón de datos del producto, seguro desde el primer día.

1. Migraciones SQL del modelo de datos (sección 6 del diseño): organización, campaña, usuario, membresía, territorio, puesto, persona, autorización, `preferencia_politica` (opcional), solicitud_titular, líder, formulario y respuesta, tarea, testigo, incidencia, acta_e14, pauta_metrica, historico_resultado y auditoría.
2. **RLS en todas las tablas con datos de personas.** Las políticas se basan en `membresia` (rol + territorios) y una persona solo ve su campaña y sus territorios.
3. **Pruebas de RLS:** un líder no ve otra zona, un candidato no ve la base de otro candidato del mismo partido y un testigo solo ve su mesa.
4. Cédula cifrada + `documento_hash` para buscar duplicados sin exponer el documento.
5. Funciones: detección de posibles duplicados (con sus razones), fusión con auditoría y registro de autorización.
6. Auth: correo + contraseña o enlace mágico, **2FA obligatorio** para administradores y gerentes, e invitaciones por rol.
7. Semilla de datos ficticios (Turbaco del prototipo) para desarrollo y demos.
8. Carga de territorios: DIVIPOLE (departamentos y municipios) y el catálogo de puestos desde datos abiertos oficiales, con fuente y fecha.

🔑 Proyecto de Supabase creado (región São Paulo), con `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en el entorno de nube.
✅ Migraciones aplicables desde cero. Pruebas de RLS en verde. Ningún dato de persona es legible sin membresía. Semilla cargada.

> Si el entorno no tiene Docker para la Supabase local, instale PostgreSQL + PostGIS con el gestor de paquetes y pruebe las migraciones y las RLS allí, con un esquema `auth` mínimo que simule `auth.uid()`.

---

## Fase 2: panel web con datos reales (2-3 sesiones, en paralelo con la fase 3)

1. Conectar el prototipo a Supabase. Las pantallas Mando, Líderes, Día E, Datos y Resumen leen datos reales.
2. MapLibre con teselas del proveedor elegido y las zonas y puestos desde PostGIS (dejando el SVG como respaldo sin conexión).
3. **Importación de Excel**: asistente que reconoce las columnas, vista previa, duplicados explicables y validación.
4. Gestión de equipo: invitar líderes, coordinadores y testigos, asignar territorios y metas, y enlaces y QR de inscripción por rol con la autorización integrada.
5. Formularios: constructor básico y respuestas.
6. Datos y cumplimiento: autorizaciones, solicitudes de titulares con plazos y exportaciones con marca de agua y registro en la auditoría.

🔑 Clave del proveedor de mapas (`MAPTILER_KEY` o equivalente).
✅ Con la semilla, un gerente ve la campaña completa y un coordinador solo su territorio. La importación de un Excel de 5.000 filas ficticias termina con su reporte de duplicados. Playwright cubre el inicio de sesión, la importación y la invitación.

---

## Fase 3: app del líder y del testigo (2-3 sesiones, en paralelo con la fase 2)

1. App en Expo con inicio de sesión, rol líder y rol testigo.
2. **Sin conexión primero:** SQLite local, cola de sincronización y estados visibles (pendiente, enviado, revisado). Nada se pierde si se cierra la app.
3. Líder: tareas de hoy, registrar persona con autorización, mis metas y botón de WhatsApp manual.
4. Escáner de planillas: foto o lote, guardado local y envío al recuperar señal (la lectura con IA la hace la fase 4).
5. Testigo: mi mesa, confirmar apertura, foto del E-14 y reportar una novedad.
6. Generador de la planilla imprimible (PDF) con QR del líder y del lote, y texto de autorización.

🔑 Cuentas de Apple Developer y Google Play, cuando se vaya a publicar.
✅ En modo avión, un líder registra 10 personas y escanea 2 planillas; al volver la señal todo se sincroniza sin duplicar. Hay builds de prueba para Android e iOS.

---

## Fase 4: IA (2 sesiones)

1. **Lectura de planillas** con visión: extrae las filas con su confianza, marca dudas y duplicados, y obliga a la revisión humana en web y app (como en el prototipo).
2. **Lectura del E-14** con revisión humana y consolidación privada por mesa, puesto y zona.
3. **Strategos**: chat con *tool use* sobre vistas agregadas (cobertura, metas, histórico, pauta, llamadas, índice de líderes).
   - Cada respuesta lista sus fuentes.
   - Las tareas propuestas se aprueban con un clic.
   - Queda un registro de uso y costo por campaña.
4. Límites por plan: cupos de lectura y de consultas.

🔑 `ANTHROPIC_API_KEY` en el entorno.
✅ Una planilla ficticia escrita a mano se lee con dudas marcadas. Strategos responde «¿dónde actúo esta semana?» con datos de la semilla y fuentes. Una prueba automática verifica que ninguna herramienta devuelva filas de personas.

---

## Fase 5: tierra + pauta (2 sesiones)

1. Conector de **Meta Ads** (OAuth de la cuenta publicitaria del cliente): alcance, clics y gasto por región o ciudad.
2. Conector de **Google Ads**, con las mismas métricas.
3. Asignación de las métricas a zonas, con un método documentado y sus límites (la geografía de las plataformas no coincide con los barrios).
4. Capa «Alcance de la pauta» y recomendación tierra + pauta con datos reales; Strategos las usa.

🔑 App de Meta con permisos `ads_read` aprobados, y *developer token* de Google Ads. **Pídalos al inicio del proyecto: la revisión puede tardar semanas.**
✅ Con una cuenta de prueba conectada, el mapa muestra la pauta por zona y las recomendaciones cambian según esos datos.

---

## Fase 6: Día E (1-2 sesiones)

1. Centro de mando en tiempo real: mesas con semáforo, E-14 recibidos y novedades.
2. Novedades con prioridad, responsable, escalamiento al abogado de zona y cierre.
3. Índice de cumplimiento del líder después de la elección, **en agregado por mesa** (sección 7.3 del diseño).
4. Modo **simulacro** para entrenar al equipo.

✅ Un simulacro con 100 mesas ficticias y 20 usuarios simultáneos funciona sin errores ni retrasos visibles.

---

## Fase 7: comunicaciones, telemarketing y finanzas (2-3 sesiones)

1. SMS y correo a contactos autorizados, con baja automática y reportes de entrega.
2. Telemarketing: colas por grupo y territorio, guion con IA y resultado de cada llamada.
3. Finanzas de campaña: presupuesto, ingresos y gastos, topes, soportes y exportación para el contador (formato de Cuentas Claras).
4. Panel de partido: multicandidato y cruce entre candidatos sin exponer datos personales.

🔑 Proveedor de SMS y de correo con sus claves.

---

## Fase 8: piloto y salida a producción

1. Despliegue: web en Cloudflare Pages y backend en Supabase de producción, con copias de respaldo.
2. Monitoreo de errores, registro de auditoría revisable y plan de respuesta a incidentes.
3. Piloto con una campaña real pequeña (concejo o JAL), con capacitación y soporte.

🔑 **Antes de cargar datos reales:**
- revisión de un abogado de datos personales (contrato de encargado del tratamiento, texto de autorización y registro de bases ante la SIC si aplica);
- dominio propio.

---

## Cómo encadenar las sesiones

| Orden | Sesiones | Depende de |
|---|---|---|
| 1 | Fase 0 | — |
| 2 | Fase 1 | Fase 0 fusionada |
| 3 | Fase 2 y fase 3 **en paralelo** (dos sesiones) | Fase 1 fusionada |
| 4 | Fase 4 | Fases 2 y 3 |
| 5 | Fase 5 y fase 6 en paralelo | Fase 4 (fase 6 solo necesita la 3) |
| 6 | Fase 7 | Fase 2 |
| 7 | Fase 8 | Todo lo anterior |

Al cerrar cada fase, la sesión actualiza la casilla correspondiente en `docs/ESTADO.md` (la crea la fase 0) con: fecha, PR, qué quedó y qué falta.

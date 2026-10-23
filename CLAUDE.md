# Ventaja Mando

Centro de mando para campañas electorales en Colombia: une la operación de tierra (líderes, simpatizantes, territorio, testigos) con la pauta digital (Meta y Google Ads) y una IA estratégica (Strategos), en un mapa. Es un producto de XYZ Creatia, de la familia **Ventaja Electoral**. Dueño: Mauricio Campuzano.

Antes de escribir código, lea `docs/02-diseno-producto.md` (el diseño) y `PLAN-DE-TRABAJO.md` (las fases). El prototipo navegable está en `apps/web/` y es la referencia visual. El estado de cada fase está en `docs/ESTADO.md` y cómo correr todo en `docs/DESARROLLO.md`.

## Idioma

- Todo lo que vea el usuario, en **español de Colombia**: interfaz, mensajes, errores, documentación y descripciones de PR.
- Nombres de código: en español para el dominio (`persona`, `lider`, `zona`, `mesa`, `autorizacion`) y en inglés solo lo propio de las librerías.
- Fechas `dd/mm/aaaa`, separador de miles con punto (`15.419`), moneda `$ 1.250.000`, zona horaria `America/Bogota`.

## Reglas que no se negocian

Estas reglas son parte del producto y del argumento de venta. Ningún cambio las puede romper:

1. **WhatsApp solo de persona a persona.** Nada de bots, envíos automáticos, conexión por QR (WhatsApp Web) ni librerías no oficiales (Baileys, whatsapp-web.js, etc.). Las políticas de WhatsApp no admiten a campañas ni candidatos en su plataforma Business. Se permite el enlace `wa.me` con texto prellenado que **la persona envía desde su teléfono**. La automatización va por SMS, correo, chat web propio y Telegram.
2. **La opinión política es dato sensible** (Ley 1581 de 2012, art. 5). Va en una tabla aparte (`preferencia_politica`), es **opcional por campaña**, está apagada por defecto y exige una autorización marcada como sensible. Los análisis de intención se hacen en agregado (por mesa, puesto o zona).
3. **Ninguna persona se guarda sin autorización registrada** (finalidades, canal, fecha y evidencia). Si se revoca, deja de usarse para contacto.
4. **Las solicitudes ciudadanas no llevan valor en pesos** ni se relacionan con la intención de voto de la persona (riesgo de corrupción al sufragante, art. 390 del Código Penal).
5. **No consultar en masa** puestos de votación con cédulas de terceros en fuentes de la Registraduría.
6. **La IA nunca recibe listas de personas**: Strategos trabaja con vistas agregadas por medio de herramientas. Toda respuesta dice de qué datos salió. Los pronósticos se presentan como escenarios con supuestos, nunca como certeza.
7. **El OCR de planillas y E-14 siempre pasa por revisión humana** antes de entrar a la base o a la consolidación.
8. **Aislamiento por campaña y territorio con RLS en Postgres.** Ocultar en la interfaz no cuenta como seguridad. Toda tabla con datos de personas tiene política RLS y prueba que la verifique.
9. **No copiar nada de VOTOMAP** ni de otros competidores: ni código, ni textos, ni pantallas, ni recursos. El análisis de mercado (`docs/01-analisis-mercado.md`) es solo contexto funcional.
10. **Nunca subir secretos** al repositorio. Las claves van en variables de entorno (ver `.env.example`).

## Stack

- **Web:** React + TypeScript + Vite. MapLibre GL para el mapa en producción, con teselas de un proveedor con clave (MapTiler o Stadia). El mapa SVG del prototipo solo sirve para demos.
- **Móvil:** Expo (React Native) con SQLite local y cola de sincronización; funciona sin conexión desde el primer día.
- **Backend:** Supabase (Postgres + PostGIS + RLS, Auth con 2FA, Storage, Realtime y Edge Functions), región São Paulo.
- **IA:** API de Claude con *tool use*. Modelos configurables por variable de entorno; por defecto `claude-sonnet-5-5` para Strategos y la lectura de planillas y E-14, y `claude-haiku-5-5` para clasificaciones simples.
- **Monorepo con npm workspaces:** `apps/web`, `apps/movil`, `packages/nucleo` (tipos y lógica compartida), `supabase/` (migraciones, semillas y pruebas).
- **Pruebas:** Vitest para la lógica, pruebas SQL de RLS y Playwright para los flujos web críticos.

## Forma de trabajar

- **Cada fase en su propia rama** (`fase-N-tema`), que termina en un PR con:
  - qué se hizo;
  - cómo probarlo;
  - qué quedó pendiente;
  - qué necesita de Mauricio (cuentas, claves, decisiones);
  - la sección «Cumplimiento».
- Se pueden hacer varias fases seguidas en una sesión. No mezcle fases en un mismo PR. Si encuentra trabajo fuera de alcance, anótelo en el PR en vez de hacerlo.
- **Autonomía:** el agente fusiona sus propios PR cuando la integración continua está en verde y la revisión de cumplimiento está hecha. Nunca sube cambios directo a `main` ni reescribe su historial.
- **Solo se detiene para los puntos de validación V1 a V7 de `PLAN-DE-TRABAJO.md`:** cuentas y claves, textos legales, excepciones a las reglas que no se negocian, envío de código o datos a terceros, producción y decisiones de negocio. Mientras espera, sigue con lo que no dependa de ese punto.
- **Mauricio es principiante en lo técnico.** Todo lo que se le pida (cuentas, claves, configuraciones, revisiones) va con un paso a paso numerado: dónde hacer clic, qué escribir y cómo saber que quedó bien. Sin jerga sin explicar.
- **Datos de prueba siempre ficticios** (la semilla de Turbaco del prototipo). Nunca use datos de personas reales.
- Si una tarea necesita una cuenta o clave que no está en el entorno, deje el código listo detrás de una variable, documente cómo activarla y siga con lo demás.
- Antes de abrir el PR deben pasar el *typecheck*, el *lint* y las pruebas.

## Diseño

- Siga la dirección visual del prototipo: «sala de situación», mapa protagonista, grafito oscuro con acento #1F5BFF, tipografía Archivo y semáforo verde, ámbar y rojo.
- Skills de diseño disponibles en `.claude/skills/`:
  - `frontend-design` y `ui-ux-pro-max` para pantallas nuevas;
  - `emil-design-eng` y `animate` para pulido y movimiento;
  - `mobile-native` y `animate-expo` para la app;
  - `break-ui` para probar cada pantalla con datos extremos.
  - `superdesign` para explorar variantes visuales en el lienzo de Superdesign (servicio externo: envía código del proyecto a sus servidores; muestre la lista de archivos y pida aprobación antes de cada envío, y nunca envíe `.env` ni datos de personas).
  - `cumplimiento-electoral`: úsela para revisar cualquier cambio que toque datos de personas o mensajería.
- La interfaz es por rol (candidato, gerente, coordinador, líder, testigo). No vuelva a un menú único con todas las opciones.

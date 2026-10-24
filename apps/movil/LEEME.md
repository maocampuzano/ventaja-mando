# App del líder y del testigo

Expo (React Native) para Android e iOS. Funciona sin señal desde el primer día: todo lo que se registra queda en
SQLite, en el teléfono, y se envía solo cuando vuelve la señal, sin duplicar (ver `packages/nucleo/src/sincronizacion.ts`).

Cada rol entra a su propio espacio:

- **Líder:** tareas de hoy, registrar persona con su autorización, escanear planilla, su gente (con el botón de
  WhatsApp que abre el chat en su propio teléfono; la app no envía nada) y su meta.
- **Testigo:** su mesa, reportar la apertura, la foto del E-14 y las novedades.

Arriba siempre está la franja de envíos: verde (todo enviado), ámbar (esperando señal) o rojo (algo con problema, con
el motivo, para corregirlo o descartarlo).

## Correr la app

Desde la raíz del repositorio:

| Comando | Qué hace |
|---|---|
| `npm run start -w apps/movil` | Abre Expo. Con la app Expo Go del teléfono se lee el QR y la app abre en el celular. |
| `npm run web -w apps/movil` | La misma app en el navegador (solo para demos; guarda en memoria en vez de SQLite). |
| `npm test -w apps/movil` | Pruebas del almacén SQLite (con el SQLite de Node), del registro y del modo demo. |
| `npm run test:e2e -w apps/movil` | Pruebas de Playwright sobre la vista web, en modo demo. |

Por defecto la app está en **modo demo**: datos ficticios de Turbaco, cuentas `lider@demo.co` y `testigo@demo.co`
(cualquier contraseña) y un interruptor «Simular sin señal» para ver la cola en acción.

Con `MODO_DATOS=supabase`, `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` usa el proyecto real. Solo entran usuarios
con membresía de líder o testigo; la dirección y los coordinadores usan el panel web.

## Fotos

Las fotos (planillas, E-14 y formato de autorización firmado) van al bucket privado `evidencias` de Supabase, en
`<campaña>/<usuario>/<identificador de la operación>.jpg`. Cada usuario solo sube y reemplaza en su carpeta, y la
dirección de la campaña las ve todas. Al reintentar, la foto se sube a la misma ruta y reemplaza a la anterior.

## Lo que falta

- La cuenta de Expo (V2) para compilar la app y probarla en un teléfono real.
- La revisión jurídica del texto de autorización y de la aceptación en pantalla (V3).
- La tipografía Archivo en la app (hoy usa la del sistema).

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

Por defecto la app está en **modo demo**: datos ficticios del Caquetá, cuentas `lider@demo.co` y `testigo@demo.co`
(cualquier contraseña) y un interruptor «Simular sin señal» para ver la cola en acción.

Con `MODO_DATOS=supabase`, `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` usa el proyecto real. Solo entran usuarios
con membresía de líder o testigo; la dirección y los coordinadores usan el panel web.

## Fotos

Las fotos (planillas, E-14 y formato de autorización firmado) van al bucket privado `evidencias` de Supabase, en
`<campaña>/<usuario>/<identificador de la operación>.jpg`. Cada usuario solo sube y reemplaza en su carpeta, y la
dirección de la campaña las ve todas. Al reintentar, la foto se sube a la misma ruta y reemplaza a la anterior.

## Compilar la APK de Android

La APK se compila en la nube de Expo (EAS Build), porque este equipo no tiene el kit de Android. Hace falta la clave
`EXPO_TOKEN` en el `.env` de la raíz (ver `.env.example`) y, una sola vez, las variables del proyecto real en Expo:
`SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` en el ambiente `preview` (`eas env:create`). Luego, desde `apps/movil`:

| Comando | Qué hace |
|---|---|
| `npx eas-cli build -p android --profile apk` | APK con el proyecto real de Supabase (perfil `apk` de `eas.json`). |
| `npx eas-cli build -p android --profile apk-demo` | APK en modo demo, con datos ficticios. |

La compilación tarda unos 15 minutos y deja un enlace para descargar el `.apk`. La firma la guarda Expo.

## E-14 en la APK

- Cámara o galería (varias a la vez, solo JPG o PNG). Cada foto se reduce a 1.600 px y se guarda en la memoria
  privada de la app (`fotos/`), no en la caché, con su huella (MD5) para no repetirla.
- Estados: pendiente, enviando, enviada y error. La foto se borra del teléfono 7 días después de que el servidor la
  confirme; nunca antes. No se puede cerrar sesión mientras quede algo por enviar.
- Antes de enviar, la app confirma con el servidor que hay conexión real (`ping_movil`). Envía al abrir, al volver la
  señal, cada 20 s con la app abierta y cada 20 min en segundo plano (Android puede demorarlo un poco).
- El servidor rechaza la misma foto dos veces para la misma campaña (`acta_e14.foto_hash`) y responde «ya estaba».

## Lo que falta

- Probar la APK en un teléfono Android real con modo avión.
- La revisión jurídica del texto de autorización y de la aceptación en pantalla (V3).
- La tipografía Archivo en la app (hoy usa la del sistema).

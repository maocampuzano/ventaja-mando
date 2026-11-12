# Crear una campaña después de una venta

Las campañas **no se registran solas** en Comando: las crea XYZ Creatia cuando se cierra la venta (decisión del 12/11/2026). Así nadie usa el producto sin contrato y cada cliente arranca con su territorio listo.

## Qué hace

Con un solo comando:

1. Crea la campaña con su cargo, su territorio, la fecha de la elección, la meta de votos y, si ya se conoce, el tope de gastos del CNE.
2. Crea las zonas de trabajo:
   - **Gobernación:** una zona por cada municipio del departamento.
   - **Alcaldía o concejo:** una zona por comuna, si están cargadas; si no, una sola zona con todo el municipio, que el gerente divide después.
3. Crea la invitación del **gerente**, que vence en 14 días, y entrega el enlace y un texto listo para enviárselo.

Desde ahí el gerente sigue solo: al entrar, la pantalla «Hoy» le muestra los siete pasos para poner la campaña en marcha.

## Lo que necesita tener a mano

| Dato | Ejemplo | Dónde sale |
|---|---|---|
| Nombre de la candidatura | Laura Méndez | El contrato |
| Cargo | Gobernación del Caquetá | El contrato |
| Código DANE del territorio | `18` (Caquetá) o `18001` (Florencia) | 2 dígitos para un departamento, 5 para un municipio. Se buscan en la página del DANE «DIVIPOLA». |
| Fecha de la elección | 31/10/2027 | Calendario de la Registraduría |
| Meta de votos | 74.000 | La define la campaña |
| Correo del gerente | gerente@campana.co | La persona que va a dirigir la campaña en Comando |
| Tope de gastos (opcional) | 450.000.000 | La resolución del CNE para ese cargo y territorio. Si todavía no está, el gerente lo pone después. |

## Cómo hacerlo

**La forma más fácil:** escríbale a Claude en esta carpeta algo como «Crea la campaña de Laura Méndez a la Gobernación del Caquetá, elección el 31/10/2027, meta 74.000, gerente gerente@campana.co». Claude corre el comando, le muestra el enlace y le confirma que quedó bien.

**Si prefiere hacerlo usted:**

1. Abra la Terminal en la carpeta `ventaja-mando`.
2. Pegue esto, cambiando los datos de ejemplo por los reales:
   ```bash
   node --env-file=.env supabase/scripts/crear-campana.mjs --nombre "Laura Méndez" --cargo "Gobernación del Caquetá" --dane 18 --eleccion 31/10/2027 --meta 74000 --gerente gerente@campana.co --tope 450000000
   ```
3. Presione Enter.

**Quedó bien si** aparece «Campaña creada», el número de zonas y un enlace que empieza por `https://` y termina en `?invitacion=…`.

**Si sale «No se creó la campaña»**, el mensaje dice qué corregir (por ejemplo, un código DANE que no existe o una fecha pasada). Corríjalo y vuelva a pegar el comando.

## Después

1. Copie el texto que aparece al final y envíeselo al gerente **desde su propio WhatsApp** (regla 1: nada de envíos automáticos por WhatsApp).
2. El gerente abre el enlace, crea su cuenta con ese mismo correo y activa el código de su celular.
3. Si el enlace vence (14 días) o el gerente perdió el mensaje, vuelva a correr el comando con los mismos datos **solo si la campaña no se creó**; si ya existe, pídale a Claude una invitación nueva para ese gerente.

## Seguridad

- El comando usa la clave de servicio de Supabase, que vive solo en el archivo `.env` de este computador. Nunca la comparta ni la pegue en un chat.
- Ninguna persona del panel puede crear campañas: la base lo impide y hay una prueba que lo verifica.
- Cada campaña creada queda en la auditoría.

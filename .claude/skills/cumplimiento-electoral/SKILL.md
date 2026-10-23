---
name: cumplimiento-electoral
description: Revisa un cambio de Ventaja Mando contra las reglas de datos personales (Ley 1581 de 2012), las políticas de WhatsApp y el riesgo penal electoral antes de abrir un PR. Úsela siempre que el cambio toque datos de personas, autorizaciones, mensajería, exportaciones, solicitudes ciudadanas, la IA o el día electoral.
---

# Revisión de cumplimiento electoral

Recorra esta lista contra el diff. Por cada punto que falle, corríjalo o explique en el PR por qué no aplica. Ponga en la descripción del PR una sección «Cumplimiento» con el resultado.

## Datos personales (Ley 1581 de 2012)

- [ ] Cada persona nueva entra con un registro en `autorizacion` (finalidades, canal, fecha y evidencia). No hay caminos de creación que lo salten: importación, OCR, formulario, enlace público o API.
- [ ] Si se revoca la autorización, la persona sale de las colas de contacto, de los segmentos y de las exportaciones.
- [ ] La opinión política o intención de voto **individual** solo vive en `preferencia_politica`, solo si la campaña la activó y con una autorización marcada `sensible = true`. Los informes de intención son agregados.
- [ ] La cédula se guarda cifrada. Las búsquedas usan `documento_hash`. La cédula completa no aparece en registros, mensajes de error ni respuestas de la API.
- [ ] Toda tabla nueva con datos de personas tiene RLS y una prueba que lo verifica.
- [ ] Las exportaciones quedan en `auditoria` con usuario, filtro y cantidad, y llevan marca de agua.
- [ ] Las solicitudes de titulares (conocer, actualizar, suprimir) tienen plazo visible y se pueden cumplir desde la interfaz.

## Mensajería

- [ ] No hay envío automático por WhatsApp, ni conexión por QR ni librerías no oficiales. Solo enlaces `wa.me` que la persona envía a mano.
- [ ] SMS y correo solo a contactos con autorización vigente para esa finalidad, con baja en un paso, y la baja se respeta en todos los canales.
- [ ] Los textos generados por IA se revisan antes de enviarse; no hay envío directo desde Strategos.

## Riesgo penal electoral

- [ ] Las solicitudes ciudadanas no tienen campos de valor monetario ni se cruzan con la intención de voto o el compromiso de la persona.
- [ ] Ninguna pantalla, informe ni texto sugiere condicionar ayudas, empleo o beneficios al voto.
- [ ] El índice de cumplimiento de líderes contra el E-14 es agregado por mesa y lleva su advertencia: no identifica votos individuales ni prueba causalidad.
- [ ] La consolidación de E-14 se presenta como «consolidación privada de la campaña» y nunca como resultado oficial.

## IA

- [ ] Las herramientas de Strategos devuelven agregados, nunca filas de personas. Hay una prueba que lo verifica.
- [ ] Las respuestas citan sus fuentes de datos y presentan los escenarios con sus supuestos.
- [ ] La lectura de planillas y del E-14 exige revisión humana antes de guardar.

## Consultas oficiales

- [ ] No hay consultas masivas de puesto de votación con cédulas de terceros en fuentes de la Registraduría.

# Ventaja Mando: prototipo navegable

Prototipo para mostrar en las entrevistas con gerentes de campaña (fase 0 del plan, ver `../02-diseno-producto.md`). **Todos los datos son ficticios**: una campaña inventada a la Alcaldía de Turbaco, con zonas hexagonales ilustrativas que no son barrios ni límites oficiales.

## Cómo abrirlo

Desde una terminal:

```bash
cd "/Users/mauriciocampuzano/Documents/ClaudeMauricio/Desarrollo WEB/APPpolitica/prototipo"
npm run dev
```

Luego abra http://localhost:5173 en el navegador.

**Versión publicada (privada):** https://claude.ai/artifact/FEMXyZNQTjAvCCkVT2zE4z, para abrir desde el celular. Para actualizarla: `npm run build` y luego volver a armar `publicar/ventaja-mando.html` a partir de `dist/index.html` (sin las etiquetas html, head ni body) y publicarlo de nuevo desde Claude a la misma dirección.

## Qué se puede mostrar

Arriba a la derecha, **«Ver como»** cambia de rol. Cada rol ve solo lo suyo:

| Rol | Pantallas |
|---|---|
| **Gerente** | Mando (mapa + Strategos), Líderes, Planillas, Día E, Datos |
| **Coordinador** | Mando, Líderes, Planillas |
| **Candidata** | Resumen de una pantalla, Mando, Día E |
| **Líder** | Su celular: tareas de hoy, escanear planilla, su meta |
| **Testigo** | Su celular el día E: foto del E-14 y novedades |

**Recorrido sugerido para una demo (5 minutos):**
1. **Mando:** cambie las capas del mapa («Qué hacer en cada zona», «Alcance de la pauta», «Cobertura de testigos»). Toque una zona para ver su detalle.
2. **Strategos** (panel derecho): pregunte «¿Dónde actúo esta semana?» y apruebe una tarea. Aparece arriba como «tarea aprobada» y en el Resumen de la candidata.
3. **Líderes:** ordene de menor a mayor y abra uno con índice bajo. Se ve por qué está bajo (calidad, limpieza, tareas, meta) y el botón de WhatsApp de persona a persona.
4. **Planillas:** en el celular, «Tomar foto». Muestra la lectura, las dudas en ámbar, la cédula repetida en rojo y que no deja enviar hasta corregir.
5. **Día E:** «Iniciar simulacro de jornada». Las mesas se van poniendo azules a medida que llegan los E-14; las novedades se marcan como atendidas.
6. **Datos:** el argumento de cumplimiento (opinión política, WhatsApp, solicitudes ciudadanas).

## Cómo está hecho

- React 19 + TypeScript + Vite. El mapa es un SVG propio (`src/Mapa.tsx`), sin teselas ni servicios externos, para que funcione en la página publicada y sin conexión. En el producto real se usará MapLibre con teselas contratadas.
- `npm run build` genera un solo archivo, `dist/index.html`, con todo el código adentro.
- `src/data.ts`: datos ficticios generados con semilla fija; siempre salen iguales.
- `src/logic.ts`: la lógica del documento de diseño (índice del líder, recomendación tierra + pauta, cobertura de mesas, enlace de WhatsApp manual).
- No hay backend: Strategos responde con textos de ejemplo y nada se guarda, salvo las tareas aprobadas, que duran mientras la pestaña esté abierta.

## Pendiente

- En celular, el panel de Strategos y el detalle de zona del mando están ocultos.
- El mapa del prototipo no tiene calles de fondo: las zonas son ilustrativas.
- Faltan las pantallas de telemarketing, formularios y finanzas.

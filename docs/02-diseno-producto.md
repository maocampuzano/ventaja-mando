# Nuestra versión: diseño de producto y arquitectura

Versión 2, 23 de octubre de 2026. Nombre de trabajo: **Ventaja Mando**, el centro de mando de campaña de la familia Ventaja Electoral; el nombre final está por definir.

Es un diseño propio, escrito desde cero a partir del análisis funcional del mercado (ver `01-analisis-mercado.md`). No reutiliza código, textos, pantallas ni recursos de VOTOMAP.

**Qué cambió frente a la versión 1** (después de ver la plataforma por dentro y los PDF comerciales):
- **WhatsApp:** la API oficial no admite campañas. Se rediseñó el canal de mensajería (sección 3.2).
- **Pauta:** VOTOMAP sí vende pauta, pero como servicio de agencia. Nuestro diferencial es tenerla **dentro del producto**, cruzada con el territorio.
- **Paridad:** se agregaron OCR de planillas, telemarketing, inscripción pública por rol, finanzas, solicitudes ciudadanas, GIS, agenda y el índice de cumplimiento contra el E-14.
- **Cumplimiento:** nuevo eje de producto para el manejo de datos sensibles (opinión política), las ayudas y el WhatsApp.

---

## 1. La idea en una frase

**El centro de mando que une tierra, pauta y datos en un solo mapa, simple por rol y con las reglas cumplidas, para que a la campaña no le bloqueen el WhatsApp ni le caiga una investigación por sus datos en plena recta final.**

## 2. Paridad: lo que hay que tener para competir

| Módulo | Nuestro enfoque |
|---|---|
| CRM de votantes, líderes y militancia | Estados de contacto y de operación (transporte, visita, seguimiento). La «calidad del dato» se ve en cada cifra: bruto, validado y comprometido. |
| Importación de Excel y duplicados | Asistente que reconoce las columnas solo. Regla de duplicados explicable (sección 7.1). |
| **OCR de planillas** | Generador de planilla imprimible con un QR que identifica al líder y al lote. Foto, PDF o cámara en lote, lectura con IA y **revisión humana obligatoria**. |
| **Inscripción pública por rol** | Enlace y QR por rol (líder, voluntario, testigo de mesa, testigo de escrutinio, abogado), con la autorización de datos ya integrada. |
| Territorio DIVIPOLE → puesto y mesa | Capas oficiales abiertas, **importación GIS** (GeoJSON, KML, Shapefile) y geocodificación masiva, con fuente y fecha a la vista. |
| Formularios, encuestas y QR | Constructor visual. Todo funciona sin conexión. |
| **Telemarketing / call center** | Colas de llamadas por grupo y territorio, guion con IA, resultado de cada llamada y avance diario. |
| Roles y permisos por territorio | Seguridad a nivel de fila en la base de datos. 2FA obligatorio para administradores. |
| Partidos multicandidato | Panel de directiva y cruce entre candidatos **sin revelar datos personales** al otro candidato. |
| Testigos, incidencias y E-14 | Complementa Comitium (CNE): coordinación interna, lectura asistida del E-14 con revisión humana y consolidación privada. |
| **Índice de cumplimiento del líder** | Antes de la elección, un índice con sus componentes a la vista. Después, la comparación **agregada por mesa** contra el E-14 (sección 7.3). |
| **Finanzas de campaña** | Presupuesto, ingresos y gastos, **topes** y soportes, con exportación en el formato de Cuentas Claras para el contador. Incluido en el plan Regional y no «por activación». |
| **Solicitudes ciudadanas** | Seguimiento de peticiones de la comunidad **sin campo de valor monetario** y separado de la base electoral (sección 3.3). |
| Agenda y eventos | Calendario con lugares en el mapa, asistentes por QR y tareas posteriores. |
| Asistente IA | Ver la sección 3.4. |
| App móvil | Android e iOS en las tiendas, con enlace directo y QR de invitación por líder. |

## 3. Lo que nos pone por encima

### 3.1 Tierra + pauta en un solo mapa (la ventaja de Ventaja Electoral)

VOTOMAP vende la pauta como servicio de agencia, por fuera del software. Nosotros conectamos Meta Ads y Google Ads **dentro del producto** y cruzamos alcance y clics por municipio con la cobertura de líderes y votantes. Ejemplo: «En la comuna 5 hay alto alcance digital y pocos líderes: manda brigada. En Turbaco hay muchos líderes y poca pauta: sube el presupuesto allí» (sección 7.4).

### 3.2 Mensajería que no le bloquean a la campaña

Las políticas de WhatsApp no permiten a candidatos ni campañas usar su plataforma Business. Conectar un bot «por QR» (como WhatsApp Web) va contra esas reglas y expone el número a un bloqueo en plena campaña. Nuestro diseño:
- **WhatsApp solo de persona a persona:** botones «escribir por WhatsApp» (enlaces `wa.me` con el mensaje preescrito) para que **el líder envíe desde su propio teléfono**, uno por uno. Se registra que lo hizo, no el contenido. Sin bots ni envíos automáticos.
- **Automatización por canales que sí lo permiten:**
  - SMS y correo, a contactos autorizados y con opción de baja;
  - un asistente en la **web de la campaña** (chat propio);
  - **Telegram**;
  - Messenger e Instagram, según la elegibilidad y las políticas de Meta vigentes en el país.
- **Grupos de WhatsApp por territorio:** la plataforma genera el enlace de invitación y lleva la cuenta de quién entró. Los grupos los administran personas.

Esto se vende como **tranquilidad**: «su número no se cae el día 20 de octubre».

### 3.3 Cumplimiento integrado (Ley 1581 y Código Penal)

- **Opinión política = dato sensible.** Por defecto no se guarda «voto duro / contrario» por persona. Se guarda el **nivel de relación con la campaña** (simpatizante, voluntario, líder) con autorización expresa, y los análisis de intención se hacen **en agregado** (por mesa o por barrio). Si una campaña necesita la clasificación individual, se activa con el aviso legal y el registro de la autorización expresa.
- **Autorización por persona:** cuándo, por qué canal, para qué finalidades, con evidencia, y revocable.
- **Derechos de los titulares:** solicitudes para conocer, actualizar o suprimir datos, con plazos legales y bitácora.
- **Solicitudes ciudadanas sin «valor estimado»** y sin vínculo con el estado electoral de la persona. Las ayudas no se registran como contrapartida. Esto protege al candidato del riesgo de corrupción al sufragante.
- **Sin consulta masiva de cédulas** en fuentes de la Registraduría. El puesto lo informa el titular, o este lo consulta en un enlace oficial.
- **Auditoría** de exportaciones y accesos, y exportaciones con marca de agua.

### 3.4 Strategos con herramientas, no solo chat

El asistente (Claude) consulta **vistas agregadas** con herramientas controladas (cobertura, metas, histórico, pauta, llamadas) y **propone tareas concretas** que el gerente aprueba con un clic: asignar una brigada, abrir una cola de llamadas o programar un SMS. Cada respuesta muestra **de qué datos salió** y nunca presenta un pronóstico como certeza.

### 3.5 Simple por rol

En vez de 24 opciones en una barra lateral, **cinco espacios** según quién entra:

| Rol | Ve |
|---|---|
| **Candidato** | Un tablero de una sola pantalla: cómo vamos, dónde actuar y qué aprobé hoy. |
| **Gerente** | El centro de mando con mapa, equipo, tareas, pauta y Strategos. |
| **Coordinador** | Su territorio, sus líderes, metas y alertas. |
| **Líder (celular)** | Mis tareas de hoy, registrar persona, escanear planilla y mis metas. |
| **Testigo (celular, día E)** | Mi mesa, la foto del E-14 y reportar una incidencia. |

### 3.6 Más ventajas

- **Sin conexión de verdad** en veredas y corregimientos, con estados claros: pendiente, enviado y revisado.
- **Precio público y alta el mismo día** para concejo y JAL.
- **Diseño que gana demos:** el mapa como protagonista, modo oscuro tipo sala de mando y animaciones discretas.

### Lo que deliberadamente no haremos

- Bots o envíos automáticos por WhatsApp.
- Consultas masivas de puesto con cédulas de terceros.
- Ayudas ligadas a la intención de voto o con valor monetario por persona.
- «Detección de fraude» o «predicción de resultados» presentadas como certeza. Hablamos de **alertas para revisión** y de **escenarios con supuestos**.

## 4. Dirección visual

- **Concepto:** «sala de situación». El mapa ocupa la pantalla y los paneles flotan encima.
- **Paleta:** el azul eléctrico de Ventaja Electoral (#1F5BFF) como acento sobre un grafito profundo, en modo oscuro, o blanco limpio, en modo claro. Verde, ámbar y rojo se reservan para el semáforo.
- **Tipografía:** Inter o Geist, con números tabulares.
- **Pantallas clave:**
  1. Centro de mando.
  2. Perfil del territorio.
  3. Bandeja del líder (celular).
  4. Escáner de planillas (celular).
  5. Día E (cuadrícula de mesas con semáforo).
  6. Strategos (chat lateral con tarjetas de «tarea propuesta»).
- **Movimiento:** 150 a 250 ms, vuelos suaves en el mapa y respeto por la opción de reducir movimiento.

## 5. Arquitectura propuesta

```
[App móvil Expo/React Native]──┐      ┌──[Panel web React + Vite + TS]
   SQLite local + cola de sync  │      │   MapLibre GL + deck.gl
                                ▼      ▼
                       [API: Supabase]
          Postgres + PostGIS + RLS · Auth (2FA) · Storage · Realtime
                                │
   ┌────────────┬───────────────┼──────────────┬───────────────────┐
[Funciones edge] [Worker IA]  [Conectores pauta] [Mensajería oficial] [OCR]
 importación,     Claude con    Meta Ads,          SMS, correo, chat   Claude visión:
 duplicados,      tools sobre   Google Ads         web, Telegram,      planillas y E-14,
 exportaciones    vistas        (OAuth del         Messenger/IG        siempre con
                  agregadas     cliente)           según política      revisión humana
```

- **Supabase:** el aislamiento por campaña y territorio lo garantiza la base de datos (RLS). Trae autenticación con 2FA, almacenamiento de fotos y tiempo real para el día E. PostGIS resuelve el mapa.
- **Mapas:** MapLibre, libre y sin cobro por carga (VOTOMAP usa Mapbox, que sí cobra por uso).
- **IA:** Claude con *tool use* sobre vistas agregadas. Para el OCR de planillas y del E-14 se usa visión, siempre con revisión humana.
- **Infraestructura:** frontend en Cloudflare Pages y Supabase en São Paulo.

## 6. Modelo de datos (núcleo)

```sql
organizacion(id, tipo[partido|campana], nombre, marca_json)
campana(id, organizacion_id, cargo, circunscripcion_divipole, eleccion_fecha, meta_votos)
usuario(id, auth_id, nombre, telefono, mfa_activo)
membresia(usuario_id, campana_id, rol, territorio_ids[])                -- base del RLS
territorio(id, codigo_divipole, nivel, nombre, padre_id, geom, fuente, fecha_fuente)
capa_gis(id, campana_id, nombre, geom, fuente, licencia, fecha)
puesto(id, codigo, nombre, territorio_id, geom, mesas, fuente, fecha_fuente)
persona(id, campana_id, documento_cifrado, documento_hash, nombre, telefono,
        territorio_trabajo_id, puesto_id NULL, mesa NULL, origen[formulario|ocr|importacion|enlace],
        lider_id, relacion[simpatizante|voluntario|lider|testigo],
        estado_contacto, necesidades[], creado_por, creado_en, geom NULL)
preferencia_politica(persona_id, nivel, autorizacion_id)                 -- OPCIONAL, tabla aparte, dato sensible
autorizacion(id, persona_id, finalidades[], sensible bool, canal, evidencia_url, fecha, revocada_en)
solicitud_titular(id, persona_id, tipo[conocer|actualizar|suprimir], estado, vence_en)
lote_ocr(id, campana_id, lider_id, archivo_url, estado) · fila_ocr(lote_id, datos, confianza, revisada_por)
lider(id, campana_id, usuario_id, territorio_ids[], meta)
formulario(id, campana_id, esquema_json, version) · respuesta(formulario_id, persona_id, datos, geom, capturado_en, sincronizado_en)
tarea(id, campana_id, tipo, territorio_id, asignado_a, estado, origen[manual|ia])
cola_llamadas(id, campana_id, territorio_id, guion) · llamada(cola_id, persona_id, resultado, agente_id, en)
mensaje(id, campana_id, canal[sms|email|web|telegram|messenger|wa_manual], segmento, plantilla, enviado_en)
solicitud_ciudadana(id, campana_id, persona_id NULL, tema, estado, responsable, seguimiento)   -- sin valor monetario
finanza_movimiento(id, campana_id, tipo[ingreso|gasto], rubro, valor, soporte_url, aportante_id, tope_id)
testigo(id, campana_id, persona_id, puesto_id, mesa, tipo[mesa|escrutinio|abogado], estado)
incidencia(id, campana_id, puesto_id, mesa, tipo, descripcion, evidencia_url, reportado_por, hora, estado)
acta_e14(id, campana_id, puesto_id, mesa, foto_url, extraccion_json, revisada_por, estado)
pauta_metrica(campana_id, plataforma, fecha, territorio_id, alcance, clics, gasto)
historico_resultado(eleccion, territorio_id, puesto_id, candidato_o_partido, votos)       -- datos abiertos
auditoria(id, usuario_id, accion, entidad, entidad_id, en, detalle)
```

La preferencia política va **en una tabla aparte y opcional**, ligada a una autorización marcada como sensible. Se puede apagar por campaña sin tocar el resto.

## 7. Lógica clave (TypeScript limpio, diseño propio)

### 7.1 Posibles duplicados, explicables

```ts
type Persona = { id: string; documentoHash?: string; nombre: string; telefono?: string; territorioId: string };
type Coincidencia = { a: string; b: string; puntaje: number; razones: string[] };

const normaliza = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

function similitudNombre(x: string, y: string): number {
  const a = new Set(normaliza(x).split(" ")), b = new Set(normaliza(y).split(" "));
  const inter = [...a].filter(t => b.has(t)).length;
  return inter / Math.max(a.size, b.size);          // Jaccard por tokens: 0..1
}

export function evaluarPar(p: Persona, q: Persona): Coincidencia | null {
  const razones: string[] = []; let puntaje = 0;
  if (p.documentoHash && p.documentoHash === q.documentoHash) { puntaje += 0.7; razones.push("mismo documento"); }
  if (p.telefono && p.telefono === q.telefono)                 { puntaje += 0.3; razones.push("mismo teléfono"); }
  const sn = similitudNombre(p.nombre, q.nombre);
  if (sn >= 0.75)                                              { puntaje += 0.2 * sn; razones.push(`nombre similar (${Math.round(sn * 100)} %)`); }
  if (p.territorioId === q.territorioId)                       { puntaje += 0.05; razones.push("mismo territorio"); }
  return puntaje >= 0.5 ? { a: p.id, b: q.id, puntaje: Math.min(1, puntaje), razones } : null;
}
// El teléfono pesa 0,3 (antes 0,2, ajustado el 24/10/2026): mismo celular y mismo nombre sin cédula sí llegan al umbral.
// Se agrupan los candidatos por documento o teléfono para no comparar todos contra todos (sin ninguno de los dos, un par no llega al umbral).
// Es una SUGERENCIA: una persona decide fusionar, y la fusión queda en la auditoría.
```

### 7.2 Brechas de cobertura del día electoral

```ts
type Mesa = { puestoId: string; mesa: number; testigoId?: string; votosHistoricos: number };

export function prioridadCobertura(mesas: Mesa[]) {
  return mesas
    .filter(m => !m.testigoId)
    .map(m => ({ ...m, prioridad: m.votosHistoricos }))   // primero, las mesas sin testigo donde hay más votos en juego
    .sort((x, y) => y.prioridad - x.prioridad);
}
export const porcentajeCobertura = (mesas: Mesa[]) =>
  mesas.length ? mesas.filter(m => m.testigoId).length / mesas.length : 0;
```

### 7.3 Índice del líder: antes (componentes) y después (contra el E-14, agregado)

```ts
type StatsLider = { registrados: number; validados: number; duplicadosConOtros: number; tareasHechas: number; tareasAsignadas: number; meta: number };

export function indiceLider(s: StatsLider) {
  const calidad    = s.registrados ? s.validados / s.registrados : 0;              // qué tanto de lo que trae es real
  const limpieza   = s.registrados ? 1 - s.duplicadosConOtros / s.registrados : 1; // castiga las listas infladas
  const ejecucion  = s.tareasAsignadas ? s.tareasHechas / s.tareasAsignadas : 0;
  const avanceMeta = s.meta ? Math.min(1, s.validados / s.meta) : 0;
  const total = 0.35 * calidad + 0.25 * limpieza + 0.2 * ejecucion + 0.2 * avanceMeta;
  return { total, componentes: { calidad, limpieza, ejecucion, avanceMeta } };     // la interfaz muestra los cuatro
}

// Después de la elección: comparación AGREGADA por mesa. Nunca dice cómo votó una persona.
type MesaLider = { apoyosRegistrados: number; votosCandidatoE14: number; votosCandidatoHistorico: number };

export function cumplimientoPost(mesas: MesaLider[]) {
  const apoyos = mesas.reduce((a, m) => a + m.apoyosRegistrados, 0);
  const votos  = mesas.reduce((a, m) => a + m.votosCandidatoE14, 0);
  const base   = mesas.reduce((a, m) => a + m.votosCandidatoHistorico, 0);
  return {
    cobertura: apoyos ? Math.min(1, votos / apoyos) : 0,  // votos obtenidos frente a apoyos que el líder registró en esas mesas
    crecimiento: base ? (votos - base) / base : null,      // frente al histórico: no prueba causalidad
    advertencia: "Indicador agregado por mesa; no identifica votos individuales ni prueba el aporte causal del líder.",
  };
}
```

### 7.4 Recomendación tierra + pauta por territorio

```ts
type Señal = { territorioId: string; alcanceDigital: number; lideres: number; validados: number; potencial: number };

export function recomendar(s: Señal[]) {
  const max = (k: keyof Señal) => Math.max(1, ...s.map(x => x[k] as number));
  return s.map(x => {
    const digital = x.alcanceDigital / max("alcanceDigital");
    const tierra  = x.validados / max("validados");
    const brecha  = x.potencial / max("potencial");
    const accion =
      digital > 0.6 && tierra < 0.3 ? "Enviar brigada: hay atención digital sin estructura" :
      tierra > 0.6 && digital < 0.3 ? "Subir pauta: hay estructura sin visibilidad" :
      brecha > 0.6 && digital < 0.3 && tierra < 0.3 ? "Territorio de oportunidad: plan conjunto" :
      "Mantener";
    return { territorioId: x.territorioId, digital, tierra, brecha, accion };
  });
}
```

### 7.5 Mensaje por WhatsApp de persona a persona (sin automatización)

```ts
// El líder toca el botón y su propio WhatsApp se abre con el texto listo. Lo envía él.
export function enlaceWhatsAppManual(telefonoE164: string, texto: string) {
  return `https://wa.me/${telefonoE164.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`;
}
// Solo se registra "el líder abrió el contacto": ni el contenido ni la lectura. La persona debe tener autorización vigente.
```

## 8. Planes y precio (propuesta para validar)

| Plan | Para quién | Incluye | Precio de referencia* |
|---|---|---|---|
| **Local** | Edil (JAL) o concejo | CRM, app sin conexión, OCR (cupo), mapa, 10 líderes | Precio público mensual, alta en el mismo día |
| **Municipal** | Alcaldía o concejo grande | + testigos y E-14, telemarketing, SMS y correo, Strategos básico | Precio público mensual |
| **Regional** | Gobernación, asamblea o Cámara | + pauta Meta/Google integrada, finanzas, Strategos completo | Cotización con base pública |
| **Partido** | Directivas | + panel multicandidato, cruce entre candidatos, auditoría | Licencia institucional |

\* Fijar los valores después de hablar con 5 a 10 campañas reales. **Publicar el precio de los dos primeros planes**, que es donde VOTOMAP es opaco.

**Venta cruzada:** los planes Regional y de Partido pueden sumar el servicio de pauta de Ventaja Electoral. El software alimenta la pauta y la pauta se ve en el software.

## 9. Ruta hasta las territoriales de octubre de 2027

| Fase | Fecha objetivo | Entregable |
|---|---|---|
| 0. Validación | Nov 2026 | 5 a 10 entrevistas con gerentes de campaña y prototipo navegable del centro de mando |
| 1. MVP | Ene-Feb 2027 | CRM, importación, duplicados, territorio, roles, mapa, app del líder sin conexión y **OCR de planillas** |
| 2. Campaña | Mar-May 2027 | Formularios, tareas, índice de líder, telemarketing, SMS y correo, Strategos con herramientas |
| 3. Diferencial | May-Jul 2027 | Conectores Meta/Google Ads, recomendación tierra + pauta, panel de partido y finanzas |
| 4. Día E | Ago-Sep 2027 | Testigos, incidencias, E-14 asistido, cumplimiento contra el E-14 y simulacros |
| 5. Jornada | Oct 2027 | Soporte en vivo y análisis poselectoral |

Las fechas oficiales se toman del calendario de la Registraduría cuando se publique.

## 10. Próximos pasos sugeridos

1. Elegir el nombre definitivo y el dominio.
2. Construir el **prototipo navegable** del centro de mando y del escáner de planillas, con datos ficticios de un municipio (por ejemplo, Turbaco).
3. Pedir a un abogado de datos personales que valide el enfoque de la sección 3.3 (dato sensible, autorizaciones y solicitudes ciudadanas). Puede volverse el mejor argumento de venta frente a partidos.

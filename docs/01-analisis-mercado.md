# VOTOMAP: análisis funcional y competitivo

Versión 2, 23 de octubre de 2026. No se revisó el código de VOTOMAP: todo sale de lo que muestra a sus usuarios y al público.

**Fuentes:**
1. Páginas públicas de votomap.com, su `llms.txt`, `sitemap.xml`, el checklist de implementación y la plantilla territorial.
2. Dos PDF comerciales de VOTOMAP: *Presentación Comercial 2027* (21 págs.) y *Portafolio de Servicios Digitales* (26 págs.).
3. **Un recorrido grabado de 12 minutos** que hizo Mauricio por una **cuenta demo temporal** («Candidato Demo», plan PRO de 5 días, con datos ficticios), más los archivos que exportó durante el recorrido (plantilla de testigos, plantilla OCR y reporte en PDF).

El material está en `~/Documents/ClaudeMauricio/votomap-analisis/`.

---

## 1. Quién es

- **Empresa:** DRAN DIGITAL S.A.S., NIT 901.359.114, de Cartagena. El contacto comercial del portafolio es Natan David Chiquillo Sarabia (ceo@votomap.com, +57 323 393 6721); en la web también aparecen un WhatsApp +57 304 469 4815 y un Gmail personal.
- **Producto:** se presenta como «suite electoral rumbo a 2027», con 11 módulos y una extensión para partidos (*PartidoMap*). Su lema comercial: *«Gane el territorio. Proteja cada mesa. Mida cada líder.»*
- **Además vende servicios de agencia:**
  - diagnóstico de imagen del candidato y escucha social;
  - manejo de redes;
  - producción de video;
  - **pauta en Meta y Google/YouTube**;
  - landings y SMS y correo masivos.
- **Tecnología visible:** web en React alojada en Vercel, mapas con **Mapbox** y apps para Android e iOS, cuyo enlace se entrega por WhatsApp.

## 2. Lo que se ve dentro de la plataforma (recorrido de la cuenta demo)

El menú lateral tiene **24 secciones al mismo nivel**: Inicio, Centro de Control, Inteligencia PRO, Equipo Electoral, Testigos y Abogados, Votantes, Carga Masiva OCR, Galería de Evidencias, Formularios, Ayudas y gestiones, Encuestas, Mapa Electoral, Análisis, IA Electoral, Día de Votación, Bot WhatsApp, Actas E14, Consultar Puesto, Finanzas de campaña, Operación de Campo, Agenda y Configuraciones.

La barra superior muestra el alcance (Nacional), el plan («PRO ACTIVO · 5d»), el rol (Candidato), notificaciones y modo oscuro.

| Sección | Qué tiene |
|---|---|
| **Inicio** | Totales de votantes, líderes, registrados y encuestas. **«Cumpleaños de hoy» con saludos automáticos por WhatsApp.** Accesos rápidos y resumen de actividad. |
| **Votantes** | Tabla con cédula, nombre, edad, género, contacto, ubicación, puesto y mesa, líder y compromiso. Botones de duplicados, «mis duplicados» y sin puesto. Filtros por estado (sin contactar, contactado, confirmado, votó, no votó), por **compromiso** (voto duro, probable, indeciso, de opinión, comprometido con otro, contrario, abstencionista), por necesidad operativa (requiere transporte, seguimiento o visita), por influencia, por georreferencia y por líder. Importa y exporta Excel y **consulta puestos desde Excel**. |
| **Equipo Electoral** | Líderes (importar o agregar), grupos de líderes por localidad o zona del mapa, y testigos y abogados. Importa con plantilla Excel (tipo de testigo, cédula, nombres, celular, correo, departamento, municipio, puesto, mesa, agrupación política). Consulta DIVIPOLA. |
| **Administración del equipo electoral** | Contadores de testigos de mesa, testigos de escrutinio, abogados, en WhatsApp, sin puesto y con acceso. Pestañas: Enlaces, Testigos de mesa, Escrutinio, Abogados, **Telemarketing**, Grupos de WhatsApp, Denuncias/E14, Reportes, Colaboradores y Delegados. **Enlaces públicos de inscripción por rol** (testigo de mesa, de escrutinio, abogado) que **asignan al voluntario el grupo de WhatsApp de su departamento**. Acciones: asignar el puesto más cercano, habilitar acceso, etiquetar y reasignar grupo. |
| **Telemarketing** | Grupos de llamadas, carga de Excel a un grupo y asignación por departamento. Analítica: universo, contactados, no contestaron, aceptaron o no, cobertura de WhatsApp y de direcciones, quién necesita transporte o capacitación, disponibilidad del domingo y del lunes, crecimiento diario de 30 días y detalle por departamento. |
| **Carga Masiva OCR** | Cuatro pasos: (1) **genera una planilla PDF optimizada para OCR**, eligiendo campos y 5 a 15 filas por página; (2) foto o cámara directa, varias a la vez; (3) PDF de hasta 20 MB; (4) revisión antes de confirmar. El lote se asigna a un líder, departamento y municipio. Guarda historial. |
| **Galería de Evidencias** | Fotos de «confirmación de votos» que suben los líderes, por jornada. *En el recorrido mostró el error «No se pudieron cargar las evidencias».* |
| **Formularios** | Formularios de captación (votantes, líderes, voluntarios, eventos), en borrador o activos, con permisos por líder. |
| **Ayudas y gestiones** | Solicitudes ciudadanas con persona, tipo (por ejemplo educación), prioridad, estado, **valor estimado en COP**, fechas, responsable, lugar de entrega, resultado y foto privada. Advierte que «no deben condicionarse al voto». |
| **Encuestas** | Asistente de 3 pasos. Candidaturas: Senado, Cámara y Presidencia. Fechas, alcance, total de votos y tasa de conversión. |
| **Mapa Electoral** | Mapbox con filtros (departamento, municipio, barrio, grupo, líder) y capas: calor por puesto, calor por viviendas, viviendas de votantes y de líderes, y puestos. Permite dibujar zonas, marcar puntos y trazar líneas. **Importa capas GIS** (GeoJSON, KML, Shapefile, GeoPackage, CSV; hasta 32 MB). Tiene un catálogo de Colombia, **geocodificación masiva de direcciones** y concentración por barrio. |
| **Análisis Electoral** | Distingue dato verificado («REAL») de estimación («INFO»). Pestañas: equipo y territorio, preelectoral, votación, metas, mapa de calor, histórico e IA. Incluye ranking de líderes (directos y red), registros por día, localidades, **conversión política por líder** (voto duro y probable), metas por líder y comparativa entre jornadas. Exporta PDF y Excel. |
| **Inteligencia PRO** | «Strategos IA» (agente conversacional, **cupo de 500 consultas**) y «Consultas manuales» sobre «datos oficiales del gobierno colombiano». |
| **IA Electoral** | Chat estratégico, análisis predictivo («analizar participación» y «segmentación inteligente») y **generador de campañas**: WhatsApp, SMS, correo o guion de llamada, por segmento, objetivo y tono. *En el recorrido, el análisis predictivo se quedó cargando y no dio resultado.* |
| **Bot WhatsApp** | Saludos, conversaciones, «entrenar bot» (base de conocimiento con puntaje de calidad), analítica y configuración. **Se conecta escaneando un código QR desde WhatsApp.** Tiene pausas de 6 a 16 s simulando «escribiendo», pausas largas cada N mensajes, horario de 6:00 a 22:00, máximo 20 saludos diarios por emisor y uno cada 2 minutos, y un cupo de 10.000 mensajes al mes. |
| **Día de Votación / Centro de Control** | Se programan jornadas que se activan solas a las 00:00, una a la vez. Fuera de jornada, el centro de control queda inactivo. |
| **Actas E14** | «Sistema forense anti-fraude con IA»: total, procesadas, con alertas, críticas, altas y con contraste. Pestañas de contraste consolidado, patrones de fraude y mesas prioritarias. |
| **Finanzas de campaña (premium)** | Presupuesto, ingresos y gastos, **topes electorales**, aportantes y proveedores, alertas de fraccionamiento y duplicados, conciliación bancaria, soportes cifrados, reportes y auditoría. Se activa pidiéndolo por WhatsApp. |
| **Operación de Campo (premium)** | Levantamientos con formularios, equipos y capas GIS, más «solicitudes de datos pendientes». Se activa con el administrador. |
| **Agenda** | Calendario mensual y «lugares de reunión en Mapbox». |
| **Configuración** | Perfil, seguridad (contraseña y **2FA**), alertas y campaña (nombre, fecha, **meta de votos**, color). |

## 3. Lo que agregan los PDF comerciales

- **Tres «herramientas fundamentales»:**
  1. **Mapa electoral ciudadano:** el votante ve su puesto, la distancia y el tiempo a pie, en un enlace con la imagen del candidato.
  2. **Planillas a base de datos con OCR**, con **foto del simpatizante**.
  3. **E-14 en vivo + índice de cumplimiento de líderes:** antes de la elección, Strategos estima la probabilidad de que cada líder cumpla; después compara los votos del E-14 en las mesas del líder con los apoyos que registró.
- **El ciclo que venden:** registrar → ubicar → organizar → movilizar → proteger → medir.
- **Demo de 45 minutos:** «traiga una planilla real y véala convertida».
- **Sobre WhatsApp, su propio portafolio dice:** *«La API oficial no admite candidatos, campañas ni proveedores de servicios políticos. No se ofrece envío masivo electoral por esa vía.»* (Portafolio, pág. 15).

## 4. Fortalezas

1. **Es muy completa.** Cubre todo el ciclo, desde la planilla de papel hasta el E-14, y suma finanzas, telemarketing, GIS y agenda.
2. **El OCR de planillas está bien pensado:** genera la planilla adecuada, permite capturar en lote y obliga a revisar. Resuelve un dolor real (las cajas de planillas sin digitar) y es un gancho de demo muy fuerte.
3. **Es práctica para Colombia:** DIVIPOLA, E-14, testigos de mesa y de escrutinio, abogados, enlaces de inscripción por rol y grupos de WhatsApp por departamento.
4. **El índice de cumplimiento de líderes comparado con el E-14** es un argumento de venta potente para candidatos que desconfían de sus líderes.
5. **Su discurso de cumplimiento está muy cuidado** y tiene el mejor SEO del sector (79 artículos, páginas por país y por departamento, `llms.txt`).
6. **Combina software y agencia:** puede vender la operación completa, incluida la pauta.

## 5. Debilidades y riesgos (observados)

1. **Riesgo serio con WhatsApp.** El bot se conecta por QR, como WhatsApp Web, y no por la API oficial. Su propio portafolio reconoce que la API oficial no admite campañas. *Inferencia:* las pausas, los «escribiendo» simulados y los límites diarios sirven para evitar bloqueos. Eso va contra las condiciones de WhatsApp, y **el número de la campaña puede ser bloqueado justo en plena campaña**. Choca además con su propia página del bot, que habla de «plantillas aprobadas».
2. **Guarda datos sensibles por persona.** Clasificar a cada ciudadano como «voto duro», «contrario» o «comprometido con otro» es registrar su **opinión política**, que la Ley 1581 (art. 5) trata como **dato sensible** y exige autorización expresa. Lo mismo vale para la foto del simpatizante y su cédula.
3. **Ayudas con «valor estimado en COP»** ligadas a personas de la base electoral. Aunque advierte que no deben condicionarse al voto, el diseño roza la compra de votos (corrupción al sufragante, art. 390 del Código Penal).
4. **Navegación saturada:** 24 opciones al mismo nivel, sin flujo por rol. Hay duplicados aparentes (Centro de Control y Día de Votación; IA Electoral e Inteligencia PRO; Equipo Electoral y Testigos y Abogados).
5. **Funciones que fallaron en el recorrido:** el análisis predictivo se quedó cargando y la galería dio error. Hay módulos «premium» que se activan pidiéndolos por WhatsApp.
6. **Las promesas de la IA chocan con sus propios descargos.** Dice «sistema forense anti-fraude», «análisis predictivo» y «patrones de fraude», pero en la web aclara que la IA no detecta fraude ni predice resultados.
7. **Precios opacos.** No hay ninguna cifra pública.
8. **La pauta no está en el software.** Es un servicio aparte y el tablero de la plataforma no la cruza con el territorio.

## 6. Mapa competitivo

| Producto | Origen | Enfoque | Precio visible |
|---|---|---|---|
| **VOTOMAP** | Colombia | Suite completa + agencia | No |
| **Vote360** | Latinoamérica, desde 2012 | CRM, autorregistro, día de votación y testigos | ~500 USD (sin periodicidad) |
| **Votométrica** | Latinoamérica | Analítica electoral | Tarifa plana, sin cifra |
| **Socialitica** | Latinoamérica | CRM político | No |
| **Comitium en línea (CNE)** | Colombia, oficial | Testigos acreditados el día electoral | Gratis, uso restringido |
| **NationBuilder** | EE. UU. | CRM y web | Desde ~34 USD/mes |
| **Ecanvasser** | UE | Puerta a puerta | Desde ~99 USD/mes |

**Lectura del mercado:** VOTOMAP ya cubre en funciones casi todo lo que una campaña colombiana pide; **competirle solo con más funciones no alcanza**. El hueco está en cuatro cosas que hace mal o no hace:
1. cumplimiento real (WhatsApp, datos sensibles, ayudas);
2. una experiencia simple por rol;
3. la pauta integrada en el producto;
4. un precio transparente.

## Fuentes

- Páginas públicas de [votomap.com](https://www.votomap.com/), [llms.txt](https://www.votomap.com/llms.txt) y [checklist](https://www.votomap.com/recursos/checklist-implementacion-votomap.pdf)
- PDF de VOTOMAP: *Presentación Comercial 2027* y *Portafolio de Servicios Digitales* (entregados por Mauricio)
- Grabación del recorrido por la cuenta demo (`votomap-analisis/votomap.mov`)
- [Mozilla Foundation: respuestas de WhatsApp sobre elecciones](https://www.mozillafoundation.org/sw/blog/whatsapp-responds-to-our-elections-questions/)
- [Aos Fatos: veto de Meta a políticos en la API de WhatsApp Business](https://www.aosfatos.org/noticias/deputados-reuniao-whatsapp/)
- [DPL News: WhatsApp prohíbe mensajes masivos de partidos](https://dplnews.com/whatsapp-prohibe-enviar-mensajes-masivos-a-los-partidos-politicos-en-campana-electoral/)
- [Vote360 / Socialitica en GetApp](https://www.getapp.ca/software/2064202/socialitica) · [Votométrica en Capterra](https://www.capterra.ca/software/1114129/votometrica) · [Comitium, RCN Radio](https://newsroom.rcnradio.com/colombia/comitium-en-linea-asi-funciona-la-app-para-vigilar-las-elecciones-presidenciales-2026) · [G2: Ecanvasser vs NationBuilder](https://www.g2.com/compare/ecanvasser-vs-nationbuilder)

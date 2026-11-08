// Strategos: herramientas sobre vistas agregadas (regla 6). La IA nunca recibe filas de personas: recibe cifras por
// zona y el índice de cada líder bajo una referencia opaca («L-03»). El nombre del líder lo pone la pantalla, del lado
// de quien consulta, con la misma tabla de referencias (refsLideres). Cada resultado dice de qué datos salió.
import { indiceLider } from "./lider";
import { recomendar, textoAccion, type Accion } from "./territorio";

export type ZonaAgregada = {
  id: string; nombre: string; meta: number; potencial: number; bruto: number; validados: number; comprometidos: number;
  lideres: number; alcance: number; clics: number; gasto: number;
};
/** Un líder visto por Strategos: sin nombre, sin teléfono, sin ids de la base. */
export type LiderAgregado = {
  ref: string; zonaId: string; registrados: number; validados: number; duplicadosConOtros: number;
  tareasHechas: number; tareasAsignadas: number; meta: number;
};
export type DatosStrategos = {
  campana: { candidato: string; cargo: string; metaVotos: number; eleccion: string };
  zonas: ZonaAgregada[];
  lideres: LiderAgregado[];
};

export type TipoTarea = "brigada" | "llamadas" | "revision_lideres" | "pauta";
export type TareaPropuesta = { tipo: TipoTarea; titulo: string; detalle: string; zonas: string[]; lideres: string[] };
export type ResultadoHerramienta = { fuente: string; datos: unknown };

/**
 * Referencias opacas y estables para los líderes: se ordenan por id y se numeran. El servidor y el navegador llegan a
 * la misma tabla con los mismos ids, así que el navegador puede traducir «L-03» al nombre sin que el nombre viaje a la IA.
 */
export function refsLideres(ids: readonly string[]): Map<string, string> {
  const orden = [...new Set(ids)].sort();
  const ancho = Math.max(2, String(orden.length).length);
  return new Map(orden.map((id, i) => [id, `L-${String(i + 1).padStart(ancho, "0")}`]));
}

/**
 * Arma los datos de Strategos a partir del tablero. Copia campo por campo, a propósito: aunque el líder de entrada
 * traiga nombre o teléfono, no pasan.
 */
export function armarDatosStrategos(
  campana: DatosStrategos["campana"],
  zonas: readonly ZonaAgregada[],
  lideres: readonly (Omit<LiderAgregado, "ref"> & { id: string })[],
): DatosStrategos {
  const refs = refsLideres(lideres.map((l) => l.id));
  return {
    campana: { candidato: campana.candidato, cargo: campana.cargo, metaVotos: campana.metaVotos, eleccion: campana.eleccion },
    zonas: zonas.map((z) => ({
      id: z.id, nombre: z.nombre, meta: z.meta, potencial: z.potencial, bruto: z.bruto, validados: z.validados,
      comprometidos: z.comprometidos, lideres: z.lideres, alcance: z.alcance, clics: z.clics, gasto: z.gasto,
    })),
    lideres: lideres.map((l) => ({
      ref: refs.get(l.id)!, zonaId: l.zonaId, registrados: l.registrados, validados: l.validados,
      duplicadosConOtros: l.duplicadosConOtros, tareasHechas: l.tareasHechas, tareasAsignadas: l.tareasAsignadas, meta: l.meta,
    })),
  };
}

const r2 = (x: number) => Math.round(x * 100) / 100;

// Definiciones para la API de Claude (JSON Schema estricto). Se mantienen en un orden fijo para no romper la caché.
export const HERRAMIENTAS_STRATEGOS = [
  {
    name: "resumen_campana",
    description: "Totales de la campaña dentro del alcance de quien pregunta: meta de votos, simpatizantes en bruto, validados y comprometidos, líderes, pauta (alcance, clics y gasto) y fecha de la elección. Úsela para preguntas de avance frente a la meta.",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[], additionalProperties: false },
    strict: true,
  },
  {
    name: "zonas",
    description: "Cifras agregadas por zona y la recomendación tierra + pauta de cada una (brigada, pauta, oportunidad o mantener), con los puntajes digital, tierra y brecha entre 0 y 1. Úsela para decidir dónde actuar.",
    input_schema: {
      type: "object" as const,
      properties: {
        orden: { type: "string", enum: ["brecha", "digital", "tierra", "validados", "potencial"], description: "Criterio para ordenar de mayor a menor." },
        limite: { type: "integer", description: "Cuántas zonas devolver (1 a 50)." },
      },
      required: ["orden", "limite"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "indice_lideres",
    description: "Índice de cada líder (calidad, limpieza, ejecución y avance de meta, entre 0 y 1) con su zona. Los líderes vienen con una referencia como «L-03», nunca con su nombre: use esa referencia en la respuesta y la pantalla mostrará el nombre.",
    input_schema: {
      type: "object" as const,
      properties: {
        orden: { type: "string", enum: ["mas_bajos", "mas_altos"] },
        limite: { type: "integer", description: "Cuántos líderes devolver (1 a 50)." },
      },
      required: ["orden", "limite"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "proponer_tarea",
    description: "Propone una tarea para que la gerencia la apruebe con un clic. No ejecuta nada: queda como propuesta. Use ids de zona y referencias de líder que hayan salido de las otras herramientas.",
    input_schema: {
      type: "object" as const,
      properties: {
        tipo: { type: "string", enum: ["brigada", "llamadas", "revision_lideres", "pauta"] },
        titulo: { type: "string", description: "Título corto, en español." },
        detalle: { type: "string", description: "Qué, quién y cuándo, en una o dos frases." },
        zonas: { type: "array", items: { type: "string" }, description: "Ids de las zonas." },
        lideres: { type: "array", items: { type: "string" }, description: "Referencias de líder (L-…)." },
      },
      required: ["tipo", "titulo", "detalle", "zonas", "lideres"],
      additionalProperties: false,
    },
    strict: true,
  },
];

export type NombreHerramienta = (typeof HERRAMIENTAS_STRATEGOS)[number]["name"];

const FUENTE = {
  resumen: "Totales de la campaña: simpatizantes por estado, líderes y pauta, dentro de su alcance",
  zonas: "Cifras por zona y recomendación tierra + pauta (simpatizantes validados, alcance digital y potencial)",
  lideres: "Índice del líder: calidad, limpieza, ejecución y meta (sin nombres)",
  tarea: "Propuesta de tarea para aprobar",
};

function limite(x: unknown) {
  const n = Math.trunc(Number(x));
  return Number.isFinite(n) ? Math.min(50, Math.max(1, n)) : 10;
}

/**
 * Ejecuta una herramienta sobre los datos agregados. `propuestas` acumula las tareas propuestas en la conversación.
 * Nunca lanza por una entrada mala: devuelve { error } para que el modelo pueda corregirse.
 */
export function ejecutarHerramienta(
  nombre: string, entrada: unknown, d: DatosStrategos, propuestas: TareaPropuesta[],
): ResultadoHerramienta {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const recs = new Map(recomendar(d.zonas.map((z) => ({
    territorioId: z.id, alcanceDigital: z.alcance, validados: z.validados, potencial: z.potencial,
  }))).map((r) => [r.territorioId, r]));

  switch (nombre) {
    case "resumen_campana": {
      const s = (k: keyof ZonaAgregada) => d.zonas.reduce((a, z) => a + (z[k] as number), 0);
      const meta = d.zonas.length && d.zonas.every((z) => z.meta > 0) ? s("meta") : d.campana.metaVotos;
      return {
        fuente: FUENTE.resumen,
        datos: {
          candidato: d.campana.candidato, cargo: d.campana.cargo, eleccion: d.campana.eleccion, metaVotos: meta,
          bruto: s("bruto"), validados: s("validados"), comprometidos: s("comprometidos"), lideres: d.lideres.length,
          zonas: d.zonas.length, alcanceDigital: s("alcance"), clics: s("clics"), gastoPauta: s("gasto"),
          avanceComprometidos: meta ? r2(s("comprometidos") / meta) : null,
        },
      };
    }
    case "zonas": {
      const orden = String(e.orden ?? "brecha");
      const filas = d.zonas.map((z) => {
        const r = recs.get(z.id)!;
        return {
          id: z.id, zona: z.nombre, validados: z.validados, comprometidos: z.comprometidos, potencial: z.potencial,
          lideres: z.lideres, alcanceDigital: z.alcance, digital: r2(r.digital), tierra: r2(r.tierra), brecha: r2(r.brecha),
          accion: r.accion as Accion, recomendacion: textoAccion[r.accion],
        };
      });
      const clave: Record<string, (f: (typeof filas)[number]) => number> = {
        brecha: (f) => f.brecha, digital: (f) => f.digital, tierra: (f) => f.tierra, validados: (f) => f.validados, potencial: (f) => f.potencial,
      };
      const k = clave[orden] ?? clave.brecha;
      return { fuente: FUENTE.zonas, datos: filas.sort((a, b) => k(b) - k(a)).slice(0, limite(e.limite)) };
    }
    case "indice_lideres": {
      const filas = d.lideres.map((l) => {
        const i = indiceLider(l);
        return {
          ref: l.ref, zonaId: l.zonaId, total: r2(i.total), calidad: r2(i.componentes.calidad), limpieza: r2(i.componentes.limpieza),
          ejecucion: r2(i.componentes.ejecucion), avanceMeta: r2(i.componentes.avanceMeta),
          coincidenciasConOtros: l.registrados ? r2(l.duplicadosConOtros / l.registrados) : 0,
        };
      });
      const asc = e.orden !== "mas_altos";
      return { fuente: FUENTE.lideres, datos: filas.sort((a, b) => (asc ? a.total - b.total : b.total - a.total)).slice(0, limite(e.limite)) };
    }
    case "proponer_tarea": {
      const tipos: TipoTarea[] = ["brigada", "llamadas", "revision_lideres", "pauta"];
      const tipo = tipos.find((t) => t === e.tipo);
      const titulo = String(e.titulo ?? "").trim().slice(0, 140);
      const detalle = String(e.detalle ?? "").trim().slice(0, 500);
      const ids = new Set(d.zonas.map((z) => z.id));
      const refs = new Set(d.lideres.map((l) => l.ref));
      const zonas = Array.isArray(e.zonas) ? e.zonas.map(String) : [];
      const lideres = Array.isArray(e.lideres) ? e.lideres.map(String) : [];
      const malas = [...zonas.filter((z) => !ids.has(z)), ...lideres.filter((l) => !refs.has(l))];
      if (!tipo || !titulo || !detalle) return { fuente: FUENTE.tarea, datos: { error: "Faltan el tipo, el título o el detalle." } };
      if (malas.length) return { fuente: FUENTE.tarea, datos: { error: `No existen en su alcance: ${malas.join(", ")}.` } };
      if (propuestas.length >= 5) return { fuente: FUENTE.tarea, datos: { error: "Ya hay cinco tareas propuestas en esta respuesta." } };
      propuestas.push({ tipo, titulo, detalle, zonas, lideres });
      return { fuente: FUENTE.tarea, datos: { propuesta: propuestas.length, estado: "pendiente de aprobación" } };
    }
    default:
      return { fuente: "—", datos: { error: `No existe la herramienta «${nombre}».` } };
  }
}

export type RespuestaStrategos = {
  texto: string;
  fuentes: string[];
  tareas: TareaPropuesta[];
  modelo: string;
  /** null en el modelo simulado. */
  uso: { entrada: number; salida: number; cacheLectura: number; costoUsd: number } | null;
};

export const SISTEMA_STRATEGOS = [
  "Usted es Strategos, el asesor estratégico de una campaña electoral en Colombia, dentro del producto Ventaja Mando.",
  "Responda en español de Colombia, claro y breve (máximo 150 palabras), para un gerente de campaña.",
  "Solo conoce los datos que devuelven sus herramientas, que son agregados por zona o por líder. Consulte las herramientas antes de afirmar cifras y no invente datos.",
  "Nunca pida ni use datos de personas (nombres, cédulas, teléfonos). Los líderes vienen como «L-03»: refiérase a ellos así.",
  "Los pronósticos son escenarios: diga siempre el supuesto («si el ritmo se mantiene…»). Nunca presente un resultado como seguro.",
  "No sugiera condicionar ayudas, empleo ni beneficios al voto, ni consultar puestos de votación con cédulas de terceros.",
  "Si recomienda una acción concreta, propóngala con la herramienta proponer_tarea (máximo tres). Las tareas no se ejecutan hasta que la gerencia las apruebe: no diga que ya se hicieron.",
].join("\n");

/** Precios por millón de tokens (USD), de la tabla pública de Anthropic. Escritura en caché = 1,25 × entrada. */
const PRECIOS: Record<string, { entrada: number; salida: number; cache: number }> = {
  "claude-sonnet-5-5": { entrada: 2, salida: 10, cache: 0.2 },
  "claude-haiku-5-5": { entrada: 0.1, salida: 0.5, cache: 0.01 },
  "claude-opus-5-5": { entrada: 4, salida: 20, cache: 0.2 },
};
export function costoEstimadoUsd(modelo: string, u: { entrada: number; salida: number; cacheLectura: number; cacheEscritura?: number }) {
  const p = PRECIOS[modelo] ?? PRECIOS["claude-sonnet-5-5"];
  const usd = (u.entrada * p.entrada + (u.cacheEscritura ?? 0) * p.entrada * 1.25 + u.cacheLectura * p.cache + u.salida * p.salida) / 1e6;
  return Math.round(usd * 1e6) / 1e6;
}

/**
 * Modelo simulado: responde sin IA, con las mismas herramientas y los mismos datos. Sirve para el modo demo, para
 * las pruebas y para cuando no hay ANTHROPIC_API_KEY.
 */
export function responderSimulado(pregunta: string, d: DatosStrategos): RespuestaStrategos {
  const p = pregunta.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const tareas: TareaPropuesta[] = [];
  const fuentes = new Set<string>();
  const usar = (nombre: NombreHerramienta, entrada: unknown) => {
    const r = ejecutarHerramienta(nombre, entrada, d, tareas);
    fuentes.add(r.fuente);
    return r.datos;
  };
  const fin = (texto: string): RespuestaStrategos => ({ texto, fuentes: [...fuentes], tareas, modelo: "simulado", uso: null });

  if (/lider|depur|revis/.test(p)) {
    type F = { ref: string; zonaId: string; total: number; coincidenciasConOtros: number };
    const bajos = (usar("indice_lideres", { orden: "mas_bajos", limite: 3 }) as F[]);
    if (!bajos.length) return fin("No hay líderes en su alcance para revisar.");
    const refs = bajos.map((b) => b.ref);
    usar("proponer_tarea", {
      tipo: "revision_lideres", titulo: `Reunión de depuración con ${refs.length} líderes`,
      detalle: `${refs.join(", ")}: revisar sus registros y coincidencias antes de asignar metas nuevas.`, zonas: [], lideres: refs,
    });
    const peor = bajos[0];
    return fin(`Los líderes con el índice más bajo son ${refs.join(", ")}. ${peor.ref} tiene un índice de ${Math.round(peor.total * 100)} sobre 100` +
      `${peor.coincidenciasConOtros > 0.15 ? ` y el ${Math.round(peor.coincidenciasConOtros * 100)} % de sus registros coincide con los de otros líderes` : ""}. ` +
      "Un índice bajo no prueba nada indebido: puede ser una lista compartida o tareas sin cerrar. Propongo una reunión de depuración.");
  }

  if (/meta|vamos|avance|llegar/.test(p)) {
    const r = usar("resumen_campana", {}) as { metaVotos: number; comprometidos: number; validados: number; avanceComprometidos: number | null };
    const pct = r.avanceComprometidos === null ? "—" : `${Math.round(r.avanceComprometidos * 100)} %`;
    return fin(`Hoy hay ${r.comprometidos.toLocaleString("es-CO")} comprometidos frente a una meta de ${r.metaVotos.toLocaleString("es-CO")} votos (${pct}), ` +
      `y ${r.validados.toLocaleString("es-CO")} validados. Es una foto de hoy, no una predicción: si el ritmo de validación se mantiene, la brecha se cierra en proporción ` +
      "a lo que se valide cada semana. Para un escenario con fechas hace falta el histórico semanal, que llega con más datos.");
  }

  // Por defecto: ¿dónde actuar?
  type Z = { id: string; zona: string; accion: Accion; brecha: number; digital: number };
  const zonas = usar("zonas", { orden: "brecha", limite: 50 }) as Z[];
  const brigada = zonas.filter((z) => z.accion === "brigada").sort((a, b) => b.digital - a.digital).slice(0, 2);
  const oportunidad = zonas.find((z) => z.accion === "oportunidad");
  const partes: string[] = [];
  if (brigada.length) {
    usar("proponer_tarea", {
      tipo: "brigada", titulo: `Brigada de fin de semana en ${brigada.map((z) => z.zona).join(" y ")}`,
      detalle: "Asignar dos coordinadores el sábado de 8:00 a 12:00, con formulario de registro y autorización.", zonas: brigada.map((z) => z.id), lideres: [],
    });
    partes.push(`En ${brigada.map((z) => z.zona).join(" y ")} la pauta ya generó atención pero hay pocos simpatizantes validados: propongo una brigada.`);
  }
  if (oportunidad) {
    usar("proponer_tarea", {
      tipo: "llamadas", titulo: `Cola de llamadas para ${oportunidad.zona}`,
      detalle: "Simpatizantes con autorización vigente y sin contactar en esa zona, con guion de invitación.", zonas: [oportunidad.id], lideres: [],
    });
    partes.push(`${oportunidad.zona} tiene potencial alto sin pauta ni estructura: empezaría con una cola de llamadas.`);
  }
  if (!partes.length) partes.push("Ninguna zona de su alcance muestra una brecha marcada entre tierra y pauta: conviene mantener el ritmo y revisar de nuevo la próxima semana.");
  return fin(partes.join(" "));
}

// Actas de reuniones políticas (plan de mejora, etapa 4a). La IA propone el acta a partir de las notas de quien estuvo
// o de la foto del acta escrita a mano; una persona la revisa antes de guardarla. Las notas salen limpias de teléfonos,
// correos y números de documento, y la IA nunca recibe la lista de asistentes (regla 6).

export type CompromisoPropuesto = { descripcion: string; vence_en: string | null };
export type ActaPropuesta = { resumen: string; temas: string[]; acuerdos: string; compromisos: CompromisoPropuesto[] };

export const ESQUEMA_ACTA = {
  type: "object",
  properties: {
    resumen: { type: "string", description: "Qué se habló, en 4 a 8 frases, en español de Colombia." },
    temas: {
      type: "array", items: { type: "string" },
      description: "De 1 a 6 temas o necesidades del territorio en una o dos palabras (por ejemplo: vías, salud, empleo).",
    },
    acuerdos: { type: "string", description: "Lo que se acordó, en frases cortas. Vacío si no hubo acuerdos." },
    compromisos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          descripcion: { type: "string", description: "Qué se va a hacer, empezando por un verbo." },
          vence_en: { type: ["string", "null"], description: "Fecha límite aaaa-mm-dd si las notas la dicen; si no, null." },
        },
        required: ["descripcion", "vence_en"], additionalProperties: false,
      },
    },
  },
  required: ["resumen", "temas", "acuerdos", "compromisos"],
  additionalProperties: false,
} as const;

export const INSTRUCCION_ACTA = [
  "Usted ayuda a una campaña electoral en Colombia a redactar el acta de una reunión política a partir de las notas de quien estuvo (o de la foto de un acta escrita a mano).",
  "Escriba en español de Colombia, claro y sin adornos. No invente nada que no esté en las notas.",
  "No incluya teléfonos, correos, direcciones ni números de documento de nadie.",
  "Los compromisos son acciones de la campaña (visitar, gestionar, convocar, enviar información). Si las notas mencionan ofrecer dinero, mercados, empleo u otros beneficios a cambio de apoyo o de votos, NO lo convierta en compromiso: escríbalo en el resumen como una alerta para que la campaña lo revise (es un delito electoral, art. 390 del Código Penal).",
].join("\n");

/** Quita teléfonos, correos y números largos (documentos), igual que privado.limpiar_texto en la base. */
export function limpiarNotas(texto: string, largo = 12000): string {
  return texto
    .replace(/[^\s@<>"']+@[^\s@<>"']+\.[A-Za-z]{2,}/g, "‹correo›")
    .replace(/\+?[0-9](?:[ .()-]?[0-9]){5,}/g, "‹número›")
    .slice(0, largo)
    .trim();
}

/** Regla 4: lo mismo que privado.menciona_dinero en la base, para avisar antes de guardar. */
const DINERO = /(\$|\b(pesos|plata|dinero|efectivo|pago|pagos|pagar|mercado|mercados|bono|bonos|subsidio|regalo|regalos)\b|puesto de trabajo|empleo a cambio)/i;
export const mencionaDinero = (texto: string) => DINERO.test(texto);

/** Los compromisos que la base va a rechazar (regla 4), para marcarlos en la revisión. */
export const compromisosConDinero = (p: ActaPropuesta) => p.compromisos.filter((c) => mencionaDinero(c.descripcion));

/** Temas que la redacción simulada reconoce en las notas (sin tildes, en minúscula). */
const TEMAS: Record<string, RegExp> = {
  "vías": /\b(via|vias|carretera|camino|puente|trocha)\b/, salud: /\b(salud|hospital|medico|medicos|puesto de salud)\b/,
  "educación": /\b(educacion|colegio|escuela|profesor|profesores)\b/, empleo: /\b(empleo|trabajo|desempleo)\b/,
  seguridad: /\b(seguridad|robo|robos|policia)\b/, agua: /\b(agua|acueducto|alcantarillado)\b/, alumbrado: /\b(alumbrado|luz|energia)\b/,
  vivienda: /\b(vivienda|casas|mejoramiento)\b/, campo: /\b(campo|cosecha|productores|ganaderia|agricultura)\b/, deporte: /\b(deporte|cancha|polideportivo)\b/,
};

/** Acta propuesta sin IA, para el modo demo y las pruebas: toma las frases de las notas tal como están. */
export function redaccionSimulada(notas: string): ActaPropuesta {
  const limpias = limpiarNotas(notas);
  const frases = limpias.split(/(?<=[.!?])\s+|\n+/).map((f) => f.trim()).filter((f) => f.length > 3);
  const sinTildes = limpias.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const temas = Object.entries(TEMAS).filter(([, re]) => re.test(sinTildes)).map(([t]) => t);
  const compromisos = frases.filter((f) => /^(visitar|gestionar|convocar|enviar|llevar|organizar|programar|volver)/i.test(f))
    .map((f) => ({ descripcion: f.replace(/[.]$/, ""), vence_en: null }));
  return {
    resumen: frases.filter((f) => !compromisos.some((c) => f.startsWith(c.descripcion))).slice(0, 6).join(" ") || limpias.slice(0, 400),
    temas: temas.length ? temas : ["general"],
    acuerdos: "",
    compromisos,
  };
}

/**
 * La foto del acta solo puede estar en la carpeta de su reunión: «<campaña>/<reunión>/<archivo>.<jpg|jpeg|png|webp>».
 * El nombre del archivo no admite «/», «..» ni «%»: así una ruta no puede salirse hacia otra reunión, otra campaña u
 * otro bucket (la descarga la hace el servidor).
 */
const ARCHIVO_ACTA = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(?:jpe?g|png|webp)$/i;
export function rutaAdjuntoValida(ruta: string, campanaId: string, reunionId: string): boolean {
  const partes = ruta.split("/");
  return partes.length === 3 && partes[0] === campanaId && partes[1] === reunionId && ARCHIVO_ACTA.test(partes[2]);
}

/**
 * Foto del bucket «evidencias» (planillas y E-14): «<campaña>/<usuario>/<archivo>.<jpg|jpeg|png|webp>», dentro de la
 * campaña indicada. La lectura con IA la descarga con la llave del servidor: sin esta comprobación, una ruta cambiada
 * a mano podía apuntar a la foto de otra campaña.
 */
const UUID_RUTA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function rutaEvidenciaValida(ruta: string, campanaId: string): boolean {
  const partes = ruta.split("/");
  return partes.length === 3 && partes[0] === campanaId && UUID_RUTA.test(partes[1]) && ARCHIVO_ACTA.test(partes[2]);
}

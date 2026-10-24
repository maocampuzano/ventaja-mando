// Formularios de la campaña (fase 2): esquema, validación del esquema y de las respuestas.
// Reglas que no se negocian que aplican aquí (CLAUDE.md):
//  · Regla 2: ninguna pregunta individual sobre opinión política o intención de voto (eso va en preferencia_politica,
//    con autorización sensible y solo si la campaña lo activó; nunca en un formulario).
//  · La cédula no se pregunta en un formulario: se guarda cifrada en el registro de la persona.
//  · Regla 4: preguntar por dinero o ayudas genera un aviso (riesgo de corrupción al sufragante).
// La base repite los dos bloqueos en un disparador (supabase/migrations/…_formularios.sql).
import { normaliza } from "./duplicados";

export type TipoCampo = "texto" | "numero" | "opcion" | "multiple" | "si_no" | "fecha";
export type Campo = { id: string; tipo: TipoCampo; etiqueta: string; obligatorio: boolean; ayuda?: string; opciones?: string[] };
export type EsquemaFormulario = { campos: Campo[] };

export const nombreTipoCampo: Record<TipoCampo, string> = {
  texto: "Texto", numero: "Número", opcion: "Una opción", multiple: "Varias opciones", si_no: "Sí o no", fecha: "Fecha",
};

export const MAX_CAMPOS = 40;

// Mismas expresiones que privado.texto_prohibido_en_formulario en la base.
const POLITICA = /\b(vot(o|os|ar|aria|ara|ante)|intencion de voto|por quien|partido politico|simpatiza con|candidat[oa] preferid[oa]|opinion politica|ideologia)\b/;
const CEDULA = /\b(cedula|documento de identidad|numero de documento|c\.?\s?c\.?)\b/;
const DINERO = /\b(dinero|plata|pesos|pago|pagar|valor|ayuda economica|mercado|regalo|subsidio)\b/;

const texto = (c: Campo) => normaliza([c.etiqueta, c.ayuda ?? "", ...(c.opciones ?? [])].join(" ")).replace(/[¿?¡!.,;:()]/g, " ");

export type Revision = { errores: string[]; avisos: string[] };

export function revisarEsquema(nombre: string, e: EsquemaFormulario): Revision {
  const errores: string[] = [], avisos: string[] = [];
  if (nombre.trim().length < 3) errores.push("El formulario necesita un nombre.");
  if (!e.campos.length) errores.push("Agregue al menos un campo.");
  if (e.campos.length > MAX_CAMPOS) errores.push(`Un formulario admite hasta ${MAX_CAMPOS} campos.`);
  const ids = new Set<string>();
  e.campos.forEach((c, i) => {
    const n = `Campo ${i + 1}`;
    if (ids.has(c.id)) errores.push(`${n}: identificador repetido.`);
    ids.add(c.id);
    if (c.etiqueta.trim().length < 2) errores.push(`${n}: escriba la pregunta.`);
    if ((c.tipo === "opcion" || c.tipo === "multiple")) {
      const ops = (c.opciones ?? []).map((o) => o.trim()).filter(Boolean);
      if (ops.length < 2) errores.push(`${n}: necesita al menos dos opciones.`);
      if (new Set(ops.map(normaliza)).size !== ops.length) errores.push(`${n}: hay opciones repetidas.`);
    }
    const t = texto(c);
    if (POLITICA.test(t)) errores.push(`${n} («${c.etiqueta}»): no se puede preguntar a cada persona por su voto u opinión política. Es un dato sensible: la intención se mide en agregado (regla 2).`);
    if (CEDULA.test(t)) errores.push(`${n} («${c.etiqueta}»): la cédula no se pide en un formulario; se guarda cifrada al registrar a la persona.`);
    if (DINERO.test(t)) avisos.push(`${n} («${c.etiqueta}»): las preguntas sobre dinero o ayudas no pueden relacionarse con el voto (regla 4). Revise la redacción.`);
  });
  return { errores, avisos };
}

export type ValorRespuesta = string | number | boolean | string[] | null;

/** Valida las respuestas de una persona contra el esquema. Devuelve los errores por campo. */
export function validarRespuesta(e: EsquemaFormulario, datos: Record<string, ValorRespuesta>): Record<string, string> {
  const errores: Record<string, string> = {};
  for (const c of e.campos) {
    const v = datos[c.id];
    const vacio = v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
    if (vacio) { if (c.obligatorio) errores[c.id] = "Obligatorio."; continue; }
    if (c.tipo === "numero" && (typeof v !== "number" || !Number.isFinite(v))) errores[c.id] = "Debe ser un número.";
    if (c.tipo === "si_no" && typeof v !== "boolean") errores[c.id] = "Responda sí o no.";
    if (c.tipo === "fecha" && (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v))) errores[c.id] = "Fecha inválida.";
    if (c.tipo === "opcion" && !(c.opciones ?? []).includes(String(v))) errores[c.id] = "Elija una de las opciones.";
    if (c.tipo === "multiple" && (!Array.isArray(v) || v.some((x) => !(c.opciones ?? []).includes(x)))) errores[c.id] = "Opción no válida.";
    if (c.tipo === "texto" && String(v).length > 500) errores[c.id] = "Máximo 500 caracteres.";
  }
  return errores;
}

/** Un identificador corto y legible para un campo nuevo. */
export function nuevoIdCampo(existentes: readonly string[]): string {
  let i = existentes.length + 1;
  while (existentes.includes(`c${i}`)) i++;
  return `c${i}`;
}

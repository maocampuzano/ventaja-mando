// Mensajes masivos por SMS y correo (fase 6). Regla 1: nunca por WhatsApp. Regla 3: solo a personas con autorización
// vigente para «contacto de la campaña» y sin baja; la base lo hace cumplir (privado.contactable).
// Cada mensaje lleva la identificación de la campaña y un enlace para darse de baja en un paso.
//
// BORRADOR LEGAL (V3): el horario de envío y los textos de pie los revisa el abogado antes de usarlos con personas
// reales. El horario sigue, por prudencia, el de la Ley 2300 de 2023 («dejen de fregar»).
import { festivosColombia } from "./plazos";

export type CanalMasivo = "sms" | "email";

// ---------- SMS: caracteres y segmentos ----------

// Alfabeto GSM 03.38 (básico y extensión). Fuera de él, el SMS va en UCS-2 y cada segmento lleva muchos menos
// caracteres: «á», «í», «ó» y «ú» NO están, así que un texto con tildes cuesta más.
const GSM_BASICO = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENSION = "^{}\\[~]|€";

export type SegmentosSms = { codificacion: "GSM-7" | "UCS-2"; caracteres: number; segmentos: number; fueraDeGsm: string[] };

export function segmentosSms(texto: string): SegmentosSms {
  const fuera = new Set<string>();
  let unidades = 0;
  for (const c of texto) {
    if (GSM_BASICO.includes(c)) unidades += 1;
    else if (GSM_EXTENSION.includes(c)) unidades += 2;
    else fuera.add(c);
  }
  if (fuera.size) {
    const n = [...texto].reduce((a, c) => a + (c.codePointAt(0)! > 0xffff ? 2 : 1), 0);
    return { codificacion: "UCS-2", caracteres: n, segmentos: n <= 70 ? 1 : Math.ceil(n / 67), fueraDeGsm: [...fuera] };
  }
  return { codificacion: "GSM-7", caracteres: unidades, segmentos: unidades <= 160 ? 1 : Math.ceil(unidades / 153), fueraDeGsm: [] };
}

/** Un SMS de más de 3 segmentos llega cortado en algunos teléfonos y cuesta el triple: no se permite. */
export const MAX_SEGMENTOS_SMS = 3;

// ---------- Armar y validar el mensaje ----------

/** Lo que reemplaza la base al enviar: el enlace de baja tiene unos 60 caracteres. */
export const LARGO_ENLACE_BAJA = 60;

export const piePagina = (canal: CanalMasivo, campana: string, enlaceBaja: string) =>
  canal === "sms"
    // Sin tildes fuera de GSM («más» costaría el doble en cada SMS).
    ? `\n${campana}. Para dejar de recibir mensajes: ${enlaceBaja}`
    : `\n\n—\nEste mensaje es de la campaña ${campana}, porque usted autorizó que la campaña lo contactara. ` +
      `Para no recibir más mensajes por ningún medio, abra este enlace: ${enlaceBaja}`;

const primerNombre = (nombre: string) => {
  const p = nombre.trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toLocaleUpperCase("es-CO") + p.slice(1).toLocaleLowerCase("es-CO") : "";
};

/** El texto final para una persona: {nombre} por su primer nombre y el pie con el enlace de baja. */
export function armarMensaje(canal: CanalMasivo, plantilla: string, d: { nombre: string; campana: string; enlaceBaja: string }) {
  const nombre = primerNombre(d.nombre);
  const cuerpo = plantilla.replace(/\{nombre\}/g, nombre || "").replace(/ {2,}/g, " ").replace(/ ([,.;:!?])/g, "$1").trim();
  return cuerpo + piePagina(canal, d.campana, d.enlaceBaja);
}

// Palabras que pueden sugerir dádivas a cambio del voto (art. 390 del Código Penal, corrupción al sufragante) o
// condicionar ayudas. No bloquean: obligan a quien aprueba a mirarlo dos veces.
const PALABRAS_RIESGO = ["mercado", "mercados", "bono", "bonos", "regalo", "regalos", "plata", "dinero", "subsidio",
  "subsidios", "pago", "pagamos", "tejas", "cemento", "puesto de trabajo", "empleo", "contrato", "a cambio", "rifa", "premio"];

export type RevisionMensaje = { errores: string[]; advertencias: string[]; segmentos: SegmentosSms | null };

export function revisarPlantilla(canal: CanalMasivo, plantilla: string, campana: string, asunto?: string): RevisionMensaje {
  const errores: string[] = [];
  const advertencias: string[] = [];
  const texto = plantilla.trim();
  if (!texto) errores.push("Escriba el texto del mensaje.");
  if (canal === "email" && !asunto?.trim()) errores.push("El correo necesita un asunto.");
  if (/wa\.me|whatsapp|chat\.whatsapp\.com/i.test(texto)) {
    errores.push("Los mensajes masivos no llevan enlaces de WhatsApp: el WhatsApp es solo de persona a persona (regla 1).");
  }
  const sospechosas = PALABRAS_RIESGO.filter((p) => new RegExp(`(^|[^a-záéíóúñ])${p}([^a-záéíóúñ]|$)`, "i").test(`${asunto ?? ""} ${texto}`));
  const pesos = /\$\s?\d/.test(`${asunto ?? ""} ${texto}`);
  if (sospechosas.length || pesos) {
    advertencias.push(`Revise que el mensaje no ofrezca nada a cambio del voto ni condicione ayudas (${[...sospechosas, ...(pesos ? ["valores en pesos"] : [])].join(", ")}).`);
  }
  let segmentos: SegmentosSms | null = null;
  if (canal === "sms" && texto) {
    // Se mide con el nombre más largo razonable y el pie con su enlace.
    const muestra = armarMensaje("sms", texto, { nombre: "Maximiliano", campana, enlaceBaja: "x".repeat(LARGO_ENLACE_BAJA) });
    segmentos = segmentosSms(muestra);
    if (segmentos.segmentos > MAX_SEGMENTOS_SMS) {
      errores.push(`El SMS ocuparía ${segmentos.segmentos} mensajes con el pie de baja; el máximo es ${MAX_SEGMENTOS_SMS}. Acórtelo.`);
    } else if (segmentos.codificacion === "UCS-2") {
      advertencias.push(`Por ${segmentos.fueraDeGsm.map((c) => `«${c}»`).join(", ")} el SMS cabe en 70 caracteres por mensaje y no en 160: cada envío cuesta ${segmentos.segmentos} ${segmentos.segmentos === 1 ? "mensaje" : "mensajes"}.`);
    }
  }
  return { errores, advertencias, segmentos };
}

// ---------- Horario de envío y festivos de Colombia ----------

/** Hora de Bogotá (UTC-5, sin horario de verano) de un instante. */
function enBogota(t: Date) {
  const b = new Date(t.getTime() - 5 * 3_600_000);
  return { fecha: b.toISOString().slice(0, 10), dia: b.getUTCDay(), minutos: b.getUTCHours() * 60 + b.getUTCMinutes() };
}

/** Lunes a viernes de 8:00 a. m. a 7:00 p. m. y sábados de 8:00 a. m. a 3:00 p. m.; ni domingos ni festivos. */
export function dentroDeHorario(t: Date): { permitido: boolean; motivo?: string } {
  const { fecha, dia, minutos } = enBogota(t);
  if (dia === 0) return { permitido: false, motivo: "Los domingos no se envían mensajes." };
  if (festivosColombia(Number(fecha.slice(0, 4))).has(fecha)) return { permitido: false, motivo: "Los festivos no se envían mensajes." };
  const fin = dia === 6 ? 15 * 60 : 19 * 60;
  if (minutos < 8 * 60 || minutos >= fin) {
    return { permitido: false, motivo: dia === 6 ? "Los sábados se envía de 8:00 a. m. a 3:00 p. m." : "Entre semana se envía de 8:00 a. m. a 7:00 p. m." };
  }
  return { permitido: true };
}

// ---------- Segmentos ----------

/** A quién va un envío. Nunca por opinión política (regla 2): solo territorio, líder y estado del contacto. */
export type SegmentoEnvio = { territorioIds?: string[]; liderIds?: string[]; estados?: ("sin_contactar" | "contactado" | "validado" | "comprometido")[] };

export const segmentoParaBase = (s: SegmentoEnvio) => ({
  ...(s.territorioIds?.length ? { territorio_ids: s.territorioIds } : {}),
  ...(s.liderIds?.length ? { lider_ids: s.liderIds } : {}),
  ...(s.estados?.length ? { estados: s.estados } : {}),
});

// Lectura asistida de planillas y del E-14 (fase 4). La IA propone; una persona revisa (regla 7). Aquí está lo que no
// depende del modelo: los esquemas que se le piden, la revisión de cada fila (qué se marca en ámbar y qué en rojo) y
// las comprobaciones del E-14, que son alertas para revisar, nunca acusaciones de fraude.

/** Confianza de 0 a 1 por campo, según el modelo. */
export type Confianzas = { nombre: number; cedula: number; celular: number; barrio: number; firma: number };
export type FilaLeida = { renglon: number; nombre: string; cedula: string; celular: string; barrio: string; firma: boolean; confianza: Confianzas };
export type CampoFila = "nombre" | "cedula" | "celular" | "barrio" | "firma";

export const UMBRAL_CONFIANZA = 0.85;

/** Esquema de salida que se le pide al modelo para una hoja de planilla (salida JSON estricta). */
export const ESQUEMA_PLANILLA = {
  type: "object",
  properties: {
    filas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          renglon: { type: "integer", description: "Número impreso del renglón." },
          nombre: { type: "string" },
          cedula: { type: "string", description: "Solo dígitos; vacío si no la escribieron." },
          celular: { type: "string", description: "Solo dígitos; vacío si no lo escribieron." },
          barrio: { type: "string" },
          firma: { type: "boolean", description: "¿Hay una firma o rúbrica en la columna de autorización?" },
          confianza: {
            type: "object",
            properties: {
              nombre: { type: "number" }, cedula: { type: "number" }, celular: { type: "number" }, barrio: { type: "number" }, firma: { type: "number" },
            },
            required: ["nombre", "cedula", "celular", "barrio", "firma"],
            additionalProperties: false,
          },
        },
        required: ["renglon", "nombre", "cedula", "celular", "barrio", "firma", "confianza"],
        additionalProperties: false,
      },
    },
  },
  required: ["filas"],
  additionalProperties: false,
} as const;

export const INSTRUCCION_PLANILLA = [
  "Esta es la foto de una planilla de registro de una campaña electoral en Colombia, escrita a mano.",
  "Transcriba cada renglón que tenga algo escrito: nombre, cédula, celular, barrio o vereda, y si hay firma en la columna de autorización.",
  "Copie lo que ve, sin corregir ni completar. Si un dígito no se lee, déjelo como «?» y baje la confianza de ese campo.",
  "Ignore los renglones vacíos. No invente datos. La confianza va de 0 (ilegible) a 1 (segura).",
].join("\n");

const soloDigitos = (s: string) => s.replace(/[^\d?]/g, "");

/** +57 3xx xxx xxxx, o null si no es un celular colombiano completo. */
export function normalizarCelular(s: string): string | null {
  let d = soloDigitos(s);
  if (d.includes("?")) return null;
  if (d.length === 12 && d.startsWith("57")) d = d.slice(2);
  return /^3\d{9}$/.test(d) ? `+57 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : null;
}

export function normalizarCedula(s: string): string | null {
  const d = soloDigitos(s);
  return !d.includes("?") && d.length >= 5 && d.length <= 11 ? d : null;
}

export type FilaRevisada = {
  renglon: number; nombre: string; cedula: string | null; celular: string | null; barrio: string; firma: boolean;
  /** Campos para confirmar (ámbar): baja confianza o formato que no cuadra. */
  dudas: CampoFila[];
  /** Motivos que impiden guardar la fila tal como está (rojo). */
  bloqueos: string[];
};

/** Revisa una fila leída. No decide por la persona: solo señala qué mirar. */
export function revisarFila(f: FilaLeida): FilaRevisada {
  const dudas = new Set<CampoFila>();
  const bloqueos: string[] = [];
  for (const c of ["nombre", "cedula", "celular", "barrio", "firma"] as const) {
    if ((f.confianza?.[c] ?? 0) < UMBRAL_CONFIANZA) dudas.add(c);
  }
  const nombre = f.nombre.trim().replace(/\s+/g, " ");
  if (nombre.length < 3 || nombre.includes("?")) { dudas.add("nombre"); bloqueos.push("Falta el nombre o no se lee."); }
  const cedula = f.cedula.trim() ? normalizarCedula(f.cedula) : null;
  if (f.cedula.trim() && !cedula) dudas.add("cedula");
  const celular = f.celular.trim() ? normalizarCelular(f.celular) : null;
  if (f.celular.trim() && !celular) dudas.add("celular");
  if (!f.firma) bloqueos.push("Sin firma de autorización: no se registra (regla 3).");
  return { renglon: f.renglon, nombre, cedula, celular, barrio: f.barrio.trim(), firma: f.firma, dudas: [...dudas], bloqueos };
}

/** Cédulas o celulares repetidos dentro de la misma hoja: renglón → motivo. */
export function repetidosEnHoja(filas: readonly FilaRevisada[]): Map<number, string> {
  const r = new Map<number, string>();
  const vistas = new Map<string, number>();
  for (const f of filas) {
    for (const [clave, texto] of [[f.cedula && `c:${f.cedula}`, "Misma cédula"], [f.celular && `t:${f.celular}`, "Mismo celular"]] as const) {
      if (!clave) continue;
      const antes = vistas.get(clave);
      if (antes !== undefined) r.set(f.renglon, `${texto} que el renglón ${antes}`);
      else vistas.set(clave, f.renglon);
    }
  }
  return r;
}

// ---------- E-14 ----------

export type ActaLeida = {
  mesa: number | null;
  votos: { opcion: string; votos: number | null }[];
  blancos: number | null; nulos: number | null; noMarcados: number | null;
  totalVotos: number | null; sufragantes: number | null;
  confianza: number;
};

export const ESQUEMA_E14 = {
  type: "object",
  properties: {
    mesa: { type: ["integer", "null"] },
    votos: {
      type: "array",
      items: {
        type: "object",
        properties: { opcion: { type: "string", description: "Candidato, lista o partido tal como aparece." }, votos: { type: ["integer", "null"] } },
        required: ["opcion", "votos"], additionalProperties: false,
      },
    },
    blancos: { type: ["integer", "null"] }, nulos: { type: ["integer", "null"] }, noMarcados: { type: ["integer", "null"] },
    totalVotos: { type: ["integer", "null"] }, sufragantes: { type: ["integer", "null"] },
    confianza: { type: "number", description: "Confianza general de la lectura, de 0 a 1." },
  },
  required: ["mesa", "votos", "blancos", "nulos", "noMarcados", "totalVotos", "sufragantes", "confianza"],
  additionalProperties: false,
} as const;

export const INSTRUCCION_E14 = [
  "Esta es la foto de un formulario E-14 (acta de escrutinio de mesa) de una elección en Colombia.",
  "Transcriba el número de mesa, los votos de cada candidato, lista o partido, los votos en blanco, nulos y no marcados, el total de votos y el número de sufragantes.",
  "Copie los números tal como están escritos. Si un número no se lee, use null y baje la confianza. No calcule ni corrija.",
].join("\n");

/**
 * Comprobaciones aritméticas del acta. Son alertas para que una persona revise la foto: un descuadre puede ser un
 * error de lectura, de escritura o una enmienda. Nunca se presentan como fraude.
 */
export function alertasActa(a: ActaLeida): string[] {
  const alertas: string[] = [];
  if (a.confianza < UMBRAL_CONFIANZA) alertas.push("La lectura tiene confianza baja: compare cada número con la foto.");
  if (a.mesa === null) alertas.push("No se leyó el número de mesa.");
  const faltan = [...a.votos.map((v) => v.votos), a.blancos, a.nulos, a.noMarcados, a.totalVotos].some((x) => x === null);
  if (faltan) alertas.push("Hay números que no se leyeron.");
  if (!faltan && a.totalVotos !== null) {
    const suma = a.votos.reduce((s, v) => s + (v.votos ?? 0), 0) + (a.blancos ?? 0) + (a.nulos ?? 0) + (a.noMarcados ?? 0);
    if (suma !== a.totalVotos) alertas.push(`La suma de votos (${suma}) no coincide con el total escrito (${a.totalVotos}).`);
  }
  if (a.totalVotos !== null && a.sufragantes !== null && a.totalVotos > a.sufragantes) {
    alertas.push(`El total de votos (${a.totalVotos}) es mayor que el número de sufragantes (${a.sufragantes}).`);
  }
  return alertas;
}

// ---------- Lectura simulada (modo demo y pruebas) ----------

/** Una hoja leída con datos ficticios: casos limpios, dudas, un repetido y un renglón sin firma. */
export function lecturaSimuladaPlanilla(): FilaLeida[] {
  const alta = { nombre: 0.97, cedula: 0.96, celular: 0.95, barrio: 0.93, firma: 0.98 };
  return [
    { renglon: 1, nombre: "María José Peña Ortiz", cedula: "1047000218", celular: "3000004412", barrio: "La Ceiba", firma: true, confianza: alta },
    { renglon: 2, nombre: "José Luis Ortiz Díaz", cedula: "73100590", celular: "3110000921", barrio: "Centro", firma: true, confianza: alta },
    { renglon: 3, nombre: "Luz Dary Gómez", cedula: "11430000?7", celular: "3150007734", barrio: "Villa Rosa", firma: true, confianza: { ...alta, cedula: 0.61 } },
    { renglon: 4, nombre: "Carlos Díaz M.", cedula: "73100590", celular: "3200001180", barrio: "Centro", firma: true, confianza: alta },
    { renglon: 5, nombre: "Ana Ruiz", cedula: "1001000336", celular: "30?0005521", barrio: "El Mirador", firma: true, confianza: { ...alta, celular: 0.68 } },
    { renglon: 6, nombre: "Edilberto Cabarcas", cedula: "9100204", celular: "3130006609", barrio: "Las Palmas", firma: false, confianza: { ...alta, firma: 0.9 } },
  ];
}

export function lecturaSimuladaE14(): ActaLeida {
  return {
    mesa: 3,
    votos: [{ opcion: "Candidata A (ficticia)", votos: 112 }, { opcion: "Candidato B (ficticio)", votos: 87 }, { opcion: "Candidato C (ficticio)", votos: 41 }],
    blancos: 6, nulos: 4, noMarcados: 2, totalVotos: 252, sufragantes: 255, confianza: 0.93,
  };
}

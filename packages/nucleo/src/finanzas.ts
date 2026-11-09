// Finanzas de campaña (fase 6). Códigos del formulario 5B del CNE para candidatos a elecciones territoriales
// (fuente: cartilla «Cuentas Claras» de la Registraduría y página del CNE «Informes de ingresos y gastos de
// campaña», consultadas el 09/11/2026) y reglas de la Ley 1475 de 2011, arts. 23 y 27.
// La campaña lleva aquí su libro; el contador lo pasa al aplicativo Cuentas Claras, que es el informe oficial.
// BORRADOR (V3): el contador y el abogado validan los códigos y la lista de fuentes prohibidas antes de usarlo.

export type TipoMovimiento = "ingreso" | "gasto";
export type CodigoFinanzas = { codigo: number; tipo: TipoMovimiento; nombre: string; detalle: string; anexo?: string };

export const CODIGOS_FINANZAS: readonly CodigoFinanzas[] = [
  { codigo: 101, tipo: "ingreso", nombre: "Recursos propios y de familiares", detalle: "Créditos o aportes del patrimonio del candidato, su cónyuge o compañero permanente, o sus parientes hasta el cuarto grado de consanguinidad.", anexo: "5.1 B" },
  { codigo: 102, tipo: "ingreso", nombre: "Contribuciones, donaciones y créditos de particulares", detalle: "En dinero o en especie, de personas naturales o jurídicas.", anexo: "5.2 B" },
  { codigo: 103, tipo: "ingreso", nombre: "Créditos de entidades financieras", detalle: "Indicar si hay pignoración de la reposición de gastos (art. 17, Ley 130 de 1994).", anexo: "5.3 B" },
  { codigo: 104, tipo: "ingreso", nombre: "Actos públicos, publicaciones y actividades lucrativas", detalle: "Bazares, fiestas, bonos de contribución, publicaciones. En bonos, relación de participantes." },
  { codigo: 105, tipo: "ingreso", nombre: "Financiación estatal: anticipos", detalle: "Anticipo girado para la campaña.", anexo: "5.4 B" },
  { codigo: 107, tipo: "ingreso", nombre: "Otros ingresos", detalle: "Rendimientos financieros." },
  { codigo: 201, tipo: "gasto", nombre: "Gastos de administración", detalle: "Honorarios, sueldos, viáticos, arriendo de sede, servicios públicos, vigilancia, aseo." },
  { codigo: 202, tipo: "gasto", nombre: "Gastos de oficina y adquisiciones", detalle: "Papelería, equipos y elementos de oficina." },
  { codigo: 203, tipo: "gasto", nombre: "Inversión en materiales y publicaciones", detalle: "Pintura, telas, camisetas, esferos, llaveros y demás materiales." },
  { codigo: 204, tipo: "gasto", nombre: "Actos públicos", detalle: "Alquiler de salón, sillas, mesas, sonido, música y refrigerios." },
  { codigo: 205, tipo: "gasto", nombre: "Servicio de transporte y correo", detalle: "Transporte de personas y materiales, envíos." },
  { codigo: 206, tipo: "gasto", nombre: "Capacitación e investigación política", detalle: "Talleres, encuestas y estudios." },
  { codigo: 207, tipo: "gasto", nombre: "Gastos judiciales y de rendición de cuentas", detalle: "Abogados, contador y trámites de la rendición de cuentas." },
  { codigo: 208, tipo: "gasto", nombre: "Propaganda electoral", detalle: "Radio, prensa, televisión, internet, vallas, pasacalles, pendones y afiches.", anexo: "5.7 B" },
  { codigo: 209, tipo: "gasto", nombre: "Costos financieros", detalle: "Intereses, comisiones y gastos bancarios." },
  { codigo: 210, tipo: "gasto", nombre: "Gastos que sobrepasan la suma fijada por el CNE", detalle: "Lo que exceda el tope de gastos de la campaña." },
  { codigo: 211, tipo: "gasto", nombre: "Otros gastos", detalle: "Gastos que no caben en los códigos anteriores." },
];
export const codigoFinanzas = (c: number) => CODIGOS_FINANZAS.find((x) => x.codigo === c);

/** Ingresos de origen privado: el total no puede superar el tope de gastos (Ley 1475, art. 23). */
export const CODIGOS_PRIVADOS = [101, 102, 103, 104, 107] as const;
/** Un mismo aportante particular no puede dar más del 10 % del tope (Ley 1475, art. 23). */
export const LIMITE_POR_APORTANTE = 0.1;

/**
 * Fuentes prohibidas (Ley 1475 de 2011, art. 27). Antes de registrar un aporte de un particular (código 102), quien lo
 * recibe confirma que no viene de ninguna. BORRADOR para revisión jurídica (V3).
 */
export const FUENTES_PROHIBIDAS = [
  { id: "extranjero", texto: "No viene de gobiernos ni de personas naturales o jurídicas extranjeras." },
  { id: "ilicito", texto: "No se deriva de actividades ilícitas ni busca financiar fines antidemocráticos o contrarios al orden público." },
  { id: "anonimo", texto: "No es anónimo: se conoce y se registra quién lo da." },
  { id: "procesado", texto: "No viene de personas con acusación o imputación por delitos de financiación de grupos armados, narcotráfico, contra la administración pública, contra los mecanismos de participación o de lesa humanidad." },
  { id: "funcionario", texto: "No viene de personas que desempeñen funciones públicas (salvo miembros de corporaciones de elección popular)." },
  { id: "contratista", texto: "No viene de quien el año anterior recibió más del 50 % de sus ingresos de contratos o subsidios del Estado, administra recursos públicos o parafiscales, o explota monopolios estatales o juegos de suerte y azar." },
] as const;
export type FuenteProhibida = (typeof FUENTES_PROHIBIDAS)[number]["id"];

export type MovimientoFinanzas = {
  tipo: TipoMovimiento; codigo: number; valor: number; fecha: string; terceroId?: string | null;
};

export type ResumenFinanzas = {
  porCodigo: Record<number, number>;
  ingresos: number; privados: number; gastos: number; saldo: number;
  /** Gastos sobre el tope (null si no hay tope). */
  usoTope: number | null;
  alertas: { nivel: "ambar" | "rojo"; texto: string }[];
};

export function resumenFinanzas(movs: readonly MovimientoFinanzas[], tope: number | null): ResumenFinanzas {
  const porCodigo: Record<number, number> = {};
  for (const m of movs) porCodigo[m.codigo] = (porCodigo[m.codigo] ?? 0) + m.valor;
  const suma = (tipo: TipoMovimiento) => movs.filter((m) => m.tipo === tipo).reduce((a, m) => a + m.valor, 0);
  const ingresos = suma("ingreso"), gastos = suma("gasto");
  const privados = movs.filter((m) => (CODIGOS_PRIVADOS as readonly number[]).includes(m.codigo)).reduce((a, m) => a + m.valor, 0);
  const alertas: ResumenFinanzas["alertas"] = [];
  const usoTope = tope ? gastos / tope : null;
  if (!tope) alertas.push({ nivel: "ambar", texto: "Falta el tope de gastos que fijó el CNE para esta campaña: sin él no se pueden controlar los límites." });
  if (usoTope !== null) {
    if (usoTope > 1) alertas.push({ nivel: "rojo", texto: "Los gastos superan el tope del CNE: es causal de pérdida del cargo (Ley 1475, art. 26). Lo que exceda se reporta en el código 210." });
    else if (usoTope >= 0.95) alertas.push({ nivel: "rojo", texto: "Los gastos ya pasan del 95 % del tope del CNE." });
    else if (usoTope >= 0.8) alertas.push({ nivel: "ambar", texto: "Los gastos ya pasan del 80 % del tope del CNE." });
  }
  if (tope && privados > tope) alertas.push({ nivel: "rojo", texto: "Los ingresos de origen privado superan el tope de gastos (Ley 1475, art. 23)." });
  if (gastos > ingresos) alertas.push({ nivel: "ambar", texto: "Hay más gastos que ingresos registrados: revise si faltan ingresos u obligaciones por pagar." });
  return { porCodigo, ingresos, privados, gastos, saldo: ingresos - gastos, usoTope, alertas };
}

export type AporteParticular = {
  valor: number; tipoPersona: "natural" | "juridica"; documento: string; acta?: string | null;
  verificaciones: Partial<Record<FuenteProhibida, boolean>>;
};

/** Errores que impiden registrar un aporte de un particular (código 102). `yaAportado`: lo que ese tercero ya dio. */
export function revisarAporte(a: AporteParticular, yaAportado: number, tope: number | null): string[] {
  const errores: string[] = [];
  if (!tope) errores.push("Antes de registrar aportes de particulares, configure el tope de gastos que fijó el CNE.");
  if (!a.documento.replace(/\D/g, "")) errores.push("Un aporte no puede ser anónimo: escriba el documento o NIT de quien lo da.");
  if (a.tipoPersona === "juridica" && !a.acta?.trim()) {
    errores.push("Una persona jurídica necesita el número del acta en que su junta o asamblea aprobó el aporte.");
  }
  const faltan = FUENTES_PROHIBIDAS.filter((f) => !a.verificaciones[f.id]);
  if (faltan.length) errores.push(`Confirme las ${faltan.length === FUENTES_PROHIBIDAS.length ? "" : `${faltan.length} `}verificaciones de fuentes prohibidas.`);
  if (tope && yaAportado + a.valor > tope * LIMITE_POR_APORTANTE) {
    errores.push(`Con este aporte, esa persona daría $ ${(yaAportado + a.valor).toLocaleString("es-CO")}: el máximo por aportante es el 10 % del tope ($ ${Math.floor(tope * LIMITE_POR_APORTANTE).toLocaleString("es-CO")}).`);
  }
  return errores;
}

// ---------- Exportación para el contador ----------

export type FilaLibro = {
  fecha: string; tipo: TipoMovimiento; codigo: number; concepto: string; forma: "dinero" | "especie"; valor: number;
  tercero?: string | null; tipoPersona?: string | null; documento?: string | null; parentesco?: string | null;
  acta?: string | null; soporte: boolean;
  /** Número de la factura o del recibo. */
  numeroSoporte?: string | null;
  /** Solo propaganda (208): por qué medio. */
  medio?: MedioPropaganda | null;
};

/** Medios de la propaganda electoral (código 208, anexo 5.7 B). */
export const MEDIOS_PROPAGANDA = [
  { id: "radio", nombre: "Radio" }, { id: "prensa", nombre: "Prensa y revistas" }, { id: "television", nombre: "Televisión" },
  { id: "internet", nombre: "Internet y redes sociales" }, { id: "vallas", nombre: "Vallas" },
  { id: "pasacalles", nombre: "Pasacalles y pendones" }, { id: "impresos", nombre: "Impresos (afiches, volantes)" }, { id: "otro", nombre: "Otro" },
] as const;
export type MedioPropaganda = (typeof MEDIOS_PROPAGANDA)[number]["id"];
export const nombreMedio = (m: string | null | undefined) => MEDIOS_PROPAGANDA.find((x) => x.id === m)?.nombre ?? "";

const celda = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const ddmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * Libro de ingresos y gastos en CSV para Excel en español (separador «;» y BOM). Los valores van sin puntos, como los
 * pide Cuentas Claras al digitarlos o importarlos. La primera línea identifica la exportación (marca de agua).
 */
export function libroCsv(filas: readonly FilaLibro[], marca: string): string {
  const encabezado = ["Fecha", "Tipo", "Código", "Clase", "Concepto", "Forma", "Valor", "Tercero", "Tipo de persona", "Documento o NIT", "Parentesco", "Acta de aprobación", "Soporte"];
  const lineas = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.codigo - b.codigo).map((f) => [
    ddmmaaaa(f.fecha), f.tipo === "ingreso" ? "Ingreso" : "Gasto", f.codigo, codigoFinanzas(f.codigo)?.nombre ?? "", f.concepto,
    f.forma === "especie" ? "Especie" : "Dinero", Math.round(f.valor), f.tercero, f.tipoPersona === "juridica" ? "Jurídica" : f.tipoPersona ? "Natural" : "",
    f.documento, f.parentesco, f.acta, f.soporte ? "Sí" : "No",
  ].map(celda).join(";"));
  return "﻿" + [celda(marca), encabezado.join(";"), ...lineas].join("\r\n") + "\r\n";
}

/** Totales por código, como el formulario 5B (100 = total de ingresos, 200 = total de gastos). */
export function resumenCsv(r: ResumenFinanzas, marca: string): string {
  const filas = [
    ["100", "Total de ingresos", r.ingresos],
    ...CODIGOS_FINANZAS.filter((c) => c.tipo === "ingreso").map((c) => [String(c.codigo), c.nombre, r.porCodigo[c.codigo] ?? 0]),
    ["200", "Total de gastos", r.gastos],
    ...CODIGOS_FINANZAS.filter((c) => c.tipo === "gasto").map((c) => [String(c.codigo), c.nombre, r.porCodigo[c.codigo] ?? 0]),
  ];
  return "﻿" + [celda(marca), "Código;Concepto;Valor", ...filas.map((f) => f.map(celda).join(";"))].join("\r\n") + "\r\n";
}

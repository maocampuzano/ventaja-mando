// Plantilla de Cuentas Claras: un Excel corto y fácil de entender, con la misma estructura de los formatos del
// aplicativo del CNE (ingresos, gastos, gastos de propaganda 208 y obligaciones por pagar) y un resumen como el
// formulario 5B, calculado con fórmulas. Sirve vacía (para llenarla a mano) o llena con el libro de la campaña.
// Es una plantilla GENÉRICA de apoyo: el informe oficial se presenta en el aplicativo Cuentas Claras.
import { CODIGOS_FINANZAS, LIMITE_POR_APORTANTE, nombreMedio, type FilaLibro } from "./finanzas.ts";
import { crearXlsx, type Celda, type Hoja } from "./xlsx.ts";

export type DatosPlantilla = {
  campana?: string; cargo?: string; tope?: number | null;
  /** Línea que identifica la exportación (quién, cuándo, referencia). */
  marca?: string;
  filas?: readonly FilaLibro[];
};

const ddmmaaaa = (iso: string) => /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso;
const siNo = (b: boolean) => (b ? "Sí" : "No");
const persona = (t?: string | null) => (t === "juridica" ? "Jurídica" : t ? "Natural" : "");

const INGRESOS = "Ingresos", GASTOS = "Gastos", PROPAGANDA = "Propaganda 208", OBLIGACIONES = "Obligaciones por pagar";

export function hojasCuentasClaras(d: DatosPlantilla = {}): Hoja[] {
  const filas = [...(d.filas ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.codigo - b.codigo);
  const ingresos = filas.filter((f) => f.tipo === "ingreso");
  const propaganda = filas.filter((f) => f.codigo === 208);
  const gastos = filas.filter((f) => f.tipo === "gasto" && f.codigo !== 208);

  const instrucciones = [
    "Plantilla de ingresos y gastos para Cuentas Claras",
    d.campana ? `Campaña: ${d.campana}${d.cargo ? ` · ${d.cargo}` : ""}` : "Campaña: ______________________________",
    ...(d.marca ? [d.marca] : []),
    "",
    "Para qué sirve: para llevar al día los ingresos y gastos de la campaña y pasárselos al contador. El informe oficial se presenta en el aplicativo Cuentas Claras del CNE (cnecuentasclaras.gov.co), que genera el formulario 5B y sus anexos.",
    "",
    "Cómo se llena:",
    "1. Cada ingreso, en la hoja «Ingresos»; cada gasto, en «Gastos». La propaganda (código 208) va SOLO en su hoja «Propaganda 208», no en «Gastos».",
    "2. En la columna «Código» use los números de la hoja «Códigos» (101 a 107 para ingresos y 201 a 211 para gastos).",
    "3. Escriba los valores en pesos, sin puntos ni signo (por ejemplo: 1500000).",
    "4. Lo que la campaña quedó debiendo al cierre va en «Obligaciones por pagar».",
    "5. La hoja «Resumen 5B» se calcula sola. Escriba allí el tope de gastos que fijó el CNE para su campaña.",
    "",
    "Reglas que no se pueden saltar (Ley 1475 de 2011):",
    "• Ningún aporte es anónimo: siempre nombre y cédula o NIT de quien aporta.",
    "• Un mismo aportante particular no puede dar más del 10 % del tope de gastos (art. 23).",
    "• Los ingresos de origen privado no pueden superar el tope de gastos (art. 23).",
    "• Están prohibidos los aportes de extranjeros, de funcionarios públicos, de contratistas con más del 50 % de ingresos del Estado y los de origen ilícito (art. 27).",
    "• Una empresa (persona jurídica) necesita el acta en que su junta o asamblea aprobó el aporte.",
    "• Todo ingreso en dinero pasa por la cuenta única bancaria de la campaña, y todo movimiento lleva su soporte (factura, recibo o acta).",
    "• Pasar el tope de gastos es causal de pérdida del cargo (art. 26).",
    "",
    "Plazos: registre los movimientos cada semana. El candidato presenta el informe al partido dentro del mes siguiente a la elección, firmado por el candidato, el contador y el gerente de campaña (si lo hay).",
    "",
    "Esta es una plantilla genérica de apoyo. El contador debe verificarla contra los formatos vigentes de Cuentas Claras.",
  ];

  const hojaIngresos: Hoja = {
    nombre: INGRESOS,
    columnas: [
      { titulo: "Fecha", ancho: 12 }, { titulo: "Código", ancho: 9 }, { titulo: "Concepto", ancho: 34 },
      { titulo: "Dinero o especie", ancho: 12 }, { titulo: "Valor", ancho: 15, pesos: true }, { titulo: "Quién aporta", ancho: 28 },
      { titulo: "Tipo de persona", ancho: 12 }, { titulo: "Cédula o NIT", ancho: 15 }, { titulo: "Parentesco (solo 101)", ancho: 16 },
      { titulo: "Acta (solo empresas)", ancho: 16 }, { titulo: "¿Tiene soporte?", ancho: 10 },
    ],
    filas: ingresos.map((f): Celda[] => [ddmmaaaa(f.fecha), f.codigo, f.concepto, f.forma === "especie" ? "Especie" : "Dinero", f.valor,
      f.tercero, persona(f.tipoPersona), f.documento, f.parentesco, f.acta, siNo(f.soporte)]),
  };
  const hojaGastos: Hoja = {
    nombre: GASTOS,
    columnas: [
      { titulo: "Fecha", ancho: 12 }, { titulo: "Código", ancho: 9 }, { titulo: "Concepto", ancho: 34 }, { titulo: "Valor", ancho: 15, pesos: true },
      { titulo: "Proveedor", ancho: 28 }, { titulo: "Cédula o NIT", ancho: 15 }, { titulo: "Factura o recibo No.", ancho: 16 }, { titulo: "¿Tiene soporte?", ancho: 10 },
    ],
    filas: gastos.map((f): Celda[] => [ddmmaaaa(f.fecha), f.codigo, f.concepto, f.valor, f.tercero, f.documento, f.numeroSoporte, siNo(f.soporte)]),
  };
  const hojaPropaganda: Hoja = {
    nombre: PROPAGANDA,
    columnas: [
      { titulo: "Fecha", ancho: 12 }, { titulo: "Medio", ancho: 18 }, { titulo: "Proveedor", ancho: 28 }, { titulo: "Cédula o NIT", ancho: 15 },
      { titulo: "Qué se compró (cantidad, tamaño o duración)", ancho: 36 }, { titulo: "Valor", ancho: 15, pesos: true },
      { titulo: "Factura o recibo No.", ancho: 16 }, { titulo: "¿Tiene soporte?", ancho: 10 },
    ],
    filas: propaganda.map((f): Celda[] => [ddmmaaaa(f.fecha), nombreMedio(f.medio), f.tercero, f.documento, f.concepto, f.valor, f.numeroSoporte, siNo(f.soporte)]),
  };
  const hojaObligaciones: Hoja = {
    nombre: OBLIGACIONES,
    columnas: [
      { titulo: "A quién se le debe", ancho: 28 }, { titulo: "Cédula o NIT", ancho: 15 }, { titulo: "Concepto", ancho: 34 },
      { titulo: "Código de gasto", ancho: 10 }, { titulo: "Valor pendiente", ancho: 15, pesos: true }, { titulo: "Fecha en que se paga", ancho: 14 },
    ],
    filas: [],
  };

  // Resumen como el 5B: cada código suma su hoja. Excel guarda las fórmulas en inglés y las muestra en español.
  const ref = (hoja: string) => `'${hoja}'`;
  const sumaIngreso = (c: number) => `SUMIF(${ref(INGRESOS)}!B:B,${c},${ref(INGRESOS)}!E:E)`;
  const sumaGasto = (c: number) => (c === 208 ? `SUM(${ref(PROPAGANDA)}!F:F)` : `SUMIF(${ref(GASTOS)}!B:B,${c},${ref(GASTOS)}!D:D)`);
  const codIngreso = CODIGOS_FINANZAS.filter((c) => c.tipo === "ingreso");
  const codGasto = CODIGOS_FINANZAS.filter((c) => c.tipo === "gasto");
  // Filas (1 es el encabezado): 2 = total 100, luego ingresos; después total 200 y gastos; al final los controles.
  const filaTotalIngresos = 2, primeraIngreso = 3, ultimaIngreso = primeraIngreso + codIngreso.length - 1;
  const filaTotalGastos = ultimaIngreso + 1, primeraGasto = filaTotalGastos + 1, ultimaGasto = primeraGasto + codGasto.length - 1;
  const filaTope = ultimaGasto + 2;
  const privados = [101, 102, 103, 104, 107].map((c) => `C${primeraIngreso + codIngreso.findIndex((x) => x.codigo === c)}`).join(",");
  const resumen: Hoja = {
    nombre: "Resumen 5B",
    columnas: [{ titulo: "Código", ancho: 9 }, { titulo: "Concepto", ancho: 52 }, { titulo: "Valor", ancho: 18, pesos: true }],
    filas: [
      [100, "TOTAL DE INGRESOS", { formula: `SUM(C${primeraIngreso}:C${ultimaIngreso})`, pesos: true }],
      ...codIngreso.map((c): Celda[] => [c.codigo, c.nombre, { formula: sumaIngreso(c.codigo), pesos: true }]),
      [200, "TOTAL DE GASTOS", { formula: `SUM(C${primeraGasto}:C${ultimaGasto})`, pesos: true }],
      ...codGasto.map((c): Celda[] => [c.codigo, c.nombre, { formula: sumaGasto(c.codigo), pesos: true }]),
      [null, null, null],
      [null, "Tope de gastos que fijó el CNE (escríbalo aquí)", d.tope ?? null],
      [null, "Porcentaje del tope ya gastado", { formula: `IF(C${filaTope}>0,ROUND(C${filaTotalGastos}/C${filaTope}*100,1)&" %","Falta el tope")` }],
      [null, "Máximo que puede dar un mismo aportante particular (10 % del tope)", { formula: `IF(C${filaTope}>0,C${filaTope}*${LIMITE_POR_APORTANTE},0)`, pesos: true }],
      [null, "Ingresos de origen privado (101, 102, 103, 104 y 107): no pueden pasar del tope", { formula: `SUM(${privados})`, pesos: true }],
      [null, "Saldo (ingresos menos gastos)", { formula: `C${filaTotalIngresos}-C${filaTotalGastos}`, pesos: true }],
      [null, "Obligaciones por pagar", { formula: `SUM(${ref(OBLIGACIONES)}!E:E)`, pesos: true }],
    ],
  };
  const codigos: Hoja = {
    nombre: "Códigos",
    columnas: [{ titulo: "Código", ancho: 9 }, { titulo: "Tipo", ancho: 9 }, { titulo: "Nombre", ancho: 44 }, { titulo: "Qué incluye", ancho: 80 }, { titulo: "Anexo del 5B", ancho: 12 }],
    filas: CODIGOS_FINANZAS.map((c): Celda[] => [c.codigo, c.tipo === "ingreso" ? "Ingreso" : "Gasto", c.nombre, c.detalle, c.anexo ?? ""]),
  };
  return [{ nombre: "Instrucciones", texto: instrucciones }, hojaIngresos, hojaGastos, hojaPropaganda, hojaObligaciones, resumen, codigos];
}

/** El archivo .xlsx de la plantilla (vacía si no se pasan movimientos). */
export const plantillaCuentasClaras = (d: DatosPlantilla = {}) => crearXlsx(hojasCuentasClaras(d));



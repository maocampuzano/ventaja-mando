// Planillas imprimibles en modo demo: los lotes viven en la pestaña (sessionStorage). Reproduce las reglas de
// public.crear_lote_planilla (supabase/migrations/…_planillas.sql) para que la demostración sea fiel.
import { MAX_HOJAS_POR_LOTE, lecturaSimuladaPlanilla } from "@ventaja/nucleo";
import { lideres } from "../data";
import type { FilaParaRevisar, FuenteDatos, LotePlanilla, PlanillaPorRevisar, ResultadoAprobacion, Sesion } from "./tipos";

const LLAVE = "vm-demo-lotes-planilla";

function leer(): LotePlanilla[] {
  try { return JSON.parse(sessionStorage.getItem(LLAVE) ?? "[]"); } catch { return []; }
}
function guardar(lista: LotePlanilla[]) {
  try { sessionStorage.setItem(LLAVE, JSON.stringify(lista)); } catch { /* sin almacenamiento */ }
}

const esDireccion = (s: Sesion) => s.rol === "administrador" || s.rol === "gerente";
/** Mismo alcance que privado.coordina_lider: la coordinación ve a los líderes de sus zonas. */
const puedeVerLider = (s: Sesion, zonaId: string) => esDireccion(s) || (s.rol === "coordinador" && s.territorioIds.includes(zonaId));

export const planillasDemo: Pick<FuenteDatos, "lotesPlanilla" | "crearLotePlanilla"> = {
  async lotesPlanilla(s) {
    const zonaDe = new Map(lideres.map((l) => [l.id, l.zonaId]));
    return leer().filter((l) => puedeVerLider(s, zonaDe.get(l.liderId) ?? "")).sort((a, b) => b.numero - a.numero).slice(0, 20);
  },
  async crearLotePlanilla(s, d) {
    if (!Number.isInteger(d.hojas) || d.hojas < 1 || d.hojas > MAX_HOJAS_POR_LOTE) {
      throw new Error(`Cada lote lleva entre 1 y ${MAX_HOJAS_POR_LOTE} hojas.`);
    }
    if (!d.finalidades.length) throw new Error("Marque al menos una finalidad de la autorización.");
    if (!d.texto.trim()) throw new Error("Falta el texto de autorización de la planilla.");
    const lider = lideres.find((l) => l.id === d.liderId);
    if (!lider) throw new Error("Ese líder no es de esta campaña.");
    if (!puedeVerLider(s, lider.zonaId)) {
      throw new Error("Solo la dirección de la campaña o la coordinación del líder imprimen sus planillas.");
    }
    const lista = leer();
    const lote: LotePlanilla = {
      id: crypto.randomUUID(),
      numero: lista.reduce((m, l) => Math.max(m, l.numero), 0) + 1,
      liderId: lider.id,
      lider: lider.nombre,
      hojas: d.hojas,
      generado: new Date().toISOString(),
    };
    guardar([...lista, lote]);
    return { id: lote.id, numero: lote.numero };
  },
};

// ---------- Revisión de planillas leídas (modo demo) ----------
// Dos fotos ficticias: una ya leída y vinculada a su hoja impresa, y otra pendiente de leer. Mismas reglas que
// public.aprobar_planilla: hay que vincular la hoja, revisar todas las filas, y sin firma no se registra.
type LoteOcrDemo = PlanillaPorRevisar & { liderId: string; loteImpreso: string | null };
const LLAVE_OCR = "vm-demo-ocr";

function lecturaComoFilas(prefijo: string): FilaParaRevisar[] {
  return lecturaSimuladaPlanilla().map((f) => ({
    filaId: `${prefijo}-${f.renglon}`, renglon: f.renglon, nombre: f.nombre, cedula: f.cedula, celular: f.celular,
    barrio: f.barrio, firma: f.firma, confianza: f.confianza,
  }));
}
function estadoOcr(): { lotes: LoteOcrDemo[]; filas: Record<string, FilaParaRevisar[]> } {
  try {
    const g = sessionStorage.getItem(LLAVE_OCR);
    if (g) return JSON.parse(g);
  } catch { /* sin almacenamiento */ }
  const hoy = new Date().toISOString();
  return {
    lotes: [
      { id: "ocr-demo-1", lider: lideres[0].nombre, liderId: lideres[0].id, estado: "leido", loteNumero: 14, hoja: 1, loteImpreso: "impreso-demo-14", filas: 6, creada: hoy, error: null },
      { id: "ocr-demo-2", lider: lideres[1].nombre, liderId: lideres[1].id, estado: "pendiente", loteNumero: null, hoja: null, loteImpreso: null, filas: 0, creada: hoy, error: null },
    ],
    filas: { "ocr-demo-1": lecturaComoFilas("ocr-demo-1") },
  };
}
function guardarOcr(e: ReturnType<typeof estadoOcr>) {
  try { sessionStorage.setItem(LLAVE_OCR, JSON.stringify(e)); } catch { /* sin almacenamiento */ }
}
function loteVisible(s: Sesion, id: string) {
  const e = estadoOcr();
  const l = e.lotes.find((x) => x.id === id);
  const zona = lideres.find((x) => x.id === l?.liderId)?.zonaId ?? "";
  if (!l || !(puedeVerLider(s, zona) || (s.rol === "lider" && l.liderId === lideres[0].id))) {
    throw new Error("La planilla no existe o no la puede revisar.");
  }
  return { e, l };
}

export const revisionDemo: Pick<FuenteDatos, "planillasPorRevisar" | "fotoPlanilla" | "leerPlanilla" | "filasPlanilla" | "vincularHoja" | "aprobarPlanilla"> = {
  async planillasPorRevisar(s) {
    const zonaDe = new Map(lideres.map((l) => [l.id, l.zonaId]));
    return estadoOcr().lotes.filter((l) => l.estado !== ("aprobado" as string) && puedeVerLider(s, zonaDe.get(l.liderId) ?? ""))
      .map((l) => ({ id: l.id, lider: l.lider, estado: l.estado, loteNumero: l.loteNumero, hoja: l.hoja, filas: l.filas, creada: l.creada, error: l.error }));
  },
  async fotoPlanilla() { return null; },
  async leerPlanilla(s, id) {
    const { e, l } = loteVisible(s, id);
    if (l.estado !== "pendiente") throw new Error("Esta planilla ya se leyó.");
    await new Promise((r) => setTimeout(r, 400));
    e.filas[id] = lecturaComoFilas(id);
    l.estado = "leido"; l.filas = e.filas[id].length;
    guardarOcr(e);
    return l.filas;
  },
  async filasPlanilla(s, id) { const { e } = loteVisible(s, id); return e.filas[id] ?? []; },
  async vincularHoja(s, id, loteImpreso, hoja) {
    const { e, l } = loteVisible(s, id);
    const impreso = leer().find((x) => x.id === loteImpreso);
    if (!impreso) throw new Error("El código QR no es de una planilla de esta campaña.");
    if (impreso.liderId !== l.liderId) throw new Error("El código QR es de una planilla impresa para otro líder.");
    if (!(hoja >= 1 && hoja <= impreso.hojas)) throw new Error("El número de hoja no corresponde a ese lote.");
    l.loteImpreso = impreso.id; l.loteNumero = impreso.numero; l.hoja = hoja;
    guardarOcr(e);
  },
  async aprobarPlanilla(s, id, filas) {
    const { e, l } = loteVisible(s, id);
    if (l.estado === "pendiente") throw new Error("Esta planilla no está lista para aprobar (estado: pendiente).");
    if (!l.loteImpreso) throw new Error("Vincule la foto con su planilla impresa (código QR) antes de aprobar.");
    const ids = new Set((e.filas[id] ?? []).map((f) => f.filaId));
    if (filas.length !== ids.size || filas.some((f) => !ids.has(f.filaId))) throw new Error("Revise todas las filas leídas de la hoja antes de aprobar.");
    const r: ResultadoAprobacion = { creadas: 0, yaExistian: 0, sinFirma: 0, descartadas: 0, rechazos: [] };
    for (const f of filas) {
      if (f.descartar) r.descartadas++;
      else if (!f.firma) r.sinFirma++;
      else if (f.nombre.trim().length < 3) r.rechazos.push({ filaId: f.filaId, motivo: "Falta el nombre." });
      else r.creadas++;
    }
    e.lotes = e.lotes.filter((x) => x.id !== id);
    guardarOcr(e);
    return r;
  },
};

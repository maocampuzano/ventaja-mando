// Planillas imprimibles en modo demo: los lotes viven en la pestaña (sessionStorage). Reproduce las reglas de
// public.crear_lote_planilla (supabase/migrations/…_planillas.sql) para que la demostración sea fiel.
import { MAX_HOJAS_POR_LOTE } from "@ventaja/nucleo";
import { lideres } from "../data";
import type { FuenteDatos, LotePlanilla, Sesion } from "./tipos";

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

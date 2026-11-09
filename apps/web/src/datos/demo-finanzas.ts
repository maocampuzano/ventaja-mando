// Finanzas en modo demo: libro en memoria de la pestaña con movimientos ficticios. Aplica las mismas reglas que la base
// (supabase/migrations/…_finanzas.sql y nucleo/finanzas.ts): 10 % por aportante, privados hasta el tope, nada anónimo,
// fuentes prohibidas y acta para personas jurídicas.
import { CODIGOS_PRIVADOS, revisarAporte, type MedioPropaganda } from "@ventaja/nucleo";
import type { FuenteDatos, MovimientoPanel, Sesion, TerceroPanel } from "./tipos";

type Metodos = Pick<FuenteDatos, "finanzas" | "configurarTope" | "registrarTercero" | "registrarMovimiento" | "anularMovimiento" | "exportarLibro" | "verSoporte">;
type Extra = { parentesco?: string | null; acta?: string | null; numeroSoporte?: string | null; medio?: MedioPropaganda | null };

const esDireccion = (s: Sesion) => s.rol === "administrador" || s.rol === "gerente";
const puedeVer = (s: Sesion) => esDireccion(s) || s.rol === "candidato";

export function crearFinanzasDemo(): Metodos {
  let tope: number | null = 450_000_000;
  let terceros: (TerceroPanel & { documento: string })[] = [
    { id: "t1", nombre: "Litografía Ficticia S.A.S.", tipoPersona: "juridica", documento: "900000001" },
  ];
  let movimientos: (MovimientoPanel & Extra)[] = [
    { id: "m1", tipo: "ingreso", codigo: 101, fecha: "2027-08-01", valor: 20_000_000, concepto: "Aporte de la candidata (ficticio)", forma: "dinero", terceroId: null, tercero: null, soporte: true, parentesco: "La candidata" },
    { id: "m2", tipo: "ingreso", codigo: 105, fecha: "2027-08-20", valor: 15_000_000, concepto: "Anticipo estatal (ficticio)", forma: "dinero", terceroId: null, tercero: null, soporte: true },
    { id: "m3", tipo: "gasto", codigo: 208, fecha: "2027-09-02", valor: 4_500_000, concepto: "Pendones y afiches (ficticio)", forma: "dinero", terceroId: "t1", tercero: "Litografía Ficticia S.A.S.", soporte: true, numeroSoporte: "FE-1024", medio: "pasacalles" },
    { id: "m4", tipo: "gasto", codigo: 201, fecha: "2027-09-05", valor: 2_800_000, concepto: "Arriendo de la sede, septiembre (ficticio)", forma: "dinero", terceroId: null, tercero: null, soporte: false },
  ];
  const exigirDireccion = (s: Sesion) => { if (!esDireccion(s)) throw new Error("Solo la dirección registra en las finanzas."); };

  return {
    async finanzas(s) {
      if (!puedeVer(s)) throw new Error("No tiene acceso a las finanzas de la campaña.");
      return {
        tope,
        movimientos: movimientos.map((m): MovimientoPanel => ({ id: m.id, tipo: m.tipo, codigo: m.codigo, fecha: m.fecha, valor: m.valor, concepto: m.concepto,
          forma: m.forma, terceroId: m.terceroId, tercero: m.tercero, soporte: m.soporte })),
        terceros: terceros.map((t): TerceroPanel => ({ id: t.id, nombre: t.nombre, tipoPersona: t.tipoPersona })),
      };
    },
    async configurarTope(s, valor) { exigirDireccion(s); tope = valor; },
    async registrarTercero(s, d) {
      exigirDireccion(s);
      const documento = d.documento.replace(/\D/g, "");
      if (!documento) throw new Error("Escriba el documento o NIT: no se registran terceros anónimos.");
      const ya = terceros.find((t) => t.documento === documento);
      if (ya) return ya.id;
      const id = `t${Date.now()}`;
      terceros = [...terceros, { id, nombre: d.nombre.trim(), tipoPersona: d.tipoPersona, documento }];
      return id;
    },
    async registrarMovimiento(s, d) {
      exigirDireccion(s);
      if (d.codigo === 208 && !d.medio) throw new Error("Indique el medio de la propaganda (radio, prensa, internet, vallas…).");
      if (d.codigo === 101 && !d.parentesco?.trim()) throw new Error("Indique de quién son los recursos propios: la candidata o el parentesco del familiar.");
      const t = terceros.find((x) => x.id === d.terceroId);
      if (d.codigo === 102) {
        const ya = movimientos.filter((m) => m.codigo === 102 && m.terceroId === d.terceroId).reduce((a, m) => a + m.valor, 0);
        const errores = revisarAporte({ valor: d.valor, tipoPersona: t?.tipoPersona ?? "natural", documento: t?.documento ?? "", acta: d.acta, verificaciones: d.verificacion ?? {} }, ya, tope);
        if (errores.length) throw new Error(errores[0]);
      }
      if ((CODIGOS_PRIVADOS as readonly number[]).includes(d.codigo) && tope) {
        const privados = movimientos.filter((m) => (CODIGOS_PRIVADOS as readonly number[]).includes(m.codigo)).reduce((a, m) => a + m.valor, 0);
        if (privados + d.valor > tope) throw new Error("Los ingresos de origen privado pasarían el tope de gastos (Ley 1475, art. 23).");
      }
      movimientos = [...movimientos, {
        id: `m${Date.now()}`, tipo: d.codigo < 200 ? "ingreso" : "gasto", codigo: d.codigo, fecha: d.fecha, valor: d.valor, concepto: d.concepto.trim(),
        forma: d.forma, terceroId: t?.id ?? null, tercero: t?.nombre ?? null, soporte: !!d.soporte, parentesco: d.parentesco ?? null, acta: d.acta ?? null,
        numeroSoporte: d.numeroSoporte?.trim() || null, medio: d.codigo === 208 ? d.medio ?? null : null,
      }];
    },
    async anularMovimiento(s, id) { exigirDireccion(s); movimientos = movimientos.filter((m) => m.id !== id); },
    async exportarLibro(s) {
      exigirDireccion(s);
      return {
        referencia: "DEMO", exportadoPor: s.nombre, exportadoEn: new Date().toISOString(),
        filas: movimientos.map((m) => {
          const t = terceros.find((x) => x.id === m.terceroId);
          return { fecha: m.fecha, tipo: m.tipo, codigo: m.codigo, concepto: m.concepto, forma: m.forma, valor: m.valor,
            tercero: t?.nombre ?? null, tipoPersona: t?.tipoPersona ?? null, documento: t?.documento ?? null,
            parentesco: m.parentesco ?? null, acta: m.acta ?? null, soporte: m.soporte, numeroSoporte: m.numeroSoporte ?? null, medio: m.medio ?? null };
        }),
      };
    },
    async verSoporte() { return null; },
  };
}

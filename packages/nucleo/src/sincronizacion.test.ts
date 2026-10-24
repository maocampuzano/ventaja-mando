import { describe, expect, it } from "vitest";
import {
  AlmacenEnMemoria, ColaSincronizacion, ErrorDefinitivo, ErrorDeRed, espera, transporteSupabase, type LlamarRpc, type Operacion, type Transporte,
} from "./sincronizacion";

/** Servidor falso e idempotente por id, como las funciones *_movil de la base. */
class ServidorFalso implements Transporte {
  personas = new Map<string, unknown>();
  planillas = new Map<string, unknown>();
  conSenal = true;
  /** Guarda, pero la respuesta no llega al celular (la señal se cae justo después). */
  perderRespuestas = 0;
  revisados = new Set<string>();
  async enviar(op: Operacion) {
    if (!this.conSenal) throw new ErrorDeRed("Sin señal");
    if ((op.datos as { nombre?: string }).nombre === "") throw new ErrorDefinitivo("Falta el nombre.");
    const tabla = op.tipo === "planilla" ? this.planillas : this.personas;
    const yaEstaba = tabla.has(op.id);
    tabla.set(op.id, op.datos);
    if (this.perderRespuestas > 0) { this.perderRespuestas--; throw new ErrorDeRed("Se cayó la señal antes de la respuesta"); }
    return yaEstaba ? "ya_estaba" as const : "creada" as const;
  }
  async revisadas(ids: string[]) { return ids.filter((i) => this.revisados.has(i)); }
}

function crear(servidor: ServidorFalso, almacen = new AlmacenEnMemoria()) {
  let n = 0, reloj = 1_000_000;
  const cola = new ColaSincronizacion(almacen, servidor, () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, () => reloj);
  return { cola, almacen, avanzar: (ms: number) => { reloj += ms; } };
}

describe("cola de sincronización", () => {
  it("sin conexión, 10 registros y 2 planillas se sincronizan sin duplicar al volver la señal", async () => {
    const servidor = new ServidorFalso();
    const { cola, avanzar, almacen } = crear(servidor);
    servidor.conSenal = false;
    for (let i = 1; i <= 10; i++) await cola.agregar("persona", { nombre: `Persona Ficticia ${i}` });
    await cola.agregar("planilla", { foto: "planilla-1.jpg" });
    await cola.agregar("planilla", { foto: "planilla-2.jpg" });

    // Sin señal: todo queda pendiente en el celular y nada llega al servidor.
    const r1 = await cola.sincronizar();
    expect(r1.sinSenal).toBe(true);
    expect((await cola.conteo()).pendiente).toBe(12);
    expect(servidor.personas.size + servidor.planillas.size).toBe(0);

    // Vuelve la señal, pero se cae en medio: tres envíos llegan al servidor y su respuesta se pierde.
    servidor.conSenal = true;
    servidor.perderRespuestas = 3;
    avanzar(espera(1));
    await cola.sincronizar();
    for (let i = 0; i < 6; i++) { avanzar(espera(5)); await cola.sincronizar(); }

    // El celular se reinicia (otra instancia de la cola sobre el mismo almacén) y sigue.
    const otra = new ColaSincronizacion(almacen, servidor, () => "no-se-usa");
    await otra.sincronizar();

    expect(servidor.personas.size).toBe(10);
    expect(servidor.planillas.size).toBe(2);
    expect(await otra.conteo()).toEqual({ pendiente: 0, enviado: 12, revisado: 0, error: 0 });
  });

  it("el reintento de algo que ya llegó no duplica: el servidor responde «ya_estaba»", async () => {
    const servidor = new ServidorFalso();
    const { cola, avanzar } = crear(servidor);
    await cola.agregar("persona", { nombre: "Ana Ficticia" });
    servidor.perderRespuestas = 1;
    expect((await cola.sincronizar()).pendientes).toBe(1);
    avanzar(espera(1));
    expect(await cola.sincronizar()).toMatchObject({ enviadas: 0, yaEstaban: 1, pendientes: 0 });
    expect(servidor.personas.size).toBe(1);
  });

  it("respeta la espera entre intentos y la va alargando", async () => {
    const servidor = new ServidorFalso();
    servidor.conSenal = false;
    const { cola, avanzar } = crear(servidor);
    await cola.agregar("persona", { nombre: "Ana" });
    await cola.sincronizar();
    servidor.conSenal = true;
    expect((await cola.sincronizar()).pendientes).toBe(1); // todavía no toca
    avanzar(espera(1));
    expect((await cola.sincronizar()).enviadas).toBe(1);
    expect([espera(1), espera(2), espera(3), espera(30)]).toEqual([5_000, 10_000, 20_000, 600_000]);
  });

  it("un rechazo definitivo no se reintenta solo: queda con su motivo hasta que el líder lo corrija", async () => {
    const servidor = new ServidorFalso();
    const { cola } = crear(servidor);
    const op = await cola.agregar("persona", { nombre: "" });
    await cola.agregar("persona", { nombre: "Luis Ficticio" });
    expect(await cola.sincronizar()).toMatchObject({ errores: 1, enviadas: 1 });
    expect((await cola.operaciones())[0]).toMatchObject({ estado: "error", ultimoError: "Falta el nombre." });
    expect((await cola.sincronizar()).errores).toBe(0); // no insiste

    await cola.reintentar(op.id, { nombre: "Ana Corregida" });
    expect((await cola.sincronizar()).enviadas).toBe(1);
  });

  it("llamadas simultáneas comparten la misma vuelta: nada se envía dos veces", async () => {
    const servidor = new ServidorFalso();
    let envios = 0;
    const contador: Transporte = { enviar: async (op) => { envios++; await new Promise((r) => setTimeout(r, 5)); return servidor.enviar(op); } };
    const cola = new ColaSincronizacion(new AlmacenEnMemoria(), contador, () => crypto.randomUUID());
    for (let i = 0; i < 3; i++) await cola.agregar("persona", { nombre: `P${i}` });
    await Promise.all([cola.sincronizar(), cola.sincronizar(), cola.sincronizar()]);
    expect(envios).toBe(3);
  });

  it("marca como revisado lo que una persona ya revisó en el servidor", async () => {
    const servidor = new ServidorFalso();
    const { cola } = crear(servidor);
    const a = await cola.agregar("planilla", { foto: "p.jpg" });
    await cola.agregar("persona", { nombre: "Ana" });
    await cola.sincronizar();
    servidor.revisados.add(a.id);
    await cola.sincronizar();
    expect(await cola.conteo()).toEqual({ pendiente: 0, enviado: 1, revisado: 1, error: 0 });
  });

  it("el líder puede descartar lo rechazado; lo pendiente no se descarta", async () => {
    const servidor = new ServidorFalso();
    const { cola } = crear(servidor);
    const mala = await cola.agregar("persona", { nombre: "" });
    await cola.sincronizar();
    servidor.conSenal = false;
    const pendiente = await cola.agregar("persona", { nombre: "Luis" });
    await cola.sincronizar();
    await cola.descartar(pendiente.id);
    await cola.descartar(mala.id);
    expect((await cola.operaciones()).map((o) => o.id)).toEqual([pendiente.id]);
  });
});

describe("transporte a Supabase", () => {
  const op = (tipo: Operacion["tipo"], datos: unknown): Operacion =>
    ({ id: "00000000-0000-4000-8000-000000000001", tipo, datos, estado: "pendiente", intentos: 0, creadaEn: Date.UTC(2026, 9, 20, 15), proximoIntento: 0 });

  it("llama a la función de cada tipo con el identificador del celular y la hora de captura", async () => {
    const llamadas: [string, Record<string, unknown>][] = [];
    const rpc: LlamarRpc = async (f, p) => { llamadas.push([f, p]); return { data: "creada", error: null }; };
    const t = transporteSupabase(rpc);
    await t.enviar(op("persona", { campana: "c", nombre: "Ana", finalidades: ["contacto_campana"], canal: "presencial", evidencia: "firma.jpg" }));
    await t.enviar(op("planilla", { campana: "c", archivo: "p.jpg" }));
    await t.enviar(op("novedad", { campana: "c", puesto: "p", mesa: 3, tipo: "apertura" }));
    await t.enviar(op("e14", { campana: "c", puesto: "p", mesa: 3, foto: "e.jpg" }));
    expect(llamadas.map((l) => l[0])).toEqual(["registrar_persona_movil", "registrar_planilla_movil", "registrar_novedad_movil", "registrar_e14_movil"]);
    expect(llamadas[0][1]).toMatchObject({ p_id: "00000000-0000-4000-8000-000000000001", p_capturado_en: "2026-10-20T15:00:00.000Z", p_documento: null });
  });

  it("separa el rechazo del servidor (no se reintenta) de la falta de señal (sí)", async () => {
    const con = (r: Awaited<ReturnType<LlamarRpc>> | Error) => transporteSupabase(async () => { if (r instanceof Error) throw r; return r; });
    const p = op("planilla", { campana: "c", archivo: "p.jpg" });
    await expect(con({ data: null, error: { code: "42501", message: "Solo un líder sube planillas desde la app." } }).enviar(p)).rejects.toBeInstanceOf(ErrorDefinitivo);
    await expect(con({ data: null, error: { code: "23505", message: "Ya está en la base (misma cédula)." } }).enviar(p)).rejects.toThrow("misma cédula");
    await expect(con(new TypeError("Network request failed")).enviar(p)).rejects.toBeInstanceOf(ErrorDeRed);
    await expect(con({ data: null, error: { code: "57014", message: "timeout" } }).enviar(p)).rejects.toBeInstanceOf(ErrorDeRed);
    await expect(con({ data: "ya_estaba", error: null }).enviar(p)).resolves.toBe("ya_estaba");
    await expect(con({ data: null, error: null }).enviar(op("respuesta", {}))).rejects.toBeInstanceOf(ErrorDefinitivo);
  });
});

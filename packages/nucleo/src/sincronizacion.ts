// Cola de sincronización de la app (fase 3): funciona sin señal desde el primer día.
// Cada operación nace en el celular con su propio identificador (UUID). El servidor lo usa como llave: si la señal se
// cae después de que el servidor guardó pero antes de que el celular reciba la respuesta, el reintento no duplica
// (el servidor responde «ya_estaba»). El almacenamiento (SQLite en la app, memoria en las pruebas) y el envío
// (Supabase) se inyectan, para poder probar todo sin teléfono ni red.

export type TipoOperacion = "persona" | "planilla" | "respuesta" | "novedad" | "e14";
export type EstadoOperacion = "pendiente" | "enviado" | "revisado" | "error";

export type Operacion<D = unknown> = {
  id: string;
  tipo: TipoOperacion;
  datos: D;
  estado: EstadoOperacion;
  intentos: number;
  creadaEn: number; // ms
  proximoIntento: number; // ms; 0 = ya
  ultimoError?: string;
};

export interface Almacen {
  todas(): Promise<Operacion[]>;
  guardar(op: Operacion): Promise<void>;
  borrar(id: string): Promise<void>;
}

/** El servidor aplica la operación de forma idempotente por `op.id`. */
export interface Transporte {
  enviar(op: Operacion): Promise<"creada" | "ya_estaba">;
  /** Ids ya revisados por una persona (por ejemplo, persona validada o planilla aprobada). */
  revisadas?(ids: string[]): Promise<string[]>;
}

/** Sin señal, servidor caído o tiempo agotado: se reintenta. */
export class ErrorDeRed extends Error {}
/** El servidor rechazó la operación (permisos, datos inválidos): reintentar no lo arregla; se muestra al líder. */
export class ErrorDefinitivo extends Error {}

export const ESPERA_BASE_MS = 5_000;
export const ESPERA_MAXIMA_MS = 10 * 60_000;
/** 5 s, 10 s, 20 s… hasta 10 minutos entre intentos. */
export const espera = (intentos: number) => Math.min(ESPERA_MAXIMA_MS, ESPERA_BASE_MS * 2 ** Math.max(0, intentos - 1));

export type Resumen = { enviadas: number; yaEstaban: number; pendientes: number; errores: number; sinSenal: boolean };

export class ColaSincronizacion {
  private enCurso: Promise<Resumen> | null = null;

  private almacen: Almacen;
  private transporte: Transporte;
  private nuevoId: () => string;
  private ahora: () => number;

  constructor(almacen: Almacen, transporte: Transporte, nuevoId: () => string, ahora: () => number = Date.now) {
    this.almacen = almacen;
    this.transporte = transporte;
    this.nuevoId = nuevoId;
    this.ahora = ahora;
  }

  /** Guarda la operación en el celular. Nunca falla por falta de señal. */
  async agregar<D>(tipo: TipoOperacion, datos: D, id = this.nuevoId()): Promise<Operacion<D>> {
    const op: Operacion<D> = { id, tipo, datos, estado: "pendiente", intentos: 0, creadaEn: this.ahora(), proximoIntento: 0 };
    await this.almacen.guardar(op);
    return op;
  }

  async operaciones(): Promise<Operacion[]> {
    return (await this.almacen.todas()).sort((a, b) => a.creadaEn - b.creadaEn);
  }

  /** Envía lo pendiente en el orden en que se creó. Si se llama mientras ya corre, espera a la misma vuelta. */
  sincronizar(): Promise<Resumen> {
    if (!this.enCurso) this.enCurso = this.vuelta().finally(() => { this.enCurso = null; });
    return this.enCurso;
  }

  private async vuelta(): Promise<Resumen> {
    const r: Resumen = { enviadas: 0, yaEstaban: 0, pendientes: 0, errores: 0, sinSenal: false };
    for (const op of await this.operaciones()) {
      if (op.estado !== "pendiente") continue;
      if (r.sinSenal || op.proximoIntento > this.ahora()) { r.pendientes++; continue; }
      try {
        const res = await this.transporte.enviar(op);
        await this.almacen.guardar({ ...op, estado: "enviado", intentos: op.intentos + 1, ultimoError: undefined });
        if (res === "creada") r.enviadas++; else r.yaEstaban++;
      } catch (e) {
        const intentos = op.intentos + 1;
        if (e instanceof ErrorDefinitivo) {
          await this.almacen.guardar({ ...op, estado: "error", intentos, ultimoError: e.message });
          r.errores++;
        } else {
          // Sin señal: no se insiste con las demás en esta vuelta; quedan para la siguiente.
          await this.almacen.guardar({ ...op, intentos, proximoIntento: this.ahora() + espera(intentos), ultimoError: (e as Error).message });
          r.pendientes++;
          r.sinSenal = true;
        }
      }
    }
    if (!r.sinSenal && this.transporte.revisadas) await this.actualizarRevisadas();
    return r;
  }

  private async actualizarRevisadas() {
    const enviadas = (await this.almacen.todas()).filter((o) => o.estado === "enviado");
    if (!enviadas.length) return;
    try {
      const revisadas = new Set(await this.transporte.revisadas!(enviadas.map((o) => o.id)));
      for (const op of enviadas) if (revisadas.has(op.id)) await this.almacen.guardar({ ...op, estado: "revisado" });
    } catch { /* se intenta en la próxima vuelta */ }
  }

  /** Vuelve a poner en cola una operación con error, después de que el líder la corrigió. */
  async reintentar(id: string, datos?: unknown) {
    const op = (await this.almacen.todas()).find((o) => o.id === id);
    if (op && op.estado === "error") await this.almacen.guardar({ ...op, datos: datos ?? op.datos, estado: "pendiente", proximoIntento: 0, ultimoError: undefined });
  }

  /** El líder decide no enviar una operación rechazada (por ejemplo, la persona ya estaba en la base). */
  async descartar(id: string) {
    const op = (await this.almacen.todas()).find((o) => o.id === id);
    if (op && op.estado === "error") await this.almacen.borrar(id);
  }

  /** Para la pantalla: cuántas hay en cada estado. */
  async conteo(): Promise<Record<EstadoOperacion, number>> {
    const c: Record<EstadoOperacion, number> = { pendiente: 0, enviado: 0, revisado: 0, error: 0 };
    for (const o of await this.almacen.todas()) c[o.estado]++;
    return c;
  }
}

/** Almacén en memoria (pruebas y modo demo). La app usa SQLite con la misma interfaz. */
const copia = (op: Operacion): Operacion => JSON.parse(JSON.stringify(op)) as Operacion;

export class AlmacenEnMemoria implements Almacen {
  private ops = new Map<string, Operacion>();
  async todas() { return [...this.ops.values()].map(copia); }
  async guardar(op: Operacion) { this.ops.set(op.id, copia(op)); }
  async borrar(id: string) { this.ops.delete(id); }
}

// Envío a Supabase -----------------------------------------------------------------------------------------------

/** Lo mínimo del cliente de Supabase que usa el transporte (`supabase.rpc`), para no depender de la librería aquí. */
export type LlamarRpc = (
  funcion: string,
  parametros: Record<string, unknown>,
) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;

export type DatosPersonaMovil = {
  campana: string; nombre: string; documento?: string | null; telefono?: string | null; zona?: string | null;
  finalidades: string[]; canal: "presencial" | "enlace"; evidencia: string;
};
export type DatosPlanillaMovil = { campana: string; archivo: string };
export type DatosNovedadMovil = {
  campana: string; puesto: string; mesa: number | null; tipo: string; descripcion?: string | null;
  prioridad?: "alta" | "media" | "baja"; evidencia?: string | null;
};
export type DatosE14Movil = { campana: string; puesto: string; mesa: number; foto: string };

/** Códigos de Postgres que significan «el servidor dijo que no»: reintentar no lo arregla. */
const RECHAZOS = new Set(["42501", "22023", "23505", "23514", "P0001", "PGRST202"]);

function llamada(op: Operacion): [string, Record<string, unknown>] {
  const capturado = new Date(op.creadaEn).toISOString();
  switch (op.tipo) {
    case "persona": {
      const d = op.datos as DatosPersonaMovil;
      return ["registrar_persona_movil", {
        p_id: op.id, p_campana: d.campana, p_nombre: d.nombre, p_documento: d.documento ?? null, p_telefono: d.telefono ?? null,
        p_zona: d.zona ?? null, p_finalidades: d.finalidades, p_canal: d.canal, p_evidencia: d.evidencia, p_capturado_en: capturado,
      }];
    }
    case "planilla": {
      const d = op.datos as DatosPlanillaMovil;
      return ["registrar_planilla_movil", { p_id: op.id, p_campana: d.campana, p_archivo: d.archivo }];
    }
    case "novedad": {
      const d = op.datos as DatosNovedadMovil;
      return ["registrar_novedad_movil", {
        p_id: op.id, p_campana: d.campana, p_puesto: d.puesto, p_mesa: d.mesa, p_tipo: d.tipo, p_descripcion: d.descripcion ?? null,
        p_prioridad: d.prioridad ?? "media", p_evidencia: d.evidencia ?? null, p_hora: capturado,
      }];
    }
    case "e14": {
      const d = op.datos as DatosE14Movil;
      return ["registrar_e14_movil", { p_id: op.id, p_campana: d.campana, p_puesto: d.puesto, p_mesa: d.mesa, p_foto: d.foto }];
    }
    default:
      throw new ErrorDefinitivo(`La app todavía no envía operaciones de tipo «${op.tipo}».`);
  }
}

/** Transporte real: cada tipo va a su función *_movil (supabase/migrations/20261026000100_sincronizacion.sql). */
export function transporteSupabase(rpc: LlamarRpc): Transporte {
  const llamar = async (funcion: string, parametros: Record<string, unknown>) => {
    let r: Awaited<ReturnType<LlamarRpc>>;
    try { r = await rpc(funcion, parametros); } catch (e) { throw new ErrorDeRed((e as Error).message || "Sin conexión"); }
    if (r.error) {
      if (r.error.code && RECHAZOS.has(r.error.code)) throw new ErrorDefinitivo(r.error.message);
      throw new ErrorDeRed(r.error.message);
    }
    return r.data;
  };
  return {
    async enviar(op) {
      const [funcion, parametros] = llamada(op);
      const res = await llamar(funcion, parametros);
      if (res !== "creada" && res !== "ya_estaba") throw new ErrorDeRed("Respuesta inesperada del servidor");
      return res;
    },
    async revisadas(ids) {
      const res = await llamar("estado_registros_movil", { p_ids: ids });
      return Array.isArray(res) ? res.map(String) : [];
    },
  };
}

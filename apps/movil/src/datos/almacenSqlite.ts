// La cola de sincronización y la copia local de lo que el líder o el testigo necesitan ver sin señal, en SQLite.
// Se escribe contra lo mínimo de expo-sqlite (execAsync, runAsync, getAllAsync) para poder probarlo en Node
// con node:sqlite, que tiene la misma base de datos.
import type { Almacen, Operacion } from "@ventaja/nucleo";

export type Valor = string | number | null;
export interface BaseSQLite {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...parametros: Valor[]): Promise<unknown>;
  getAllAsync<T>(sql: string, ...parametros: Valor[]): Promise<T[]>;
}

const ESQUEMA = `
  create table if not exists operacion (
    id text primary key,
    tipo text not null,
    datos text not null,
    estado text not null,
    intentos integer not null,
    creada_en integer not null,
    proximo_intento integer not null,
    ultimo_error text
  );
  create table if not exists copia_local (
    clave text primary key,
    valor text not null,
    actualizada_en integer not null
  );
`;

type Fila = {
  id: string; tipo: Operacion["tipo"]; datos: string; estado: Operacion["estado"]; intentos: number;
  creada_en: number; proximo_intento: number; ultimo_error: string | null;
};

export async function prepararBase(db: BaseSQLite) {
  await db.execAsync(ESQUEMA);
}

export class AlmacenSQLite implements Almacen {
  private db: BaseSQLite;
  constructor(db: BaseSQLite) { this.db = db; }

  async todas(): Promise<Operacion[]> {
    // rowid conserva el orden de llegada aunque dos registros tengan el mismo milisegundo.
    const filas = await this.db.getAllAsync<Fila>("select * from operacion order by creada_en, rowid");
    return filas.map((f) => ({
      id: f.id, tipo: f.tipo, datos: JSON.parse(f.datos), estado: f.estado, intentos: f.intentos,
      creadaEn: f.creada_en, proximoIntento: f.proximo_intento, ...(f.ultimo_error ? { ultimoError: f.ultimo_error } : {}),
    }));
  }

  async guardar(op: Operacion) {
    await this.db.runAsync(
      `insert into operacion (id, tipo, datos, estado, intentos, creada_en, proximo_intento, ultimo_error)
       values (?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (id) do update set datos = excluded.datos, estado = excluded.estado, intentos = excluded.intentos,
         proximo_intento = excluded.proximo_intento, ultimo_error = excluded.ultimo_error`,
      op.id, op.tipo, JSON.stringify(op.datos), op.estado, op.intentos, op.creadaEn, op.proximoIntento, op.ultimoError ?? null,
    );
  }

  async borrar(id: string) {
    await this.db.runAsync("delete from operacion where id = ?", id);
  }

  /** Lo ya revisado no hace falta guardarlo para siempre en el teléfono: se limpia a los 30 días. */
  async limpiarRevisadas(antesDe: number) {
    await this.db.runAsync("delete from operacion where estado = 'revisado' and creada_en < ?", antesDe);
  }
}

/** Copia local de lo último que llegó del servidor (tareas, meta, personas, mesa), para verlo sin señal. */
export class CopiaLocal {
  private db: BaseSQLite;
  constructor(db: BaseSQLite) { this.db = db; }

  async leer<T>(clave: string): Promise<{ valor: T; actualizadaEn: number } | null> {
    const [f] = await this.db.getAllAsync<{ valor: string; actualizada_en: number }>(
      "select valor, actualizada_en from copia_local where clave = ?", clave);
    return f ? { valor: JSON.parse(f.valor) as T, actualizadaEn: f.actualizada_en } : null;
  }

  async escribir(clave: string, valor: unknown, ahora = Date.now()) {
    await this.db.runAsync(
      "insert into copia_local (clave, valor, actualizada_en) values (?, ?, ?) on conflict (clave) do update set valor = excluded.valor, actualizada_en = excluded.actualizada_en",
      clave, JSON.stringify(valor), ahora);
  }

  /** Al cerrar sesión no queda nada de la campaña en el teléfono. */
  async borrarTodo() {
    await this.db.execAsync("delete from copia_local; delete from operacion;");
  }
}

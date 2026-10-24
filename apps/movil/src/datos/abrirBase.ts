// En el teléfono: SQLite (expo-sqlite), que guarda la cola aunque se cierre la app o se apague el celular.
import * as SQLite from "expo-sqlite";
import { AlmacenSQLite, CopiaLocal, prepararBase } from "./almacenSqlite";
import type { AlmacenLocal } from "./almacenLocal";

export async function abrirAlmacen(): Promise<AlmacenLocal> {
  const db = await SQLite.openDatabaseAsync("ventaja-mando.db");
  await db.execAsync("pragma journal_mode = wal;");
  await prepararBase(db);
  return { cola: new AlmacenSQLite(db), copia: new CopiaLocal(db) };
}

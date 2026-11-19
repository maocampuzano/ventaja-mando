// En el navegador: la cola y la copia local en IndexedDB, para que lo registrado sin señal sobreviva a recargar la
// página o cerrar el navegador (la web del líder, pedido de Giovanni del 18/11/2026). Es lo mismo que SQLite en el
// teléfono: mismas operaciones, mismo orden de llegada.
import type { Operacion } from "@ventaja/nucleo";
import type { AlmacenLocal } from "./almacenLocal";

const NOMBRE = "comando-lider";
const VERSION = 1;

type FilaOp = Operacion & { orden: number };

function pedir<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, mal) => { r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
}
function terminar(t: IDBTransaction): Promise<void> {
  return new Promise((ok, mal) => { t.oncomplete = () => ok(); t.onerror = () => mal(t.error); t.onabort = () => mal(t.error); });
}

export function abrirIndexedDb(fabrica: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const r = fabrica.open(NOMBRE, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("operacion")) db.createObjectStore("operacion", { keyPath: "id" });
      if (!db.objectStoreNames.contains("copia")) db.createObjectStore("copia", { keyPath: "clave" });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}

export function almacenIndexedDb(db: IDBDatabase): AlmacenLocal {
  let siguiente = Date.now() * 1000;
  const tienda = (nombre: string, modo: IDBTransactionMode) => db.transaction(nombre, modo).objectStore(nombre);

  const cola: AlmacenLocal["cola"] = {
    async todas() {
      const filas = await pedir(tienda("operacion", "readonly").getAll()) as FilaOp[];
      return filas.sort((a, b) => a.creadaEn - b.creadaEn || a.orden - b.orden).map((f) => {
        const op: Partial<FilaOp> = { ...f };
        delete op.orden;
        return op as Operacion;
      });
    },
    async guardar(op) {
      const t = db.transaction("operacion", "readwrite");
      const s = t.objectStore("operacion");
      const antes = await pedir(s.get(op.id)) as FilaOp | undefined;
      s.put({ ...structuredClone(op), orden: antes?.orden ?? siguiente++ });
      await terminar(t);
    },
    async borrar(id) {
      const t = db.transaction("operacion", "readwrite");
      t.objectStore("operacion").delete(id);
      await terminar(t);
    },
    async limpiarRevisadas(antesDe) {
      const filas = await pedir(tienda("operacion", "readonly").getAll()) as FilaOp[];
      const t = db.transaction("operacion", "readwrite");
      for (const f of filas) if (f.estado === "revisado" && f.creadaEn < antesDe) t.objectStore("operacion").delete(f.id);
      await terminar(t);
    },
  };

  return {
    cola,
    copia: {
      async leer<T>(clave: string) {
        const f = await pedir(tienda("copia", "readonly").get(clave)) as { valor: T; actualizadaEn: number } | undefined;
        return f ? { valor: f.valor, actualizadaEn: f.actualizadaEn } : null;
      },
      async escribir(clave, valor, ahora = Date.now()) {
        const t = db.transaction("copia", "readwrite");
        t.objectStore("copia").put({ clave, valor: structuredClone(valor), actualizadaEn: ahora });
        await terminar(t);
      },
      async borrarTodo() {
        const t = db.transaction(["copia", "operacion"], "readwrite");
        t.objectStore("copia").clear();
        t.objectStore("operacion").clear();
        await terminar(t);
      },
    },
  };
}

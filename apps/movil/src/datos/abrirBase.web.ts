// En el navegador (la web del líder): IndexedDB, que guarda la cola aunque se recargue la página o se cierre el
// navegador. Si el navegador no lo permite (por ejemplo, una ventana privada muy restringida), se usa la memoria y
// se avisa en la consola.
import { AlmacenEnMemoria } from "@ventaja/nucleo";
import { abrirIndexedDb, almacenIndexedDb } from "./almacenIndexedDb";
import type { AlmacenLocal } from "./almacenLocal";

export async function abrirAlmacen(): Promise<AlmacenLocal> {
  try {
    if (typeof indexedDB !== "undefined") return almacenIndexedDb(await abrirIndexedDb());
  } catch (e) {
    console.warn("No se pudo abrir el almacenamiento del navegador; lo registrado se guarda solo mientras la página esté abierta.", e);
  }
  const cola = new AlmacenEnMemoria();
  const copias = new Map<string, { valor: unknown; actualizadaEn: number }>();
  return {
    cola: Object.assign(cola, { limpiarRevisadas: async () => undefined }),
    copia: {
      async leer<T>(clave: string) { return (copias.get(clave) as { valor: T; actualizadaEn: number } | undefined) ?? null; },
      async escribir(clave, valor, ahora = Date.now()) { copias.set(clave, { valor, actualizadaEn: ahora }); },
      async borrarTodo() {
        copias.clear();
        for (const op of await cola.todas()) await cola.borrar(op.id);
      },
    },
  };
}

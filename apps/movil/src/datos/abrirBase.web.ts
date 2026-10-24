// En la vista web (solo para demos): memoria del navegador. Se pierde al recargar; el teléfono usa SQLite.
import { AlmacenEnMemoria } from "@ventaja/nucleo";
import type { AlmacenLocal } from "./almacenLocal";

export async function abrirAlmacen(): Promise<AlmacenLocal> {
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

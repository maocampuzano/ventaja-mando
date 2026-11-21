import type { Almacen } from "@ventaja/nucleo";

export type AlmacenLocal = {
  cola: Almacen & { limpiarRevisadas(antesDe: number): Promise<void> };
  copia: {
    leer<T>(clave: string): Promise<{ valor: T; actualizadaEn: number } | null>;
    escribir(clave: string, valor: unknown, ahora?: number): Promise<void>;
    borrarTodo(): Promise<void>;
    /** Solo la copia local, sin la cola: lo que se trajo del servidor para verlo sin señal. */
    borrarCopias(): Promise<void>;
  };
};

// Lo que ya llegó al servidor no se guarda completo en el teléfono (Ley 1581: solo lo necesario).
// Del registro de una persona queda el nombre, para mostrarlo en «Envíos» y «Mi gente» hasta que el servidor lo
// devuelva; la cédula, el celular y la evidencia se borran. Las fotos de planillas y E-14 se dejan de referenciar.
import type { DatosPersonaMovil, Operacion } from "@ventaja/nucleo";

export function depurarEnviada(op: Operacion): unknown {
  switch (op.tipo) {
    case "persona": return { nombre: (op.datos as DatosPersonaMovil).nombre };
    case "planilla": return {};
    default: return op.datos;
  }
}

/** Fotos que estaban en el teléfono y que, una vez enviadas, conviene borrar (la firma de la autorización). */
export function fotosParaBorrar(op: Operacion): string[] {
  if (op.tipo === "persona") return [(op.datos as DatosPersonaMovil).evidencia].filter((x) => /^file:/.test(x));
  if (op.tipo === "planilla") return [(op.datos as { archivo?: string }).archivo ?? ""].filter((x) => /^file:/.test(x));
  return [];
}

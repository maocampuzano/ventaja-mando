// Arranque guiado: los siete pasos que dejan una campaña nueva andando. Cada paso se da por hecho mirando datos que
// la dirección ya puede ver (nunca listas de personas), y lleva a la pantalla donde se hace.

/** Lo que se sabe de cada paso. `undefined` = todavía no se sabe (cargando o sin permiso). */
export type EstadoArranque = {
  tope?: number | null;
  coordinadores?: number;
  registrados?: number;
  lotesPlanilla?: number;
  formularios?: number;
  tareasAprobadas?: number;
  opcionE14?: string | null;
};

export type PasoArranque = { id: string; titulo: string; porque: string; boton: string; vista: string; hecho: boolean };

export function pasosArranque(e: EstadoArranque): PasoArranque[] {
  return [
    { id: "tope", vista: "ajustes", boton: "Fijar el tope", hecho: !!e.tope,
      titulo: "Fijar el tope de gastos del CNE", porque: "Con él, Cuentas avisa antes de pasarse del límite legal." },
    { id: "coordinadores", vista: "equipo", boton: "Invitar", hecho: (e.coordinadores ?? 0) > 0,
      titulo: "Invitar a los coordinadores", porque: "Cada uno entra con su usuario y ve solo sus zonas." },
    { id: "base", vista: "importar", boton: "Importar", hecho: (e.registrados ?? 0) > 0,
      titulo: "Traer la base que ya tiene", porque: "Un Excel con nombre, celular y autorización basta para empezar." },
    { id: "planillas", vista: "planillas", boton: "Imprimir", hecho: (e.lotesPlanilla ?? 0) > 0,
      titulo: "Imprimir las primeras planillas", porque: "Cada hoja lleva un código QR con el líder; la foto entra sola." },
    { id: "formulario", vista: "formularios", boton: "Crear", hecho: (e.formularios ?? 0) > 0,
      titulo: "Crear el formulario de visita", porque: "Las preguntas que el equipo hace en tierra, iguales para todos." },
    { id: "asesor", vista: "mando", boton: "Abrir el asesor", hecho: (e.tareasAprobadas ?? 0) > 0,
      titulo: "Aprobar la primera tarea del Asesor IA", porque: "Pregúntele dónde actuar esta semana y apruebe lo que le sirva." },
    { id: "diae", vista: "diae", boton: "Configurar", hecho: !!e.opcionE14,
      titulo: "Preparar el día E", porque: "Diga cómo aparece la candidatura en el E-14 y haga un simulacro con los testigos." },
  ];
}

/** Cuántos pasos van, para el título y la barra. */
export const avanceArranque = (pasos: PasoArranque[]) => ({ hechos: pasos.filter((p) => p.hecho).length, total: pasos.length });

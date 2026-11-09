// Registro de errores del panel (fase 8) y textos de la auditoría. Los errores se guardan en la base de la propia
// campaña, sin servicios externos, y ANTES de guardarlos se les quitan datos que puedan identificar a alguien: un
// mensaje de error puede traer un celular, una cédula o un correo que alguien estaba escribiendo.

const LARGO_MENSAJE = 500;
const LARGO_PILA = 2000;

/** Quita correos, números largos (celulares, cédulas, NIT), claves largas y los parámetros de las direcciones. */
export function limpiarTexto(s: string, largo = LARGO_MENSAJE): string {
  return s
    .replace(/[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}/gi, "‹correo›")
    .replace(/(https?:\/\/[^\s?#"']+)[?#][^\s"']*/gi, "$1")
    .replace(/\b(?:eyJ|sb_|sk-)[A-Za-z0-9._-]{10,}/g, "‹clave›")
    .replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g, "‹clave›")
    .replace(/\+?\d[\d .\-()]{4,}\d/g, (m) => (m.replace(/\D/g, "").length >= 6 ? "‹número›" : m))
    .slice(0, largo);
}

export type ErrorPanel = { mensaje: string; pila: string; ruta: string; version: string; navegador: string };

/** Arma el error para guardarlo, ya limpio. */
export function prepararError(e: unknown, ruta: string, version: string, navegador: string): ErrorPanel {
  const err = e instanceof Error ? e : new Error(typeof e === "string" ? e : "Error sin mensaje");
  return {
    mensaje: limpiarTexto(`${err.name}: ${err.message}`),
    pila: limpiarTexto(err.stack ?? "", LARGO_PILA),
    // La ruta sin el «#…»: en el enlace de baja, lo que va después es el token de la persona.
    ruta: limpiarTexto(ruta.split("#")[0], 200),
    version: version.slice(0, 40),
    navegador: limpiarTexto(navegador, 200),
  };
}

/** Nombre de cada acción de la auditoría, para mostrarlo. */
export const NOMBRE_ACCION: Record<string, string> = {
  insert: "Creó", update: "Modificó", delete: "Borró",
  exportar_personas: "Exportó personas", exportar_libro_finanzas: "Exportó el libro de finanzas",
  ver_documento: "Vio una cédula completa", ver_filas_planilla: "Vio una planilla leída",
  fusionar: "Fusionó duplicados", importar_personas: "Importó personas", aprobar_planilla: "Aprobó una planilla",
  baja_contacto: "Baja de mensajes y llamadas", crear_envio: "Creó un envío", aprobar_envio: "Aprobó un envío",
  cancelar_envio: "Canceló un envío", crear_cola: "Creó una cola de llamadas", asignar_operadores: "Asignó operadores",
  cambiar_estado_cola: "Cambió el estado de una cola", configurar_tope_gastos: "Configuró el tope de gastos",
  configurar_opciones_e14: "Configuró la opción del E-14", atender_incidencia: "Atendió una novedad",
  escalar_incidencias: "Escaló novedades", iniciar_simulacro: "Inició un simulacro", terminar_simulacro: "Terminó un simulacro",
  revisar_e14: "Revisó un E-14", descartar_e14: "Descartó un E-14",
};

/** Lo que más importa revisar: salidas de datos y vistas de cédulas. */
export const ACCIONES_SENSIBLES = new Set(["exportar_personas", "exportar_libro_finanzas", "ver_documento", "fusionar", "delete"]);

export const nombreAccion = (accion: string) => NOMBRE_ACCION[accion] ?? accion.replace(/_/g, " ");

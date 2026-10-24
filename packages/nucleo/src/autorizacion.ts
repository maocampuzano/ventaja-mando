// Autorización de datos personales (regla 3) para los registros que hace el líder en la app.
// BORRADOR: el texto lo revisa y aprueba un abogado antes de usarlo con personas reales (punto de validación V3).

export const FINALIDADES = [
  { id: "contacto_campana", nombre: "Contacto de la campaña (llamadas, SMS y correo)" },
  { id: "actividades_territorio", nombre: "Invitaciones a actividades en su territorio" },
] as const;
export type Finalidad = (typeof FINALIDADES)[number]["id"];

export const TEXTO_AUTORIZACION_ES_BORRADOR = true;

/** Lo que el líder le lee o le muestra a la persona antes de registrarla. */
export function textoAutorizacion(campana: string, finalidades: readonly Finalidad[]) {
  const usos = FINALIDADES.filter((f) => finalidades.includes(f.id)).map((f) => f.nombre.charAt(0).toLowerCase() + f.nombre.slice(1));
  return [
    `Autorizo a la campaña ${campana} a guardar mi nombre, mi teléfono, mi cédula si la doy y la zona donde vivo, para: ${usos.join("; ")}.`,
    "No me preguntarán por quién voy a votar. No venderán ni compartirán mis datos.",
    "Puedo pedir que los consulten, corrijan o borren, y retirar esta autorización cuando quiera, ante la campaña (Ley 1581 de 2012).",
  ].join(" ");
}

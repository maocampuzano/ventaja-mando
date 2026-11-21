// WhatsApp solo de persona a persona (diseño §7.5, regla 1 de CLAUDE.md).
// El líder toca el botón y su propio WhatsApp se abre con el texto listo. Lo envía él.
// Solo se registra «el líder abrió el contacto»; la persona debe tener autorización vigente.

/**
 * Número para wa.me (57 y el celular, sin «+»), o null si no es un celular colombiano: un fijo o un número ilegible
 * (por ejemplo, leído de una planilla con «?») no lleva botón de WhatsApp. Acepta «3001234567», «+57 300 123 4567»
 * o «573001234567».
 */
export function numeroWhatsApp(telefono: string | null | undefined): string | null {
  const d = (telefono ?? "").replace(/\D/g, "");
  if (/\?/.test(telefono ?? "")) return null;
  if (/^3\d{9}$/.test(d)) return `57${d}`;
  if (/^573\d{9}$/.test(d)) return d;
  return null;
}

export function enlaceWhatsAppManual(telefonoE164: string, texto: string) {
  return `https://wa.me/${telefonoE164.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`;
}

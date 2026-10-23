// WhatsApp solo de persona a persona (diseño §7.5, regla 1 de CLAUDE.md).
// El líder toca el botón y su propio WhatsApp se abre con el texto listo. Lo envía él.
// Solo se registra «el líder abrió el contacto»; la persona debe tener autorización vigente.

export function enlaceWhatsAppManual(telefonoE164: string, texto: string) {
  return `https://wa.me/${telefonoE164.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`;
}

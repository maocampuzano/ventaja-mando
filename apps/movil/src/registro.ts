// Validación del registro que hace el líder en la calle. Lo mismo que revisa el servidor
// (registrar_persona_movil), para avisar antes de guardar y no después de sincronizar.
import { normalizaTelefono, type DatosPersonaMovil, type Finalidad } from "@ventaja/nucleo";

export type FormularioRegistro = {
  nombre: string;
  telefono: string;
  documento: string;
  zonaId: string | null;
  finalidades: Finalidad[];
  /** Foto del formato firmado, en el teléfono. */
  fotoFirma: string | null;
  /** La persona leyó el texto en la pantalla y aceptó. */
  aceptoEnPantalla: boolean;
};

export const formularioVacio = (zonaId: string | null = null): FormularioRegistro => ({
  nombre: "", telefono: "", documento: "", zonaId, finalidades: [], fotoFirma: null, aceptoEnPantalla: false,
});

export function validarRegistro(f: FormularioRegistro, contexto: { campanaId: string; lider: string; ahora: Date }):
  { errores: string[]; datos?: DatosPersonaMovil } {
  const errores: string[] = [];
  const nombre = f.nombre.trim().replace(/\s+/g, " ");
  if (nombre.length < 3) errores.push("Escriba el nombre completo.");
  const telefono = f.telefono.trim() ? normalizaTelefono(f.telefono) : "";
  if (telefono && !/^(3\d{9}|60\d{8})$/.test(telefono)) errores.push("El celular debe tener 10 dígitos y empezar por 3.");
  const documento = f.documento.replace(/[.\s-]/g, "");
  if (documento && !/^\d{5,11}$/.test(documento)) errores.push("La cédula debe tener entre 5 y 11 dígitos, sin letras.");
  if (!f.finalidades.length) errores.push("Marque al menos para qué autoriza la persona el uso de sus datos.");
  if (!f.fotoFirma && !f.aceptoEnPantalla) errores.push("Falta la autorización: tome la foto del formato firmado o marque que la persona aceptó en la pantalla.");
  if (errores.length) return { errores };
  const hora = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }).format(contexto.ahora);
  return {
    errores,
    datos: {
      campana: contexto.campanaId, nombre, telefono: telefono || null, documento: documento || null, zona: f.zonaId,
      finalidades: [...f.finalidades], canal: "presencial",
      evidencia: f.fotoFirma ?? `Aceptó en la pantalla del celular de ${contexto.lider} el ${hora}, después de leer el texto de autorización.`,
    },
  };
}

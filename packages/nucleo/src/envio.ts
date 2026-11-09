// Envío de un lote de mensajes con un proveedor (fase 6). La función del servidor «enviar» pide el lote a la base
// (lote_para_enviar, que ya verificó autorización y baja), arma cada mensaje y registra el resultado.
// El proveedor va detrás de un adaptador: cambiar de proveedor no toca la lógica. Sin proveedor no se envía nada.
import { armarMensaje, type CanalMasivo } from "./mensajeria.ts";

export type Proveedor = {
  nombre: string;
  canal: CanalMasivo;
  /** Envía un mensaje y devuelve la referencia del proveedor. Lanza un error si el proveedor lo rechaza. */
  enviar(destino: string, texto: string, asunto?: string): Promise<{ ref: string }>;
};

export type FilaLote = { destinatarioId: string; nombre: string; destino: string | null; tokenBaja: string };
export type DatosEnvio = { canal: CanalMasivo; plantilla: string; asunto?: string | null; campana: string; urlPanel: string };
export type Registrar = (destinatarioId: string, enviado: boolean, ref: string | null, error: string | null) => Promise<void>;

/** El token lo arma la base: «<número del destinatario>.<firma de 12 caracteres>». */
export const enlaceBaja = (urlPanel: string, token: string) => `${urlPanel.replace(/\/+$/, "")}/#b/${token}`;

/** Celular colombiano en formato internacional (+57 3XX XXX XXXX) o null si no es un celular válido. */
export function destinoSms(telefono: string | null): string | null {
  const d = (telefono ?? "").replace(/\D/g, "");
  if (/^3\d{9}$/.test(d)) return `+57${d}`;
  if (/^573\d{9}$/.test(d)) return `+${d}`;
  return null;
}

const correoValido = (c: string | null) => !!c && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c);

/**
 * Envía el lote uno por uno. Un error con una persona no detiene a las demás; cada resultado queda registrado.
 * Nunca registra el texto del mensaje ni el destino: solo si salió y la referencia del proveedor.
 */
export async function enviarLote(p: Proveedor, filas: readonly FilaLote[], d: DatosEnvio, registrar: Registrar) {
  if (p.canal !== d.canal) throw new Error(`El proveedor ${p.nombre} es de ${p.canal} y el envío es de ${d.canal}.`);
  let enviados = 0, fallidos = 0;
  for (const f of filas) {
    const destino = d.canal === "sms" ? destinoSms(f.destino) : correoValido(f.destino) ? f.destino!.trim() : null;
    if (!destino) {
      fallidos++;
      await registrar(f.destinatarioId, false, null, d.canal === "sms" ? "El celular no es válido." : "El correo no es válido.");
      continue;
    }
    const texto = armarMensaje(d.canal, d.plantilla, { nombre: f.nombre, campana: d.campana, enlaceBaja: enlaceBaja(d.urlPanel, f.tokenBaja) });
    try {
      const r = await p.enviar(destino, texto, d.asunto ?? undefined);
      enviados++;
      await registrar(f.destinatarioId, true, r.ref, null);
    } catch (e) {
      fallidos++;
      await registrar(f.destinatarioId, false, null, e instanceof Error ? e.message.slice(0, 300) : "El proveedor rechazó el mensaje.");
    }
  }
  return { enviados, fallidos };
}

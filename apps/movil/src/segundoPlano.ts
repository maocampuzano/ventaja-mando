// Envío en segundo plano (APK del E-14, pedido de Giovanni): si quedó algo sin enviar, el teléfono lo intenta cada
// 20 minutos aunque la app esté cerrada. Usa WorkManager de Android (expo-background-task), que respeta la batería:
// el sistema puede correrlo un poco después, pero no lo olvida, ni después de reiniciar el teléfono.
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import * as Crypto from "expo-crypto";
import { ColaSincronizacion, type Operacion } from "@ventaja/nucleo";
import { abrirAlmacen } from "./datos/abrirBase";
import { borrarArchivo } from "./datos/archivos";
import { crearFuente } from "./datos/crearFuente";
import { depurarEnviada, fotosParaBorrar } from "./datos/depurar";

export const TAREA_ENVIO = "comando-envio-pendiente";
export const MINUTOS_ENTRE_ENVIOS = 20;

/** Una vuelta de envío fuera de la pantalla: misma cola, mismas reglas, sin duplicar (cada operación tiene su id). */
export async function enviarPendientes(): Promise<"sin_sesion" | "sin_pendientes" | "sin_conexion" | "enviado"> {
  const fuente = crearFuente();
  const sesion = await fuente.sesionGuardada();
  if (!sesion) return "sin_sesion";
  const { cola: almacen } = await abrirAlmacen();
  const base = fuente.transporte(sesion);
  const transporte = { ...base, async enviar(op: Operacion) {
    const r = await base.enviar(op);
    for (const f of fotosParaBorrar(op)) await borrarArchivo(f);
    return r;
  } };
  // Solo lo de quien tiene la sesión: lo que otra persona dejó en el teléfono no se envía a nombre de esta.
  const cola = new ColaSincronizacion(almacen, transporte, () => Crypto.randomUUID(), Date.now, depurarEnviada, sesion.usuarioId);
  if (!(await cola.operaciones()).some((o) => o.estado === "pendiente" || o.estado === "enviando")) return "sin_pendientes";
  if (!(await fuente.ping(sesion))) return "sin_conexion";
  await cola.sincronizar({ forzar: true });
  return "enviado";
}

TaskManager.defineTask(TAREA_ENVIO, async () => {
  try {
    await enviarPendientes();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Registra la tarea (una sola vez: si ya estaba, no hace nada). */
export async function activarSegundoPlano() {
  if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (await TaskManager.isTaskRegisteredAsync(TAREA_ENVIO)) return;
  await BackgroundTask.registerTaskAsync(TAREA_ENVIO, { minimumInterval: MINUTOS_ENTRE_ENVIOS });
}

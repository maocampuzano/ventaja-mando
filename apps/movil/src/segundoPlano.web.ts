// En el navegador no hay envío en segundo plano: lo pendiente se envía al abrir la página y cada 20 segundos mientras
// está abierta (contexto.tsx).
export const TAREA_ENVIO = "comando-envio-pendiente";
export const MINUTOS_ENTRE_ENVIOS = 20;
export async function activarSegundoPlano() { /* nada en el navegador */ }

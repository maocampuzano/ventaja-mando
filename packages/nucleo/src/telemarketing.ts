// Telemarketing (fase 6): colas de llamadas que arma la dirección y que atiende el operador, una persona a la vez.
// Regla 2: el resultado de una llamada NUNCA registra por quién va a votar la persona ni si «apoya» al candidato.
// Regla 3: solo se llama a quien tiene autorización vigente para contacto y no se ha dado de baja; la base lo
// verifica al armar la cola y otra vez antes de entregar cada llamada.

export type ResultadoLlamada = "contesto" | "acepto_actividad" | "volver_a_llamar" | "no_contesto" | "numero_equivocado" | "no_volver_a_llamar";

export const RESULTADOS_LLAMADA: readonly { id: ResultadoLlamada; nombre: string; efecto: string }[] = [
  { id: "contesto", nombre: "Contestó y habló", efecto: "Llamada hecha. Si la persona estaba «sin contactar», queda «contactada»." },
  { id: "acepto_actividad", nombre: "Aceptó la invitación", efecto: "Llamada hecha. Si estaba «sin contactar», queda «contactada»." },
  { id: "volver_a_llamar", nombre: "Pidió que la llamen después", efecto: "Vuelve a la cola mañana." },
  { id: "no_contesto", nombre: "No contestó", efecto: "Vuelve a la cola en 2 horas, hasta 3 intentos." },
  { id: "numero_equivocado", nombre: "Número equivocado", efecto: "Sale de la cola." },
  { id: "no_volver_a_llamar", nombre: "No quiere que la vuelvan a contactar", efecto: "Sale de la cola y queda dada de baja en todos los canales." },
];

export const MAX_INTENTOS_LLAMADA = 3;
export const MINUTOS_REINTENTO = 120;
/** Una llamada entregada a un operador y no registrada vuelve a la cola después de este tiempo. */
export const MINUTOS_LLAMADA_RETENIDA = 30;

export type ResumenCola = {
  total: number; pendientes: number; enCurso: number; hechas: number; reintentar: number; descartadas: number;
  hoy: Record<ResultadoLlamada, number>;
};

/** Avance de la cola: las que ya no se van a llamar (hechas o descartadas) sobre el total. */
export const avanceCola = (r: Pick<ResumenCola, "total" | "hechas" | "descartadas">) =>
  r.total ? (r.hechas + r.descartadas) / r.total : 0;

// Lo que la pantalla «Hoy» le dice a quien dirige o coordina: qué necesita una acción y qué se salió de lo normal.
// Trabaja solo con conteos (nunca con personas) sobre lo que la sesión ya puede ver.
import { miles, pct } from "@ventaja/nucleo";
import type { Lider, Puesto, Zona } from "../data";

/** Conteos que se piden aparte según el rol. Lo que el rol no puede ver llega sin definir. */
export type ExtrasHoy = {
  planillasPorRevisar?: number;
  enviosPorAprobar?: number;
  enviosPorEnviar?: number;
  solicitudesAbiertas?: number;
  solicitudesVencidas?: number;
  /** Gastos sobre el tope del CNE (1 = 100 %). null si no hay tope configurado. */
  usoTope?: number | null;
};

export type Pendiente = { id: string; titulo: string; detalle: string; boton: string; vista: string; urgente?: boolean };
export type Aviso = { id: string; nivel: "rojo" | "ambar" | "verde"; texto: string };

const plural = (n: number, uno: string, varios: string) => `${miles(n)} ${n === 1 ? uno : varios}`;
const lista = (nombres: string[]) => (nombres.length <= 1 ? nombres.join("") : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`);

export function armarHoy(d: { zonas: Zona[]; lideres: Lider[]; puestos: Puesto[] }, x: ExtrasHoy): { pendientes: Pendiente[]; avisos: Aviso[] } {
  const pendientes: Pendiente[] = [];
  const avisos: Aviso[] = [];

  if (x.solicitudesVencidas) {
    pendientes.push({
      id: "solicitudes-vencidas", urgente: true, vista: "datos", boton: "Responder",
      titulo: `Responder ${plural(x.solicitudesVencidas, "solicitud de datos personales vencida", "solicitudes de datos personales vencidas")}`,
      detalle: "El plazo legal ya pasó. Respóndalas hoy.",
    });
  } else if (x.solicitudesAbiertas) {
    pendientes.push({
      id: "solicitudes", vista: "datos", boton: "Ver solicitudes",
      titulo: `Responder ${plural(x.solicitudesAbiertas, "solicitud de datos personales", "solicitudes de datos personales")}`,
      detalle: "Cada una tiene un plazo legal, que se ve en Cumplimiento.",
    });
  }
  if (x.planillasPorRevisar) {
    pendientes.push({
      id: "planillas", vista: "planillas", boton: "Revisar",
      titulo: `Revisar ${plural(x.planillasPorRevisar, "planilla que subió un líder", "planillas que subieron los líderes")}`,
      detalle: "Una persona confirma cada fila antes de que entre a la base.",
    });
  }
  if (x.enviosPorAprobar) {
    pendientes.push({
      id: "envios-aprobar", vista: "mensajes", boton: "Ver y aprobar",
      titulo: `Aprobar ${plural(x.enviosPorAprobar, "envío de mensajes", "envíos de mensajes")}`,
      detalle: "Solo salen a personas con autorización vigente y sin baja.",
    });
  }
  if (x.enviosPorEnviar) {
    pendientes.push({
      id: "envios-enviar", vista: "mensajes", boton: "Enviar",
      titulo: `Enviar ${plural(x.enviosPorEnviar, "mensaje ya aprobado", "mensajes ya aprobados")}`,
      detalle: "Están aprobados y esperando a que alguien los envíe.",
    });
  }

  const sinTestigo = d.puestos.map((p) => ({ nombre: p.nombre, faltan: p.mesas.filter((m) => !m.testigoId).length })).filter((p) => p.faltan > 0)
    .sort((a, b) => b.faltan - a.faltan);
  const mesasSinTestigo = sinTestigo.reduce((a, p) => a + p.faltan, 0);
  if (mesasSinTestigo) {
    pendientes.push({
      id: "testigos", vista: "diae", boton: "Ver mesas",
      titulo: `Asignar testigos a ${plural(mesasSinTestigo, "mesa sin cubrir", "mesas sin cubrir")}`,
      detalle: `Donde más faltan: ${lista(sinTestigo.slice(0, 2).map((p) => p.nombre))}.`,
    });
  }

  const inactivos = d.lideres.filter((l) => l.registrados === 0).length;
  if (inactivos) {
    pendientes.push({
      id: "lideres-inactivos", vista: "lideres", boton: "Ver líderes",
      titulo: `Hablar con ${plural(inactivos, "líder que no ha registrado a nadie", "líderes que no han registrado a nadie")}`,
      detalle: "Un mensaje o una llamada a tiempo los pone a andar.",
    });
  }

  if (x.usoTope === null) avisos.push({ id: "sin-tope", nivel: "ambar", texto: "Falta configurar el tope de gastos del CNE en Cuentas." });
  else if (x.usoTope !== undefined && x.usoTope >= 0.8) {
    avisos.push({
      id: "tope", nivel: x.usoTope >= 0.95 ? "rojo" : "ambar",
      texto: x.usoTope > 1 ? "Los gastos ya superan el tope del CNE." : `Los gastos van en ${pct(x.usoTope)} del tope del CNE.`,
    });
  }
  const atrasadas = d.zonas.filter((z) => z.meta > 0 && z.validados / z.meta < 0.25).sort((a, b) => a.validados / a.meta - b.validados / b.meta);
  if (atrasadas.length) {
    avisos.push({
      id: "zonas-atrasadas", nivel: "ambar",
      texto: `${plural(atrasadas.length, "zona va", "zonas van")} por debajo del 25 % de su meta: ${lista(atrasadas.slice(0, 3).map((z) => z.nombre))}${atrasadas.length > 3 ? " y otras" : ""}.`,
    });
  }
  const repetidos = d.lideres.reduce((a, l) => a + l.duplicadosConOtros, 0);
  if (repetidos) {
    avisos.push({ id: "repetidos", nivel: "ambar", texto: `${plural(repetidos, "registro aparece", "registros aparecen")} con más de un líder. No se cuentan dos veces en los validados.` });
  }
  return { pendientes, avisos };
}

/** Saludo según la hora de Colombia. */
export function saludo(ahora = new Date()): string {
  const hora = Number(new Intl.DateTimeFormat("es-CO", { hour: "numeric", hourCycle: "h23", timeZone: "America/Bogota" }).format(ahora));
  return hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
}

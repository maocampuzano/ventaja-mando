// Mensajes en modo demo: los envíos viven en la pestaña y NUNCA sale un mensaje de verdad. Los conteos se estiman
// con los líderes ficticios de la semilla, con las mismas reglas de la base (solo la dirección arma y aprueba).
import { dentroDeHorario, revisarPlantilla, type CanalMasivo, type SegmentoEnvio } from "@ventaja/nucleo";
import type { DatosTablero, Envio, FuenteDatos, Sesion } from "./tipos";

type Metodos = Pick<FuenteDatos, "envios" | "contarDestinatarios" | "crearEnvio" | "aprobarEnvio" | "cancelarEnvio" | "enviarLote" | "darseDeBaja">;

// Proporción de las personas de un líder en cada estado y de las que tienen celular o correo con autorización vigente.
const PROPORCION_ESTADO = { sin_contactar: 0.3, contactado: 0.2, validado: 0.35, comprometido: 0.15 } as const;
const CONTACTABLE = { sms: 0.9, email: 0.25 } as const;
const LOTE = 100;

const esDireccion = (s: Sesion) => s.rol === "administrador" || s.rol === "gerente";
const exigirDireccion = (s: Sesion) => { if (!esDireccion(s)) throw new Error("Solo la dirección arma y envía mensajes."); };

export function crearMensajesDemo(recortar: (s: Sesion) => DatosTablero): Metodos {
  let lista: Envio[] = [];

  function contar(s: Sesion, canal: CanalMasivo, seg: SegmentoEnvio) {
    const fraccion = seg.estados?.length ? seg.estados.reduce((a, e) => a + PROPORCION_ESTADO[e], 0) : 1;
    return recortar(s).lideres
      .filter((l) => !seg.territorioIds?.length || seg.territorioIds.includes(l.zonaId))
      .filter((l) => !seg.liderIds?.length || seg.liderIds.includes(l.id))
      .reduce((a, l) => a + Math.floor(l.registrados * fraccion * CONTACTABLE[canal]), 0);
  }
  const buscar = (id: string) => {
    const e = lista.find((x) => x.id === id);
    if (!e) throw new Error("El envío no existe.");
    return e;
  };
  const cambiar = (id: string, f: (e: Envio) => Envio) => { lista = lista.map((e) => (e.id === id ? f(e) : e)); };

  return {
    async envios(s) {
      if (!esDireccion(s) && s.rol !== "candidato") throw new Error("No tiene acceso a los mensajes.");
      return [...lista].sort((a, b) => b.creado.localeCompare(a.creado));
    },
    async contarDestinatarios(s, canal, seg) { exigirDireccion(s); return contar(s, canal, seg); },
    async crearEnvio(s, d) {
      exigirDireccion(s);
      const r = revisarPlantilla(d.canal, d.cuerpo, s.campana.candidato, d.asunto);
      if (r.errores.length) throw new Error(r.errores[0]);
      const id = `envio-${Date.now()}`;
      lista = [...lista, {
        id, canal: d.canal, nombre: d.nombre.trim(), asunto: d.asunto?.trim() || null, cuerpo: d.cuerpo.trim(), segmento: d.segmento,
        estado: "borrador", creado: new Date().toISOString(), resumen: { total: 0, pendientes: 0, enviados: 0, fallidos: 0, omitidos: 0 },
      }];
      return id;
    },
    async aprobarEnvio(s, id) {
      exigirDireccion(s);
      const e = buscar(id);
      if (e.estado !== "borrador") throw new Error("Solo se aprueba un envío en borrador.");
      const total = contar(s, e.canal, e.segmento);
      if (!total) throw new Error("Nadie del segmento tiene autorización vigente para recibir mensajes por este canal.");
      cambiar(id, (x) => ({ ...x, estado: "aprobado", resumen: { ...x.resumen, total, pendientes: total } }));
      return total;
    },
    async cancelarEnvio(s, id) {
      exigirDireccion(s);
      const e = buscar(id);
      if (!["borrador", "aprobado", "enviando"].includes(e.estado)) throw new Error("Este envío ya terminó.");
      cambiar(id, (x) => ({ ...x, estado: "cancelado", resumen: { ...x.resumen, omitidos: x.resumen.omitidos + x.resumen.pendientes, pendientes: 0 } }));
    },
    async enviarLote(s, id) {
      exigirDireccion(s);
      const e = buscar(id);
      if (e.estado !== "aprobado" && e.estado !== "enviando") throw new Error("Solo se envía un envío aprobado.");
      const h = dentroDeHorario(new Date());
      if (!h.permitido) throw new Error(`${h.motivo} El envío queda aprobado y puede enviarlo en horario.`);
      await new Promise((r) => setTimeout(r, 400));
      const n = Math.min(LOTE, e.resumen.pendientes);
      const fallidos = Math.floor(n * 0.03); // algunos números inválidos, como en la vida real
      const pendientes = e.resumen.pendientes - n;
      cambiar(id, (x) => ({
        ...x, estado: pendientes ? "enviando" : "terminado",
        resumen: { ...x.resumen, pendientes, enviados: x.resumen.enviados + n - fallidos, fallidos: x.resumen.fallidos + fallidos },
      }));
      return { enviados: n - fallidos, fallidos, pendientes, demostracion: true };
    },
    async darseDeBaja(token) {
      if (!/^\d{1,18}\.[0-9a-f]{12}$/.test(token)) throw new Error("El enlace no es válido.");
      return "Laura Méndez (demostración)";
    },
  };
}

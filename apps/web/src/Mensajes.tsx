// Mensajes por SMS y correo (fase 6). La dirección arma el envío, ve a cuántas personas llega (solo con autorización
// vigente para contacto y sin baja), lo aprueba y lo envía por lotes. Nunca por WhatsApp (regla 1).
import { useCallback, useEffect, useState } from "react";
import { dentroDeHorario, fecha, miles, revisarPlantilla, type CanalMasivo, type SegmentoEnvio } from "@ventaja/nucleo";
import { useTablero } from "./datos/contexto";
import { fuente } from "./datos/index";
import type { Envio, EstadoEnvio } from "./datos/tipos";
import { SelectorSegmento } from "./SelectorSegmento";

const NOMBRE_ESTADO: Record<EstadoEnvio, { texto: string; clase: string }> = {
  borrador: { texto: "Borrador", clase: "" }, aprobado: { texto: "Aprobado", clase: "azul" },
  enviando: { texto: "Enviando", clase: "ambar" }, terminado: { texto: "Terminado", clase: "verde" }, cancelado: { texto: "Cancelado", clase: "rojo" },
};

export function Mensajes() {
  const { sesion } = useTablero();
  const direccion = sesion.rol === "administrador" || sesion.rol === "gerente";
  const [lista, setLista] = useState<Envio[] | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(() => {
    fuente.envios(sesion).then(setLista).catch((e: Error) => setError(e.message));
  }, [sesion]);
  useEffect(cargar, [cargar]);

  async function hacer(id: string, accion: () => Promise<string | void>) {
    setOcupado(id); setError(""); setAviso("");
    try { const m = await accion(); if (m) setAviso(m); } catch (e) { setError((e as Error).message); }
    finally { setOcupado(null); cargar(); }
  }
  const aprobar = (e: Envio) => hacer(e.id, async () => {
    if (!window.confirm(`¿Aprobar «${e.nombre}»? Se fijan los destinatarios en este momento.`)) return;
    const n = await fuente.aprobarEnvio(sesion, e.id);
    return `Aprobado para ${miles(n)} ${n === 1 ? "persona" : "personas"}.`;
  });
  const enviar = (e: Envio) => hacer(e.id, async () => {
    const r = await fuente.enviarLote(sesion, e.id);
    const base = `Lote enviado: ${miles(r.enviados)} ${r.enviados === 1 ? "mensaje" : "mensajes"}${r.fallidos ? `, ${miles(r.fallidos)} fallidos` : ""}. ${r.pendientes ? `Quedan ${miles(r.pendientes)}.` : "No queda nada pendiente."}`;
    return r.demostracion ? `${base} (Demostración: no salió ningún mensaje de verdad.)` : base;
  });
  const cancelar = (e: Envio) => hacer(e.id, async () => {
    if (!window.confirm(`¿Cancelar «${e.nombre}»? Lo pendiente no se enviará.`)) return;
    await fuente.cancelarEnvio(sesion, e.id);
    return "Envío cancelado.";
  });

  const horario = dentroDeHorario(new Date());

  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>Mensajes</h1>
          <p className="tenue">SMS y correo solo a personas con autorización vigente para contacto y que no se han dado de baja. Cada mensaje lleva un enlace para dejar de recibirlos. Nada por WhatsApp: ese es solo de persona a persona.</p>
        </div>
        {direccion && !nuevo && <button className="btn btn-primario" onClick={() => setNuevo(true)}>Nuevo envío</button>}
      </div>
      {!horario.permitido && <p className="aviso">Ahora no se puede enviar: {horario.motivo} Puede armar y aprobar envíos.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {aviso && <p className="aviso" role="status">{aviso}</p>}

      {nuevo && <NuevoEnvio alCerrar={() => setNuevo(false)} alGuardar={() => { setNuevo(false); setAviso("Envío guardado como borrador."); cargar(); }} />}

      <section className="tarjeta pila" aria-label="Envíos">
        <h2>Envíos</h2>
        {!lista && <p className="tenue">Cargando…</p>}
        {lista?.length === 0 && <p className="tenue">Todavía no hay envíos.</p>}
        {lista?.map((e) => (
          <div key={e.id} className="fila-ocr" aria-label={e.nombre}>
            <div className="fila entre">
              <strong>{e.nombre}</strong>
              <span className="fila" style={{ gap: 6 }}>
                <span className="sello">{e.canal === "sms" ? "SMS" : "Correo"}</span>
                <span className={`sello ${NOMBRE_ESTADO[e.estado].clase}`}>{NOMBRE_ESTADO[e.estado].texto}</span>
              </span>
            </div>
            {e.asunto && <span className="tenue">Asunto: {e.asunto}</span>}
            <span style={{ whiteSpace: "pre-wrap" }}>{e.cuerpo}</span>
            <span className="etiqueta">
              Creado el {fecha(e.creado)}
              {e.resumen.total > 0 && ` · ${miles(e.resumen.total)} destinatarios: ${miles(e.resumen.enviados)} enviados, ${miles(e.resumen.pendientes)} pendientes, ${miles(e.resumen.fallidos)} fallidos, ${miles(e.resumen.omitidos)} omitidos`}
            </span>
            {direccion && (
              <div className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
                {e.estado === "borrador" && <button className="btn btn-chico btn-primario" disabled={ocupado === e.id} onClick={() => aprobar(e)}>Aprobar</button>}
                {(e.estado === "aprobado" || e.estado === "enviando") && (
                  <button className="btn btn-chico btn-primario" disabled={ocupado === e.id || !horario.permitido} onClick={() => enviar(e)}>
                    {ocupado === e.id ? "Enviando…" : e.estado === "aprobado" ? "Enviar el primer lote" : "Enviar el siguiente lote"}
                  </button>
                )}
                {["borrador", "aprobado", "enviando"].includes(e.estado) && (
                  <button className="btn btn-chico" disabled={ocupado === e.id} onClick={() => cancelar(e)}>Cancelar</button>
                )}
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

function NuevoEnvio({ alCerrar, alGuardar }: { alCerrar: () => void; alGuardar: () => void }) {
  const { sesion } = useTablero();
  const [canal, setCanal] = useState<CanalMasivo>("sms");
  const [nombre, setNombre] = useState("");
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [segmento, setSegmento] = useState<SegmentoEnvio>({});
  const [conteo, setConteo] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const revision = revisarPlantilla(canal, cuerpo, sesion.campana.candidato, asunto);

  useEffect(() => {
    let vigente = true;
    const t = setTimeout(() => {
      fuente.contarDestinatarios(sesion, canal, segmento).then((n) => { if (vigente) setConteo(n); }).catch(() => { if (vigente) setConteo(null); });
    }, 250);
    return () => { vigente = false; clearTimeout(t); };
  }, [canal, segmento, sesion]);

  async function guardar() {
    setGuardando(true); setError("");
    try { await fuente.crearEnvio(sesion, { canal, nombre, asunto: canal === "email" ? asunto : undefined, cuerpo, segmento }); alGuardar(); }
    catch (e) { setError((e as Error).message); } finally { setGuardando(false); }
  }

  return (
    <section className="tarjeta pila" aria-label="Nuevo envío" style={{ marginBottom: 16 }}>
      <div className="fila entre"><h2>Nuevo envío</h2><button className="btn btn-chico" onClick={alCerrar}>Cerrar</button></div>
      <fieldset className="campo-formulario">
        <legend>Canal</legend>
        <div className="fila" style={{ gap: 16 }}>
          <label className="fila" style={{ gap: 6 }}><input type="radio" name="canal" checked={canal === "sms"} onChange={() => setCanal("sms")} />SMS</label>
          <label className="fila" style={{ gap: 6 }}><input type="radio" name="canal" checked={canal === "email"} onChange={() => setCanal("email")} />Correo</label>
        </div>
      </fieldset>
      <label className="campo">Nombre interno del envío<input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Por ejemplo: invitación al cierre de campaña" /></label>
      {canal === "email" && <label className="campo">Asunto<input value={asunto} onChange={(e) => setAsunto(e.target.value)} /></label>}
      <label className="campo">Mensaje
        <textarea rows={4} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} placeholder="Hola {nombre}, …" />
      </label>
      <p className="etiqueta">{"{nombre}"} se cambia por el primer nombre de cada persona. Al final se agrega, solo, el nombre de la campaña y el enlace para dejar de recibir mensajes.</p>
      {canal === "sms" && revision.segmentos && (
        <p className="etiqueta">Con el pie, el SMS ocupa {revision.segmentos.segmentos} {revision.segmentos.segmentos === 1 ? "mensaje" : "mensajes"} ({revision.segmentos.codificacion}).</p>
      )}
      {revision.errores.map((e) => <p key={e} className="error">{e}</p>)}
      {revision.advertencias.map((a) => <p key={a} className="sello ambar" style={{ whiteSpace: "normal" }}>{a}</p>)}

      <SelectorSegmento segmento={segmento} alCambiar={setSegmento} />
      <p role="status"><strong>{conteo === null ? "…" : miles(conteo)}</strong> {conteo === 1 ? "persona" : "personas"} con autorización vigente para contacto, sin baja y con {canal === "sms" ? "celular" : "correo"}.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="fila" style={{ gap: 8 }}>
        <button className="btn btn-primario" disabled={guardando || !nombre.trim() || revision.errores.length > 0 || !conteo} onClick={guardar}>Guardar borrador</button>
      </div>
    </section>
  );
}

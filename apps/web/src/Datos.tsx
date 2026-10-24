// Datos y cumplimiento: lo que la campaña tiene que poder demostrar (Ley 1581 de 2012).
// Autorizaciones en cifras, solicitudes de los titulares con su plazo legal y exportaciones con marca y auditoría.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { diasHabilesRestantes, fecha, miles, pct, plazoSolicitud, semaforoPlazo, type TipoSolicitud } from "@ventaja/nucleo";
import { fuente } from "./datos";
import { useTablero } from "./datos/contexto";
import { csvExportacion, nombreArchivoExportacion } from "./datos/exportacion";
import type { EstadoSolicitud, PersonaEncontrada, ResumenCumplimiento, Solicitud } from "./datos/tipos";

const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const nombreTipo: Record<TipoSolicitud, string> = { conocer: "Conocer sus datos", actualizar: "Actualizar o corregir", suprimir: "Suprimir sus datos", revocar: "Revocar la autorización" };
const nombreEstado: Record<EstadoSolicitud, string> = { recibida: "Recibida", en_tramite: "En trámite", resuelta: "Resuelta", rechazada: "Rechazada" };
const FINALIDADES: Record<string, string> = { contacto_campana: "Contacto de la campaña", actividades_territorio: "Actividades en su territorio" };

export function Datos() {
  const { sesion } = useTablero();
  const [resumen, setResumen] = useState<ResumenCumplimiento | null>(null);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(() => {
    Promise.all([fuente.resumenCumplimiento(sesion), fuente.solicitudes(sesion)])
      .then(([r, s]) => { setResumen(r); setSolicitudes(s); })
      .catch((e: Error) => setError(e.message));
  }, [sesion]);
  useEffect(cargar, [cargar]);

  const hacer = async (accion: () => Promise<unknown>, texto: string) => {
    setError(""); setAviso("");
    try { await accion(); setAviso(texto); cargar(); } catch (e) { setError((e as Error).message); }
  };

  const abiertas = solicitudes.filter((s) => s.estado === "recibida" || s.estado === "en_tramite");
  const cerradas = solicitudes.filter((s) => !abiertas.includes(s));

  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>Datos y cumplimiento</h1>
          <p className="tenue">Lo que la campaña tiene que poder demostrar si alguien pregunta: quién autorizó, qué pidió cada titular y quién se llevó datos.</p>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {aviso && <p className="aviso" role="status">{aviso}</p>}

      {resumen && (
        <div className="rejilla" style={{ marginBottom: 16 }}>
          <div className="tarjeta"><div className="etiqueta">Con autorización vigente</div>
            <div className="dato">{resumen.personas ? pct(resumen.conAutorizacionVigente / resumen.personas) : "—"}</div>
            <p className="tenue">{miles(resumen.conAutorizacionVigente)} de {miles(resumen.personas)} personas · {miles(resumen.autorizacionesRevocadas)} revocadas</p></div>
          <div className="tarjeta"><div className="etiqueta">Solicitudes de titulares abiertas</div>
            <div className="dato" data-prueba="abiertas">{miles(resumen.solicitudesAbiertas)}</div>
            <p className={resumen.solicitudesVencidas ? "error" : "tenue"}>{resumen.solicitudesVencidas ? `${resumen.solicitudesVencidas} vencidas` : "Ninguna vencida"}</p></div>
          <div className="tarjeta"><div className="etiqueta">Exportaciones en 30 días</div>
            <div className="dato">{miles(resumen.exportaciones30Dias)}</div><p className="tenue">Todas con marca y en la auditoría</p></div>
          <div className="tarjeta"><div className="etiqueta">Opinión política individual</div>
            <div className="dato" style={{ fontSize: 22 }}>{resumen.preferenciaPoliticaActiva ? "Activada" : "Apagada"}</div>
            <p className="tenue">{resumen.preferenciaPoliticaActiva ? "Exige autorización sensible por persona." : "La intención se mide solo en agregado."}</p></div>
        </div>
      )}

      <div className="escenario" style={{ gridTemplateColumns: "minmax(0, 1fr) 380px" }}>
        <div className="pila">
          <section className="tarjeta pila" aria-label="Solicitudes abiertas">
            <h2>Solicitudes de titulares</h2>
            <p className="tenue">Plazos de la Ley 1581 en días hábiles de Colombia: 10 para consultas y 15 para reclamos, prorrogables una vez.</p>
            {!abiertas.length && <p className="tenue">No hay solicitudes abiertas.</p>}
            {abiertas.map((s) => <FilaSolicitud key={s.id} s={s} hacer={hacer} />)}
          </section>
          {cerradas.length > 0 && (
            <details className="tarjeta">
              <summary>Solicitudes cerradas ({cerradas.length})</summary>
              <ul className="lista-filas">
                {cerradas.map((s) => <li key={s.id}>{nombreTipo[s.tipo]} · {s.personaNombre ?? "persona suprimida o sin enlazar"} · {nombreEstado[s.estado]}{s.respuesta ? ` · ${s.respuesta}` : ""}</li>)}
              </ul>
            </details>
          )}
        </div>
        <aside className="pila">
          <NuevaSolicitudForm hacer={hacer} />
          <Exportar hacer={hacer} />
        </aside>
      </div>
    </div>
  );
}

type Hacer = (accion: () => Promise<unknown>, texto: string) => Promise<void>;

function FilaSolicitud({ s, hacer }: { s: Solicitud; hacer: Hacer }) {
  const { sesion } = useTablero();
  const [respuesta, setRespuesta] = useState(s.respuesta ?? "");
  const hoy = hoyBogota();
  const restantes = diasHabilesRestantes(hoy, s.vence);
  const color = semaforoPlazo(hoy, s.vence);
  const p = plazoSolicitud[s.tipo];
  const cerrar = (estado: EstadoSolicitud) => hacer(() => fuente.cambiarEstadoSolicitud(sesion, s.id, estado, respuesta.trim()),
    estado === "resuelta" ? "Solicitud resuelta." : "Solicitud rechazada.");

  return (
    <div className="fila-ocr" aria-label={`Solicitud: ${nombreTipo[s.tipo]}`}>
      <div className="fila entre">
        <strong>{nombreTipo[s.tipo]} · {s.personaNombre ?? <span className="tenue">sin persona enlazada</span>}</strong>
        <span className={`sello ${color}`}>{restantes < 0 ? `Vencida hace ${-restantes} días hábiles` : restantes === 0 ? "Vence hoy" : `${restantes} días hábiles`}</span>
      </div>
      <span className="tenue">Recibida el {fecha(s.recibida)} · vence el {fecha(s.vence)}{s.prorrogada ? " (prorrogada)" : ""} · {p.norma} · {nombreEstado[s.estado]}</span>
      {s.detalle && <span>{s.detalle}</span>}
      <label className="campo">Respuesta al titular
        <input value={respuesta} onChange={(e) => setRespuesta(e.target.value)} placeholder="Qué se hizo y cuándo se le informó" />
      </label>
      <div className="fila">
        {s.estado === "recibida" && <button className="btn btn-chico" onClick={() => hacer(() => fuente.cambiarEstadoSolicitud(sesion, s.id, "en_tramite"), "Solicitud en trámite.")}>Pasar a trámite</button>}
        {s.tipo === "revocar" && s.personaId && (
          <button className="btn btn-chico" onClick={() => hacer(() => fuente.revocarAutorizacionesDe(sesion, s.personaId!), "Autorizaciones revocadas: la persona deja de usarse para contacto.")}>Revocar sus autorizaciones</button>
        )}
        {s.tipo === "suprimir" && s.personaId && (
          <button className="btn btn-chico" onClick={() => {
            if (confirm(`¿Suprimir a ${s.personaNombre}? Se borran sus datos y queda registro en la auditoría. No se puede deshacer.`))
              hacer(() => fuente.suprimirPersona(sesion, s.personaId!), "Persona suprimida. La supresión quedó en la auditoría.");
          }}>Suprimir a la persona</button>
        )}
        {!s.prorrogada && <button className="btn btn-chico" onClick={() => hacer(() => fuente.prorrogarSolicitud(sesion, s.id), `Plazo prorrogado ${p.prorroga} días hábiles. Recuerde informar al titular el motivo.`)}>Prorrogar {p.prorroga} días</button>}
        <button className="btn btn-chico btn-primario" disabled={respuesta.trim().length < 5} onClick={() => cerrar("resuelta")}>Marcar resuelta</button>
        <button className="btn btn-chico" disabled={respuesta.trim().length < 5} onClick={() => cerrar("rechazada")}>Rechazar</button>
      </div>
    </div>
  );
}

function NuevaSolicitudForm({ hacer }: { hacer: Hacer }) {
  const { sesion } = useTablero();
  const [tipo, setTipo] = useState<TipoSolicitud>("conocer");
  const [busqueda, setBusqueda] = useState("");
  const [encontradas, setEncontradas] = useState<PersonaEncontrada[] | null>(null);
  const [persona, setPersona] = useState<PersonaEncontrada | null>(null);
  const [detalle, setDetalle] = useState("");
  const [recibida, setRecibida] = useState(hoyBogota());

  async function buscar() {
    setPersona(null);
    setEncontradas(await fuente.buscarPersonas(sesion, busqueda).catch(() => []));
  }
  async function registrar(e: FormEvent) {
    e.preventDefault();
    await hacer(() => fuente.registrarSolicitud(sesion, { tipo, personaId: persona?.id, detalle, recibida }),
      "Solicitud registrada con su plazo legal.");
    setDetalle(""); setPersona(null); setEncontradas(null); setBusqueda("");
  }

  return (
    <form className="tarjeta pila" onSubmit={registrar} aria-label="Registrar solicitud">
      <h2>Registrar una solicitud</h2>
      <label className="campo">Qué pide el titular
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoSolicitud)}>
          {(Object.keys(nombreTipo) as TipoSolicitud[]).map((t) => <option key={t} value={t}>{nombreTipo[t]} ({plazoSolicitud[t].dias} días hábiles)</option>)}
        </select>
      </label>
      <label className="campo">Buscar a la persona (cédula, nombre o celular)
        <div className="fila" style={{ flexWrap: "nowrap" }}>
          <input style={{ flex: 1 }} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }} />
          <button className="btn btn-chico" type="button" onClick={buscar}>Buscar</button>
        </div>
      </label>
      {encontradas && !encontradas.length && <p className="tenue">No se encontró a nadie. Puede registrar la solicitud sin enlazarla.</p>}
      {encontradas && encontradas.length > 0 && (
        <label className="campo">Persona
          <select value={persona?.id ?? ""} onChange={(e) => setPersona(encontradas.find((x) => x.id === e.target.value) ?? null)}>
            <option value="">— Elija —</option>
            {encontradas.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.zona ? ` · ${x.zona}` : ""}</option>)}
          </select>
        </label>
      )}
      <label className="campo">Fecha en que se recibió
        <input type="date" max={hoyBogota()} value={recibida} onChange={(e) => setRecibida(e.target.value)} />
      </label>
      <label className="campo">Detalle
        <input value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Ej.: llegó por correo a la sede" />
      </label>
      <button className="btn btn-primario" type="submit">Registrar</button>
    </form>
  );
}

function Exportar({ hacer }: { hacer: Hacer }) {
  const { sesion } = useTablero();
  const [finalidad, setFinalidad] = useState("contacto_campana");
  const exportar = () => hacer(async () => {
    const e = await fuente.exportarPersonas(sesion, finalidad);
    const url = URL.createObjectURL(new Blob([csvExportacion(e, sesion.campana.candidato)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = nombreArchivoExportacion(e); a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "Exportación lista. Quedó registrada en la auditoría con su referencia.");

  return (
    <section className="tarjeta pila" aria-label="Exportar">
      <h2>Exportar la base</h2>
      <p className="tenue">Solo salen personas con autorización vigente para la finalidad elegida, sin cédula. El archivo lleva una marca con su referencia, y la exportación queda en la auditoría.</p>
      <label className="campo">Finalidad
        <select value={finalidad} onChange={(e) => setFinalidad(e.target.value)}>
          {Object.entries(FINALIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <button className="btn" onClick={exportar}>Exportar CSV</button>
    </section>
  );
}

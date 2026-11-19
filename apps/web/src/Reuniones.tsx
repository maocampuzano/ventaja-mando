// Reuniones y actas. La agenda de reuniones de la campaña, el acta de cada una (con ayuda de la IA y revisión de una
// persona) y la base de conocimiento: buscar en las actas aprobadas lo que se habló en cada territorio.
import { useCallback, useEffect, useMemo, useState } from "react";
import { compromisosConDinero, fecha, miles, type ActaPropuesta } from "@ventaja/nucleo";
import { useTablero } from "./datos/contexto";
import { fuente } from "./datos/index";
import type { BorradorActa, CompromisoActa, EstadoReunion, NuevaReunion, PersonaEquipo, Reunion, ResultadoActa, TipoReunion } from "./datos/tipos";

const NOMBRE_TIPO: Record<TipoReunion, string> = {
  lideres: "Con líderes", comunitaria: "Comunitaria", sectorial: "Sectorial", equipo: "De equipo", otra: "Otra",
};
const NOMBRE_ESTADO: Record<EstadoReunion, { texto: string; clase: string }> = {
  programada: { texto: "Programada", clase: "azul" }, realizada: { texto: "Realizada", clase: "verde" }, cancelada: { texto: "Cancelada", clase: "" },
};
const fechaHora = (iso: string) => new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit",
}).format(new Date(iso));
/** Para <input type="datetime-local">, en hora de Colombia. */
const aLocal = (iso: string) => new Date(new Date(iso).getTime() - 5 * 3_600_000).toISOString().slice(0, 16);
const deLocal = (local: string) => new Date(`${local}:00-05:00`).toISOString();

export function Reuniones() {
  const { sesion, zonas } = useTablero();
  const [lista, setLista] = useState<Reunion[] | null>(null);
  const [equipo, setEquipo] = useState<PersonaEquipo[]>([]);
  const [abierta, setAbierta] = useState<Reunion | "nueva" | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(() => {
    fuente.reuniones(sesion).then(setLista).catch((e: Error) => setError(e.message));
  }, [sesion]);
  useEffect(cargar, [cargar]);
  useEffect(() => { fuente.equipoReuniones(sesion).then(setEquipo).catch(() => setEquipo([])); }, [sesion]);

  const nombreZona = useMemo(() => new Map(zonas.map((z) => [z.id, z.nombre])), [zonas]);
  const ahora = new Date().toISOString();
  const proximas = (lista ?? []).filter((r) => r.estado === "programada" && r.fecha >= ahora).reverse();
  const pasadas = (lista ?? []).filter((r) => !(r.estado === "programada" && r.fecha >= ahora));

  if (abierta) {
    return <FichaReunion reunion={abierta === "nueva" ? null : abierta} equipo={equipo} nombreZona={nombreZona}
      alCerrar={(texto) => { setAbierta(null); if (texto) setAviso(texto); cargar(); }} />;
  }

  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>Reuniones</h1>
          <p className="tenue">La agenda de reuniones con líderes, equipo y comunidad, y el acta de cada una. Las actas aprobadas quedan como la memoria de la campaña: lo que se pidió y se prometió en cada territorio.</p>
        </div>
        <button className="btn btn-primario" onClick={() => { setAviso(""); setAbierta("nueva"); }}>Nueva reunión</button>
      </div>
      {aviso && <p className="sello verde" role="status" style={{ marginBottom: 12 }}>{aviso}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <BaseConocimiento nombreZona={nombreZona} alAbrir={(id) => { const r = lista?.find((x) => x.id === id); if (r) setAbierta(r); }} />

      <div className="hoy" style={{ marginTop: 16 }}>
        <section className="tarjeta pila" aria-labelledby="reu-pasadas">
          <h2 id="reu-pasadas">Realizadas</h2>
          {lista === null ? <p className="tenue">Cargando…</p> : pasadas.length ? (
            <div className="tabla-envoltura"><table>
              <thead><tr><th>Fecha</th><th>Reunión</th><th>Zona</th><th>Acta</th></tr></thead>
              <tbody>{pasadas.map((r) => (
                <tr key={r.id} className="clic" onClick={() => setAbierta(r)}>
                  <td>{fecha(r.fecha.slice(0, 10))}</td>
                  <td><strong>{r.titulo}</strong><div className="tenue" style={{ fontSize: 12 }}>{NOMBRE_TIPO[r.tipo]}{r.asistentesComunidad ? ` · ${miles(r.asistentesComunidad)} de la comunidad` : ""}</div></td>
                  <td>{(r.territorioId && nombreZona.get(r.territorioId)) || "—"}</td>
                  <td>{r.estado === "cancelada" ? <span className="sello">Cancelada</span>
                    : r.acta?.estado === "aprobada" ? <span className="sello verde">Aprobada</span>
                    : r.acta ? <span className="sello ambar">Por aprobar</span> : <span className="sello rojo">Sin acta</span>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <p className="tenue">Todavía no hay reuniones realizadas. Registre la primera con «Nueva reunión».</p>}
        </section>

        <section className="tarjeta pila" aria-labelledby="reu-proximas">
          <h2 id="reu-proximas">Próximas</h2>
          {lista === null ? <p className="tenue">Cargando…</p> : proximas.length ? proximas.map((r) => (
            <button key={r.id} className="sugerida" onClick={() => setAbierta(r)}>
              <strong>{r.titulo}</strong>
              <div className="tenue" style={{ fontSize: 12.5 }}>{fechaHora(r.fecha)} · {(r.territorioId && nombreZona.get(r.territorioId)) || "Sin zona"}</div>
            </button>
          )) : <p className="tenue">No hay reuniones programadas.</p>}
        </section>
      </div>
    </div>
  );
}

function BaseConocimiento({ nombreZona, alAbrir }: { nombreZona: Map<string, string>; alAbrir: (reunionId: string) => void }) {
  const { sesion } = useTablero();
  const [texto, setTexto] = useState("");
  const [zona, setZona] = useState("");
  const [resultados, setResultados] = useState<ResultadoActa[] | null>(null);
  const [error, setError] = useState("");
  const buscar = () => {
    setError("");
    fuente.buscarActas(sesion, { texto, territorioId: zona || undefined }).then(setResultados).catch((e: Error) => setError(e.message));
  };
  return (
    <section className="tarjeta pila" aria-labelledby="reu-buscar">
      <h2 id="reu-buscar">Base de conocimiento</h2>
      <form className="fila" onSubmit={(e) => { e.preventDefault(); buscar(); }}>
        <label className="campo" style={{ flex: "2 1 260px" }}>Qué busca
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Por ejemplo: vías, salud, puesto de salud" />
        </label>
        <label className="campo" style={{ flex: "1 1 180px" }}>Zona
          <select value={zona} onChange={(e) => setZona(e.target.value)}>
            <option value="">Todas</option>
            {[...nombreZona.entries()].map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
        </label>
        <button className="btn btn-primario" type="submit" style={{ alignSelf: "flex-end" }}>Buscar en las actas</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {resultados && (resultados.length ? (
        <div className="pila" style={{ gap: 8 }} aria-label="Resultados de la búsqueda">
          {resultados.map((r) => (
            <button key={r.actaId} className="sugerida" onClick={() => alAbrir(r.reunionId)}>
              <strong>{r.titulo}</strong> <span className="tenue">· {fecha(r.fecha.slice(0, 10))}{r.territorio ? ` · ${r.territorio}` : ""}</span>
              <div style={{ fontSize: 13, marginTop: 4 }}>{r.extracto}</div>
              {r.temas.length > 0 && <div className="fila" style={{ gap: 6, marginTop: 6 }}>{r.temas.map((t) => <span key={t} className="sello">{t}</span>)}</div>}
            </button>
          ))}
        </div>
      ) : <p className="tenue">Ninguna acta aprobada habla de eso{zona ? " en esa zona" : ""}.</p>)}
    </section>
  );
}

function FichaReunion({ reunion, equipo, nombreZona, alCerrar }: {
  reunion: Reunion | null; equipo: PersonaEquipo[]; nombreZona: Map<string, string>; alCerrar: (aviso?: string) => void;
}) {
  const { sesion, zonas, lideres } = useTablero();
  const [datos, setDatos] = useState<NuevaReunion>(() => reunion ?? {
    titulo: "", tipo: "lideres", fecha: new Date(Date.now() + 86_400_000).toISOString(), lugar: "", territorioId: zonas[0]?.id ?? null,
    estado: "programada", asistentesComunidad: 0, liderIds: [], equipoIds: [],
  });
  const [id, setId] = useState(reunion?.id ?? null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const cambiar = (c: Partial<NuevaReunion>) => setDatos((d) => ({ ...d, ...c }));
  const lideresZona = lideres.filter((l) => !datos.territorioId || l.zonaId === datos.territorioId);

  const guardar = async () => {
    setOcupado(true); setError("");
    try {
      const nuevo = await fuente.guardarReunion(sesion, { ...datos, id: id ?? undefined });
      if (!id) setId(nuevo); else alCerrar("Reunión guardada.");
    } catch (e) { setError((e as Error).message); }
    setOcupado(false);
  };

  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>{reunion ? reunion.titulo : id ? datos.titulo : "Nueva reunión"}</h1>
          <p className="tenue">{datos.territorioId ? nombreZona.get(datos.territorioId) : "Sin zona"} · {NOMBRE_ESTADO[datos.estado].texto}</p>
        </div>
        <button className="btn" onClick={() => alCerrar()}>Volver a las reuniones</button>
      </div>
      <div className="hoy">
        <div className="hoy-col">
          {id && <EditorActa reunionId={id} equipo={equipo} alAprobar={(n) => alCerrar(`Acta aprobada. ${n === 1 ? "1 compromiso quedó" : `${n} compromisos quedaron`} como tarea.`)} />}
          {!id && <p className="caja tenue">Guarde primero la reunión. Después podrá escribir el acta.</p>}
        </div>
        <section className="tarjeta pila" aria-labelledby="reu-datos">
          <h2 id="reu-datos">La reunión</h2>
          <label className="campo">Título<input value={datos.titulo} onChange={(e) => cambiar({ titulo: e.target.value })} placeholder="Por ejemplo: reunión con líderes de Solano" /></label>
          <div className="fila">
            <label className="campo" style={{ flex: 1 }}>Tipo
              <select value={datos.tipo} onChange={(e) => cambiar({ tipo: e.target.value as TipoReunion })}>
                {Object.entries(NOMBRE_TIPO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
            <label className="campo" style={{ flex: 1 }}>Estado
              <select value={datos.estado} onChange={(e) => cambiar({ estado: e.target.value as EstadoReunion })}>
                {Object.entries(NOMBRE_ESTADO).map(([v, t]) => <option key={v} value={v}>{t.texto}</option>)}
              </select>
            </label>
          </div>
          <label className="campo">Fecha y hora<input type="datetime-local" value={aLocal(datos.fecha)} onChange={(e) => e.target.value && cambiar({ fecha: deLocal(e.target.value) })} /></label>
          <label className="campo">Zona
            <select value={datos.territorioId ?? ""} onChange={(e) => cambiar({ territorioId: e.target.value || null, liderIds: [] })}>
              {(sesion.rol !== "coordinador") && <option value="">Sin zona (toda la campaña)</option>}
              {zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
            </select>
          </label>
          <label className="campo">Lugar<input value={datos.lugar ?? ""} onChange={(e) => cambiar({ lugar: e.target.value })} /></label>
          <label className="campo">Personas de la comunidad que asistieron
            <input inputMode="numeric" value={datos.asistentesComunidad || ""} placeholder="0"
              onChange={(e) => cambiar({ asistentesComunidad: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
          </label>
          <p className="tenue" style={{ fontSize: 12 }}>Solo el número. Para registrar a alguien de la comunidad, use una planilla: así queda su autorización.</p>
          <fieldset className="zonas-elegir"><legend>Líderes que asistieron</legend>
            {lideresZona.length ? lideresZona.map((l) => (
              <label key={l.id} className="fila" style={{ gap: 6 }}>
                <input type="checkbox" checked={datos.liderIds.includes(l.id)}
                  onChange={(e) => cambiar({ liderIds: e.target.checked ? [...datos.liderIds, l.id] : datos.liderIds.filter((x) => x !== l.id) })} />{l.nombre}
              </label>
            )) : <span className="tenue">No hay líderes en esa zona.</span>}
          </fieldset>
          <fieldset className="zonas-elegir"><legend>Del equipo</legend>
            {equipo.map((p) => (
              <label key={p.usuarioId} className="fila" style={{ gap: 6 }}>
                <input type="checkbox" checked={datos.equipoIds.includes(p.usuarioId)}
                  onChange={(e) => cambiar({ equipoIds: e.target.checked ? [...datos.equipoIds, p.usuarioId] : datos.equipoIds.filter((x) => x !== p.usuarioId) })} />{p.nombre}
              </label>
            ))}
          </fieldset>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primario" disabled={ocupado || datos.titulo.trim().length < 3} onClick={guardar}>
            {id ? "Guardar la reunión" : "Crear la reunión"}
          </button>
        </section>
      </div>
    </div>
  );
}

const ACTA_VACIA: BorradorActa = { resumen: "", temas: [], acuerdos: "", compromisos: [], origen: "manual" };

function EditorActa({ reunionId, equipo, alAprobar }: { reunionId: string; equipo: PersonaEquipo[]; alAprobar: (compromisos: number) => void }) {
  const { sesion } = useTablero();
  const [acta, setActa] = useState<BorradorActa>(ACTA_VACIA);
  const [actaId, setActaId] = useState<string | null>(null);
  const [aprobada, setAprobada] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [notas, setNotas] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [temasTexto, setTemasTexto] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    fuente.actaDeReunion(sesion, reunionId).then((a) => {
      if (a) { setActa(a); setActaId(a.id); setAprobada(a.estado === "aprobada"); setTemasTexto(a.temas.join(", ")); }
      setCargando(false);
    }).catch((e: Error) => { setError(e.message); setCargando(false); });
  }, [sesion, reunionId]);

  const conDinero = compromisosConDinero({ ...acta, compromisos: acta.compromisos.map((c) => ({ descripcion: c.descripcion, vence_en: c.venceEn })) } as ActaPropuesta);
  const nombre = (id: string | null) => equipo.find((p) => p.usuarioId === id)?.nombre ?? "Sin responsable";
  const cambiarCompromiso = (i: number, c: Partial<CompromisoActa>) =>
    setActa((a) => ({ ...a, compromisos: a.compromisos.map((x, j) => (j === i ? { ...x, ...c } : x)) }));

  const redactar = async () => {
    setOcupado(true); setError(""); setAviso("");
    try {
      const p = await fuente.redactarActa(sesion, reunionId, notas, foto);
      setActa((a) => ({ ...a, resumen: p.resumen, acuerdos: p.acuerdos, temas: p.temas, origen: "ia",
        compromisos: p.compromisos.map((c) => ({ descripcion: c.descripcion, responsableId: null, venceEn: c.vence_en })) }));
      setTemasTexto(p.temas.join(", "));
      setAviso(p.aviso ?? "La IA propuso el acta. Revísela, corrija lo que haga falta y guárdela.");
    } catch (e) { setError((e as Error).message); }
    setOcupado(false);
  };
  const datosActa = (): BorradorActa => ({ ...acta, temas: temasTexto.split(",").map((t) => t.trim()).filter(Boolean) });
  const guardar = async () => {
    setOcupado(true); setError(""); setAviso("");
    try { setActaId(await fuente.guardarActa(sesion, reunionId, datosActa())); setAviso("Borrador guardado."); }
    catch (e) { setError((e as Error).message); }
    setOcupado(false);
  };
  const aprobar = async () => {
    setOcupado(true); setError("");
    try {
      const id = await fuente.guardarActa(sesion, reunionId, datosActa());
      alAprobar(await fuente.aprobarActa(sesion, id));
    } catch (e) { setError((e as Error).message); setOcupado(false); }
  };

  if (cargando) return <section className="tarjeta"><p className="tenue">Cargando el acta…</p></section>;

  if (aprobada) {
    return (
      <section className="tarjeta pila" aria-labelledby="acta-titulo">
        <div className="fila entre"><h2 id="acta-titulo">Acta</h2><span className="sello verde">Aprobada</span></div>
        <p>{acta.resumen}</p>
        {acta.temas.length > 0 && <div className="fila" style={{ gap: 6 }}>{acta.temas.map((t) => <span key={t} className="sello">{t}</span>)}</div>}
        {acta.acuerdos && <><h3>Acuerdos</h3><p>{acta.acuerdos}</p></>}
        <h3>Compromisos</h3>
        {acta.compromisos.length ? acta.compromisos.map((c, i) => (
          <div key={i} className="fila entre"><span>{c.descripcion}</span><span className="tenue">{nombre(c.responsableId)}{c.venceEn ? ` · hasta ${fecha(c.venceEn)}` : ""}</span></div>
        )) : <p className="tenue">Sin compromisos.</p>}
        {acta.origen === "ia" && <p className="tenue" style={{ fontSize: 12 }}>Redactada con ayuda de la IA y revisada por una persona.</p>}
      </section>
    );
  }

  return (
    <>
      <section className="tarjeta pila" aria-labelledby="acta-ia">
        <h2 id="acta-ia">Redactar el acta con IA</h2>
        <p className="tenue">Escriba lo que pasó en la reunión, como le salga, o adjunte la foto del acta escrita a mano. La IA propone el acta y usted la revisa antes de guardarla. No escriba teléfonos ni cédulas: se borran antes de enviar las notas.</p>
        <label className="campo">Notas de la reunión
          <textarea rows={6} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Qué se habló, qué pidieron, qué se acordó y quién quedó de hacer qué." />
        </label>
        <label className="campo">Foto del acta escrita a mano (opcional)
          <input type="file" accept="image/jpeg,image/png" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
        </label>
        <div><button className="btn btn-primario" disabled={ocupado || (!notas.trim() && !foto)} onClick={redactar}>{ocupado ? "Redactando…" : "Redactar con IA"}</button></div>
      </section>

      <section className="tarjeta pila" aria-labelledby="acta-titulo">
        <div className="fila entre"><h2 id="acta-titulo">Acta</h2><span className="sello ambar">{actaId ? "Borrador" : "Sin guardar"}</span></div>
        {aviso && <p className="sello azul" role="status" style={{ whiteSpace: "normal" }}>{aviso}</p>}
        <label className="campo">Resumen<textarea rows={5} value={acta.resumen} onChange={(e) => setActa({ ...acta, resumen: e.target.value })} /></label>
        <label className="campo">Temas (separados por comas)<input value={temasTexto} onChange={(e) => setTemasTexto(e.target.value)} placeholder="vías, salud, empleo" /></label>
        <label className="campo">Acuerdos<textarea rows={3} value={acta.acuerdos} onChange={(e) => setActa({ ...acta, acuerdos: e.target.value })} /></label>
        <h3>Compromisos</h3>
        <p className="tenue" style={{ fontSize: 12 }}>Al aprobar el acta, cada compromiso se vuelve una tarea para su responsable. Un compromiso nunca puede ofrecer dinero, mercados, empleo ni otros beneficios a cambio de apoyo (art. 390 del Código Penal).</p>
        {acta.compromisos.map((c, i) => (
          <div key={i} className="campo-formulario">
            <label className="campo">Qué se va a hacer<input value={c.descripcion} onChange={(e) => cambiarCompromiso(i, { descripcion: e.target.value })} /></label>
            {conDinero.some((d) => d.descripcion === c.descripcion) && <p className="sello rojo" style={{ whiteSpace: "normal" }}>Este compromiso habla de dinero o beneficios: así no se puede guardar.</p>}
            <div className="fila">
              <label className="campo" style={{ flex: 2 }}>Responsable
                <select value={c.responsableId ?? ""} onChange={(e) => cambiarCompromiso(i, { responsableId: e.target.value || null })}>
                  <option value="">Sin responsable</option>
                  {equipo.map((p) => <option key={p.usuarioId} value={p.usuarioId}>{p.nombre}</option>)}
                </select>
              </label>
              <label className="campo" style={{ flex: 1 }}>Hasta<input type="date" value={c.venceEn ?? ""} onChange={(e) => cambiarCompromiso(i, { venceEn: e.target.value || null })} /></label>
              <button className="btn btn-chico" style={{ alignSelf: "flex-end" }} onClick={() => setActa({ ...acta, compromisos: acta.compromisos.filter((_, j) => j !== i) })}>Quitar</button>
            </div>
          </div>
        ))}
        <div><button className="btn btn-chico" onClick={() => setActa({ ...acta, compromisos: [...acta.compromisos, { descripcion: "", responsableId: null, venceEn: null }] })}>Agregar compromiso</button></div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="fila">
          <button className="btn" disabled={ocupado} onClick={guardar}>Guardar borrador</button>
          <button className="btn btn-primario" disabled={ocupado || acta.resumen.trim().length < 10 || conDinero.length > 0} onClick={aprobar}>Aprobar el acta</button>
        </div>
      </section>
    </>
  );
}

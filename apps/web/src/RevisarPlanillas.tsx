// Revisión de planillas leídas por la IA (regla 7: nada leído entra a la base sin que una persona lo revise).
// Ámbar: confirmar (confianza baja o formato que no cuadra). Rojo: repetido en la hoja o no se registra (sin firma o
// sin nombre). Para aprobar hay que vincular la foto con su hoja impresa (QR) y confirmar cada fila dudosa.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  leerCodigoHoja, repetidosEnHoja, revisarFila, type CampoFila, type FilaLeida,
} from "@ventaja/nucleo";
import { fuente } from "./datos/index";
import { useTablero } from "./datos/contexto";
import type { FilaParaRevisar, LotePlanilla, PlanillaPorRevisar, ResultadoAprobacion } from "./datos/tipos";

const ESTADO: Record<PlanillaPorRevisar["estado"], string> = { pendiente: "Por leer", leido: "Leída: por revisar", en_revision: "En revisión" };

export function RevisarPlanillas() {
  const { sesion } = useTablero();
  const [lista, setLista] = useState<PlanillaPorRevisar[] | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(() => {
    fuente.planillasPorRevisar(sesion).then(setLista).catch((e: Error) => setError(e.message));
  }, [sesion]);
  useEffect(cargar, [cargar]);

  async function leer(id: string) {
    setOcupada(id); setError(""); setAviso("");
    try {
      const n = await fuente.leerPlanilla(sesion, id);
      setAviso(`Se leyeron ${n} filas. Revíselas antes de aprobar.`);
      cargar();
      setAbierta(id);
    } catch (x) { setError((x as Error).message); cargar(); } finally { setOcupada(null); }
  }

  const planilla = lista?.find((p) => p.id === abierta);
  return (
    <section className="tarjeta pila" aria-label="Planillas por revisar">
      <h2>Planillas por revisar</h2>
      <p className="tenue">Las fotos que suben los líderes se leen con IA y quedan aquí. Nada entra a la base hasta que una persona revise cada fila y apruebe la hoja.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {aviso && <p className="aviso" role="status">{aviso}</p>}
      {!lista ? <p className="tenue">Cargando…</p> : !lista.length ? <p className="tenue">No hay planillas por revisar.</p> : (
        <div className="tabla-envoltura">
          <table aria-label="Lista de planillas por revisar">
            <thead><tr><th>Líder</th><th>Hoja impresa</th><th>Estado</th><th className="num">Filas</th><th /></tr></thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} aria-selected={p.id === abierta}>
                  <td>{p.lider}</td>
                  <td className="tenue">{p.loteNumero ? `Lote ${p.loteNumero} · hoja ${p.hoja}` : "Sin vincular"}</td>
                  <td>{p.error ? <span className="sello rojo" title={p.error}>No se pudo leer</span> : <span className={`sello ${p.estado === "pendiente" ? "" : "ambar"}`}>{ESTADO[p.estado]}</span>}</td>
                  <td className="num">{p.filas || "—"}</td>
                  <td>
                    {p.estado === "pendiente"
                      ? <button className="btn btn-chico" disabled={ocupada !== null} onClick={() => void leer(p.id)}>{ocupada === p.id ? "Leyendo…" : "Leer con IA"}</button>
                      : <button className="btn btn-chico btn-primario" onClick={() => { setAbierta(p.id); setAviso(""); }}>Revisar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {planilla && planilla.estado !== "pendiente" && (
        <Revision key={planilla.id} planilla={planilla}
          alCerrar={() => setAbierta(null)}
          alCambiar={cargar}
          alAprobar={(r) => {
            setAbierta(null);
            setAviso(`Hoja aprobada: ${r.creadas} ${r.creadas === 1 ? "persona nueva" : "personas nuevas"} como «sin contactar»` +
              `${r.sinFirma ? `, ${r.sinFirma} sin firma (no se registran)` : ""}${r.yaExistian ? `, ${r.yaExistian} ya estaban` : ""}` +
              `${r.descartadas ? `, ${r.descartadas} descartadas` : ""}${r.rechazos.length - r.yaExistian > 0 ? `, ${r.rechazos.length - r.yaExistian} con problemas` : ""}.`);
            cargar();
          }} />
      )}
    </section>
  );
}

type Edicion = { nombre: string; cedula: string; celular: string; barrio: string; firma: boolean; descartar: boolean; confirmada: boolean };

function Revision({ planilla, alCerrar, alCambiar, alAprobar }: {
  planilla: PlanillaPorRevisar; alCerrar: () => void; alCambiar: () => void; alAprobar: (r: ResultadoAprobacion) => void;
}) {
  const { sesion } = useTablero();
  const [filas, setFilas] = useState<FilaParaRevisar[] | null>(null);
  const [ed, setEd] = useState<Record<string, Edicion>>({});
  const [foto, setFoto] = useState<string | null>(null);
  const [lotes, setLotes] = useState<LotePlanilla[]>([]);
  const [manual, setManual] = useState({ lote: "", hoja: 1 });
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    fuente.filasPlanilla(sesion, planilla.id).then((fs) => {
      setFilas(fs);
      setEd(Object.fromEntries(fs.map((f) => [f.filaId, { nombre: f.nombre, cedula: f.cedula, celular: f.celular, barrio: f.barrio, firma: f.firma, descartar: false, confirmada: false }])));
    }).catch((e: Error) => setError(e.message));
    fuente.fotoPlanilla(sesion, planilla.id).then(setFoto).catch(() => setFoto(null));
    fuente.lotesPlanilla(sesion).then(setLotes).catch(() => setLotes([]));
  }, [sesion, planilla.id]);

  // Lo que la persona corrigió deja de estar en duda: su confianza pasa a 1.
  const revisadas = useMemo(() => (filas ?? []).map((f) => {
    const e = ed[f.filaId];
    if (!e) return null;
    const conf = { ...f.confianza };
    for (const c of ["nombre", "cedula", "celular", "barrio"] as const) if (e[c] !== f[c]) conf[c] = 1;
    if (e.firma !== f.firma) conf.firma = 1;
    const leida: FilaLeida = { renglon: f.renglon, nombre: e.nombre, cedula: e.cedula, celular: e.celular, barrio: e.barrio, firma: e.firma, confianza: conf };
    return { fila: f, e, r: revisarFila(leida) };
  }).filter((x): x is NonNullable<typeof x> => x !== null), [filas, ed]);
  const repetidos = useMemo(() => repetidosEnHoja(revisadas.filter((x) => !x.e.descartar).map((x) => x.r)), [revisadas]);
  const porConfirmar = revisadas.filter((x) => !x.e.descartar && !x.e.confirmada && (x.r.dudas.length > 0 || repetidos.has(x.r.renglon)));
  // Lo que no se puede aprobar ni confirmando (por ejemplo, una cédula con «?»): hay que corregirlo o descartar la fila.
  const porCorregir = revisadas.filter((x) => !x.e.descartar && x.r.corregir.length > 0);
  const seRegistran = revisadas.filter((x) => !x.e.descartar && x.r.bloqueos.length === 0).length;
  const vinculada = planilla.loteNumero !== null;

  const cambiar = (id: string, cambio: Partial<Edicion>) => setEd((x) => ({ ...x, [id]: { ...x[id], ...cambio } }));

  async function vincular(loteImpreso: string, hoja: number) {
    setError("");
    try { await fuente.vincularHoja(sesion, planilla.id, loteImpreso, hoja); alCambiar(); } catch (x) { setError((x as Error).message); }
  }

  async function leerQr() {
    if (!foto) return;
    setError("");
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((ok, mal) => { img.onload = () => ok(); img.onerror = () => mal(new Error("No se pudo abrir la foto.")); img.src = foto; });
      const escala = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * escala); c.height = Math.round(img.naturalHeight * escala);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const { default: jsQR } = await import("jsqr");
      const datos = ctx.getImageData(0, 0, c.width, c.height);
      const qr = jsQR(datos.data, c.width, c.height);
      const codigo = qr && leerCodigoHoja(qr.data);
      if (!codigo) { setError("No se encontró el código QR de la planilla en la foto. Elija el lote y la hoja a mano."); return; }
      await vincular(codigo.loteId, codigo.hoja);
    } catch (x) { setError((x as Error).message); }
  }

  async function aprobar() {
    setOcupado(true); setError("");
    try {
      const r = await fuente.aprobarPlanilla(sesion, planilla.id, revisadas.map(({ fila, e, r: rv }) => ({
        filaId: fila.filaId, nombre: rv.nombre, documento: rv.cedula ?? "", telefono: rv.celular ?? (e.celular.trim() ? e.celular : ""),
        firma: e.firma, descartar: e.descartar,
      })));
      alAprobar(r);
    } catch (x) { setError((x as Error).message); } finally { setOcupado(false); }
  }

  const duda = (r: { dudas: CampoFila[] }, c: CampoFila, confirmada: boolean) => (!confirmada && r.dudas.includes(c) ? "duda" : undefined);

  return (
    <div className="pila" aria-label={`Revisión de la planilla de ${planilla.lider}`}>
      <hr className="separa" />
      <div className="fila entre">
        <h3>Planilla de {planilla.lider}{vinculada ? ` · lote ${planilla.loteNumero}, hoja ${planilla.hoja}` : ""}</h3>
        <button className="btn btn-chico" onClick={alCerrar}>Cerrar</button>
      </div>
      {foto ? <img className="revision-foto" src={foto} alt={`Foto de la planilla de ${planilla.lider}`} />
        : <p className="etiqueta">Modo demo: no hay foto real. En el producto, aquí se ve la foto para comparar fila por fila.</p>}

      {!vinculada && (
        <div className="aviso pila" role="group" aria-label="Vincular con la hoja impresa">
          <span>Vincule la foto con su hoja impresa: la autorización que firmaron es la de esa planilla.</span>
          <div className="fila">
            {foto && <button className="btn btn-chico btn-primario" onClick={() => void leerQr()}>Leer el código QR de la foto</button>}
            <select aria-label="Lote impreso" value={manual.lote} onChange={(e) => setManual({ ...manual, lote: e.target.value })}>
              <option value="">Elegir lote impreso…</option>
              {lotes.map((l) => <option key={l.id} value={l.id}>Lote {l.numero} · {l.lider} · {l.hojas} hojas</option>)}
            </select>
            <input type="number" aria-label="Hoja" min={1} max={50} value={manual.hoja} style={{ width: 70 }}
              onChange={(e) => setManual({ ...manual, hoja: Math.trunc(Number(e.target.value)) })} />
            <button className="btn btn-chico" disabled={!manual.lote} onClick={() => void vincular(manual.lote, manual.hoja)}>Vincular</button>
          </div>
        </div>
      )}

      {!filas ? <p className="tenue">Cargando filas…</p> : (
        <div className="tabla-envoltura">
          <table className="revision-tabla" aria-label="Filas leídas">
            <thead><tr><th className="num">N.º</th><th>Nombre</th><th>Cédula</th><th>Celular</th><th>Barrio</th><th>Firma</th><th>Revisión</th></tr></thead>
            <tbody>
              {revisadas.map(({ fila, e, r }) => {
                const rep = repetidos.get(r.renglon);
                // La casilla queda visible mientras haya algo dudoso, para poder desmarcarla.
                const conDuda = !e.descartar && (r.dudas.length > 0 || !!rep);
                return (
                  <tr key={fila.filaId} className={e.descartar ? "descartada" : r.bloqueos.length ? "bloqueada" : undefined} aria-label={`Renglón ${r.renglon}`}>
                    <td className="num">{r.renglon}</td>
                    <td><input type="text" aria-label="Nombre" className={duda(r, "nombre", e.confirmada)} value={e.nombre} onChange={(x) => cambiar(fila.filaId, { nombre: x.target.value })} /></td>
                    <td><input type="text" aria-label="Cédula" className={duda(r, "cedula", e.confirmada)} value={e.cedula} onChange={(x) => cambiar(fila.filaId, { cedula: x.target.value })} /></td>
                    <td><input type="text" aria-label="Celular" className={duda(r, "celular", e.confirmada)} value={e.celular} onChange={(x) => cambiar(fila.filaId, { celular: x.target.value })} /></td>
                    <td><input type="text" aria-label="Barrio" className={duda(r, "barrio", e.confirmada)} value={e.barrio} onChange={(x) => cambiar(fila.filaId, { barrio: x.target.value })} /></td>
                    <td><input type="checkbox" aria-label="Tiene firma" checked={e.firma} onChange={(x) => cambiar(fila.filaId, { firma: x.target.checked })} /></td>
                    <td className="pila" style={{ gap: 4 }}>
                      {rep && !e.descartar && <span className="sello rojo">{rep}</span>}
                      {r.bloqueos.map((b) => !e.descartar && <span key={b} className="etiqueta">{b}</span>)}
                      {r.corregir.map((c) => !e.descartar && <span key={c} className="sello ambar">{c}</span>)}
                      {conDuda && <label className="fila"><input type="checkbox" checked={e.confirmada} onChange={(x) => cambiar(fila.filaId, { confirmada: x.target.checked })} /> Ya lo comparé con la foto</label>}
                      <label className="fila"><input type="checkbox" checked={e.descartar} onChange={(x) => cambiar(fila.filaId, { descartar: x.target.checked })} /> Descartar</label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="fila entre">
        <span className="tenue">
          {!vinculada ? "Falta vincular la hoja impresa." : porCorregir.length ? `${porCorregir.length} ${porCorregir.length === 1 ? "fila por corregir" : "filas por corregir"}: una cédula incompleta no se puede aprobar.` : porConfirmar.length ? `${porConfirmar.length} ${porConfirmar.length === 1 ? "fila por confirmar" : "filas por confirmar"} (en ámbar o rojo).` : "Todo revisado."}
        </span>
        <button className="btn btn-primario" disabled={!filas || !vinculada || porConfirmar.length > 0 || porCorregir.length > 0 || ocupado} onClick={() => void aprobar()}>
          {ocupado ? "Aprobando…" : `Aprobar la hoja (${seRegistran} ${seRegistran === 1 ? "registro" : "registros"})`}
        </button>
      </div>
    </div>
  );
}

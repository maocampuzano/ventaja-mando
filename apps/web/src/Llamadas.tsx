// Telemarketing para la dirección: armar colas (solo personas con autorización vigente para contacto y sin baja),
// asignar operadores y seguir el avance en totales. Aquí no se ven personas una por una.
import { useCallback, useEffect, useState } from "react";
import { RESULTADOS_LLAMADA, avanceCola, fecha, miles, pct, type SegmentoEnvio } from "@ventaja/nucleo";
import { Barra } from "./comunes";
import { useTablero } from "./datos/contexto";
import { fuente } from "./datos/index";
import type { ColaLlamadas, EstadoCola, Miembro } from "./datos/tipos";
import { SelectorSegmento } from "./SelectorSegmento";

const NOMBRE_ESTADO: Record<EstadoCola, { texto: string; clase: string }> = {
  activa: { texto: "Activa", clase: "verde" }, pausada: { texto: "Pausada", clase: "ambar" }, cerrada: { texto: "Cerrada", clase: "" },
};

export function Llamadas() {
  const { sesion } = useTablero();
  const [colas, setColas] = useState<ColaLlamadas[] | null>(null);
  const [operadores, setOperadores] = useState<Miembro[]>([]);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [nueva, setNueva] = useState(false);

  const cargar = useCallback(() => {
    fuente.colas(sesion).then(setColas).catch((e: Error) => setError(e.message));
  }, [sesion]);
  useEffect(cargar, [cargar]);
  useEffect(() => {
    fuente.equipo(sesion).then((e) => setOperadores(e.miembros.filter((m) => m.rol === "operador" && m.activa))).catch(() => setOperadores([]));
  }, [sesion]);

  async function hacer(accion: () => Promise<void>, exito: string) {
    setError(""); setAviso("");
    try { await accion(); setAviso(exito); } catch (e) { setError((e as Error).message); } finally { cargar(); }
  }

  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>Llamadas</h1>
          <p className="tenue">Colas de llamadas con su guion. Solo entran personas con autorización vigente para contacto que no se han dado de baja. Cada operador recibe una persona a la vez y solo ve a quien está llamando.</p>
        </div>
        {!nueva && <button className="btn btn-primario" onClick={() => setNueva(true)}>Nueva cola</button>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {aviso && <p className="aviso" role="status">{aviso}</p>}
      {!operadores.length && <p className="aviso">Todavía no hay operadores en el equipo. Invítelos desde «Equipo» con el rol «Operador de llamadas».</p>}

      {nueva && <NuevaCola alCerrar={() => setNueva(false)} alCrear={(n) => { setNueva(false); setAviso(`Cola creada con ${miles(n)} ${n === 1 ? "persona" : "personas"}. Asígnele operadores.`); cargar(); }} />}

      <div className="pila">
        {colas?.length === 0 && <div className="tarjeta"><p className="tenue">Todavía no hay colas.</p></div>}
        {colas?.map((c) => {
          const avance = avanceCola(c.resumen);
          return (
            <section key={c.id} className="tarjeta pila" aria-label={c.nombre}>
              <div className="fila entre">
                <h2>{c.nombre}</h2>
                <span className={`sello ${NOMBRE_ESTADO[c.estado].clase}`}>{NOMBRE_ESTADO[c.estado].texto}</span>
              </div>
              <span className="etiqueta">Creada el {fecha(c.creado)} · {miles(c.resumen.total)} personas</span>
              <div>
                <div className="fila entre"><span className="tenue">Avance</span><strong>{pct(avance)}</strong></div>
                <Barra valor={avance} />
                <p className="etiqueta" style={{ marginTop: 6 }}>
                  {miles(c.resumen.pendientes)} por llamar · {miles(c.resumen.reintentar)} para reintentar · {miles(c.resumen.enCurso)} en curso ·
                  {" "}{miles(c.resumen.hechas)} hechas · {miles(c.resumen.descartadas)} fuera de la cola
                </p>
              </div>
              <div className="fila" style={{ gap: 6, flexWrap: "wrap" }} aria-label="Resultados de hoy">
                <span className="tenue" style={{ fontSize: 13 }}>Hoy:</span>
                {RESULTADOS_LLAMADA.map((r) => <span key={r.id} className="sello">{r.nombre}: {miles(c.resumen.hoy[r.id])}</span>)}
              </div>
              {c.guion && <details><summary className="tenue">Guion</summary><p style={{ whiteSpace: "pre-wrap" }}>{c.guion}</p></details>}
              {operadores.length > 0 && (
                <fieldset className="campo-formulario">
                  <legend>Operadores</legend>
                  <div className="fila" style={{ gap: 12, flexWrap: "wrap" }}>
                    {operadores.map((o) => (
                      <label key={o.id} className="fila" style={{ gap: 6, fontSize: 13 }}>
                        <input type="checkbox" checked={c.operadores.includes(o.id)} disabled={c.estado === "cerrada"}
                          onChange={() => hacer(() => fuente.asignarOperadores(sesion, c.id,
                            c.operadores.includes(o.id) ? c.operadores.filter((x) => x !== o.id) : [...c.operadores, o.id]), "Operadores actualizados.")} />
                        {o.nombre}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <div className="fila" style={{ gap: 6 }}>
                {c.estado === "activa" && <button className="btn btn-chico" onClick={() => hacer(() => fuente.cambiarEstadoCola(sesion, c.id, "pausada"), "Cola pausada.")}>Pausar</button>}
                {c.estado === "pausada" && <button className="btn btn-chico" onClick={() => hacer(() => fuente.cambiarEstadoCola(sesion, c.id, "activa"), "Cola reanudada.")}>Reanudar</button>}
                {c.estado !== "cerrada" && (
                  <button className="btn btn-chico" onClick={() => { if (window.confirm(`¿Cerrar «${c.nombre}»? No se harán más llamadas de esta cola.`)) void hacer(() => fuente.cambiarEstadoCola(sesion, c.id, "cerrada"), "Cola cerrada."); }}>Cerrar</button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function NuevaCola({ alCerrar, alCrear }: { alCerrar: () => void; alCrear: (personas: number) => void }) {
  const { sesion } = useTablero();
  const [nombre, setNombre] = useState("");
  const [guion, setGuion] = useState("");
  const [segmento, setSegmento] = useState<SegmentoEnvio>({});
  const [conteo, setConteo] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Las llamadas usan el mismo filtro que los SMS: autorización vigente para contacto, sin baja y con celular.
  useEffect(() => {
    let vigente = true;
    const t = setTimeout(() => {
      fuente.contarDestinatarios(sesion, "sms", segmento).then((n) => { if (vigente) setConteo(n); }).catch(() => { if (vigente) setConteo(null); });
    }, 250);
    return () => { vigente = false; clearTimeout(t); };
  }, [segmento, sesion]);

  async function crear() {
    setGuardando(true); setError("");
    try { const r = await fuente.crearCola(sesion, { nombre, guion, segmento }); alCrear(r.personas); }
    catch (e) { setError((e as Error).message); } finally { setGuardando(false); }
  }

  return (
    <section className="tarjeta pila" aria-label="Nueva cola" style={{ marginBottom: 16 }}>
      <div className="fila entre"><h2>Nueva cola</h2><button className="btn btn-chico" onClick={alCerrar}>Cerrar</button></div>
      <label className="campo">Nombre de la cola<input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Por ejemplo: invitación a la reunión del sábado" /></label>
      <label className="campo">Guion para el operador
        <textarea rows={4} value={guion} onChange={(e) => setGuion(e.target.value)} placeholder="Buenos días, le hablo de la campaña…" />
      </label>
      <p className="etiqueta">El guion no debe pedir por quién va a votar la persona ni ofrecer nada a cambio del voto.</p>
      <SelectorSegmento segmento={segmento} alCambiar={setSegmento} />
      <p role="status"><strong>{conteo === null ? "…" : miles(conteo)}</strong> {conteo === 1 ? "persona" : "personas"} con autorización vigente para contacto, sin baja y con celular.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div><button className="btn btn-primario" disabled={guardando || !nombre.trim() || !conteo} onClick={crear}>Crear la cola</button></div>
    </section>
  );
}

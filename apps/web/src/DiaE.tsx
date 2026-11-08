// Centro de mando del día E (fase 5): mesas con semáforo y su motivo, novedades con prioridad, responsable y
// escalamiento, E-14 por revisar (regla 7) y modo simulacro. Todo agregado por mesa: aquí no se ven personas.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ADVERTENCIA_CUMPLIMIENTO, alertasActa, estadoMesa, miles, ordenarNovedades, pct, resumenDiaE, type ActaLeida, type Semaforo,
} from "@ventaja/nucleo";
import { useTablero } from "./datos/contexto";
import { fuente } from "./datos/index";
import type { ActaParaRevisar, CumplimientoE14, Miembro, MesaTablero, NovedadTablero, Simulacro } from "./datos/tipos";

const horaCorta = (d: Date) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" }).format(d);
const claveMesa = (m: { puestoId: string; mesa: number }) => `${m.puestoId}-${m.mesa}`;
const NOMBRE_SEMAFORO: Record<Semaforo, string> = { verde: "Sin pendientes", ambar: "Atención", rojo: "Actuar ya" };

export function DiaE() {
  const { sesion } = useTablero();
  const maneja = ["administrador", "gerente", "coordinador"].includes(sesion.rol);
  const direccion = sesion.rol === "administrador" || sesion.rol === "gerente";

  const [simulacro, setSimulacro] = useState<Simulacro | null>(null);
  const [mesas, setMesas] = useState<MesaTablero[] | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [, setPulso] = useState(0);
  const [elegida, setElegida] = useState<string | null>(null);
  const [acta, setActa] = useState<string | null>(null);
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [equipo, setEquipo] = useState<Miembro[]>([]);

  const cargar = useCallback(async () => {
    try {
      const sim = await fuente.simulacroActivo(sesion);
      setSimulacro(sim);
      setMesas(await fuente.tableroDiaE(sesion, !!sim));
      setError("");
    } catch (e) { setError((e as Error).message); }
  }, [sesion]);

  // Tiempo real, con una lectura de respaldo cada 30 segundos por si se cae la conexión.
  useEffect(() => {
    void cargar();
    let espera: ReturnType<typeof setTimeout> | null = null;
    const quitar = fuente.suscribirDiaE(sesion, () => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => void cargar(), 300); // varios cambios seguidos, una sola lectura
    });
    const respaldo = setInterval(() => void cargar(), 30_000);
    return () => { quitar(); clearInterval(respaldo); if (espera) clearTimeout(espera); };
  }, [cargar, sesion]);

  // El semáforo depende de la hora: se repinta solo. Quien maneja el día E escala lo vencido cada minuto.
  useEffect(() => {
    const t = setInterval(() => setPulso((x) => x + 1), simulacro && fuente.modo === "demo" ? 1000 : 15_000);
    return () => clearInterval(t);
  }, [simulacro]);
  useEffect(() => {
    if (!maneja) return;
    const escalar = () => fuente.escalarNovedades(sesion).catch(() => { /* lo intenta en el siguiente minuto */ });
    void escalar();
    const t = setInterval(escalar, 60_000);
    return () => clearInterval(t);
  }, [maneja, sesion]);
  useEffect(() => {
    if (direccion) fuente.equipo(sesion).then((e) => setEquipo(e.miembros)).catch(() => setEquipo([]));
  }, [direccion, sesion]);

  const { ahora, jornada } = fuente.relojDiaE(sesion, simulacro);
  const estados = useMemo(() => new Map((mesas ?? []).map((m) => [claveMesa(m), estadoMesa(m, ahora, jornada)])),
    [mesas, ahora, jornada]);
  const resumen = mesas && resumenDiaE(mesas, ahora, jornada);
  const puestos = useMemo(() => {
    const porPuesto = new Map<string, { id: string; nombre: string; mesas: MesaTablero[] }>();
    for (const m of mesas ?? []) {
      const p = porPuesto.get(m.puestoId) ?? { id: m.puestoId, nombre: m.puesto, mesas: [] };
      p.mesas.push(m); porPuesto.set(m.puestoId, p);
    }
    return [...porPuesto.values()];
  }, [mesas]);
  const novedades = useMemo(() => ordenarNovedades((mesas ?? []).flatMap((m) =>
    m.novedades.map((n) => ({ ...n, puesto: m.puesto, mesa: m.mesa })))), [mesas]);
  const actasPorRevisar = (mesas ?? []).filter((m) => m.actaId && (m.acta === "recibida" || m.acta === "leida"))
    .sort((a, b) => b.alertasActa - a.alertasActa);
  const sinCubrir = (mesas ?? []).filter((m) => !m.testigo || m.testigo === "retirado")
    .sort((a, b) => b.votosHistoricos - a.votosHistoricos);
  const responsables = equipo.filter((m) => m.activa && ["administrador", "gerente", "coordinador"].includes(m.rol));
  const nombreDe = (id: string | null) => (id && equipo.find((m) => m.id === id)?.nombre) || null;
  const mesaElegida = mesas?.find((m) => claveMesa(m) === elegida) ?? null;

  async function hacer(accion: () => Promise<unknown>, exito?: string) {
    setError(""); setAviso("");
    try { await accion(); if (exito) setAviso(exito); await cargar(); } catch (e) { setError((e as Error).message); }
  }

  async function terminar() {
    if (!window.confirm("¿Terminar el simulacro? Se borra todo lo que se reportó en él.")) return;
    setError(""); setAviso("");
    try {
      const r = await fuente.terminarSimulacro(sesion);
      setAviso(`Simulacro terminado. Se borraron ${r.novedades} novedades y ${r.actas} actas de prueba; ${r.testigos} testigos volvieron a «confirmado».`);
      setElegida(null); setActa(null);
      await cargar();
    } catch (e) { setError((e as Error).message); }
  }

  if (!mesas) {
    return <div className="pagina">{error ? <p className="error" role="alert">{error}</p> : <p className="tenue">Cargando el día E…</p>}</div>;
  }

  if (acta) {
    return (
      <div className="pagina">
        <RevisarE14 id={acta} alCerrar={() => setActa(null)} alGuardar={async () => { setActa(null); setAviso("Acta revisada."); await cargar(); }} />
      </div>
    );
  }

  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>Día E</h1>
          <p className="tenue">Cobertura de mesas, novedades y E-14 en vivo. <strong>Consolidación privada de la campaña</strong>: no es un resultado oficial ni reemplaza el preconteo o el escrutinio.</p>
        </div>
        <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="chip" aria-label="Hora de la jornada"><span className="tenue">Hora</span><strong>{horaCorta(ahora)}</strong></span>
          {direccion && !simulacro && (
            <button className="btn btn-primario" onClick={() => hacer(() => fuente.iniciarSimulacro(sesion), "Simulacro iniciado. Lo que se reporte desde ahora es de prueba.")}>
              Iniciar simulacro
            </button>
          )}
          {direccion && simulacro && <button className="btn" onClick={terminar}>Terminar simulacro</button>}
        </div>
      </div>

      {simulacro && (
        <p className="aviso simulacro" role="status">
          <strong>Simulacro en curso.</strong> Empezó: {horaCorta(new Date(simulacro.iniciado))} Lo que se reporte es de prueba: no se mezcla con los datos reales y se borra al terminar.
          {fuente.modo === "supabase"
            ? ` La «jornada» dura ${60} minutos desde el inicio: después corre la espera del E-14.`
            : " En la demostración la jornada avanza cuatro minutos por cada segundo."}
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {aviso && <p className="aviso" role="status">{aviso}</p>}

      {resumen && (
        <div className="rejilla" style={{ marginBottom: 16 }}>
          <Cifra etiqueta="Mesas con testigo" dato={resumen.mesas ? pct(resumen.conTestigo / resumen.mesas) : "—"} nota={`${miles(resumen.conTestigo)} de ${miles(resumen.mesas)}; ${miles(resumen.testigosEnMesa)} ya en la mesa`} />
          <Cifra etiqueta="E-14 recibidos" dato={miles(resumen.actasRecibidas)} nota={`${miles(resumen.actasRevisadas)} ${resumen.actasRevisadas === 1 ? "revisado" : "revisados"} por una persona`} />
          <Cifra etiqueta="Novedades pendientes" dato={miles(resumen.novedadesPendientes)} nota={resumen.novedadesPorEscalar ? `${resumen.novedadesPorEscalar} por escalar` : "Ninguna vencida"} />
          <div className="tarjeta">
            <div className="etiqueta">Semáforo</div>
            <div className="fila" style={{ gap: 12, marginTop: 6 }}>
              {(["rojo", "ambar", "verde"] as const).map((c) => (
                <span key={c} className={`sello ${c}`} title={NOMBRE_SEMAFORO[c]}>{miles(resumen.semaforo[c])} {NOMBRE_SEMAFORO[c].toLowerCase()}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="escenario" style={{ gridTemplateColumns: "minmax(0,1fr) 360px" }}>
        <div className="pila">
          {!puestos.length && <div className="tarjeta"><p className="tenue">No hay puestos de votación cargados en su territorio. Se cargan con el script de datos abiertos (ver docs/DESARROLLO.md).</p></div>}
          {puestos.length > 0 && (
            <label className="fila" style={{ gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
              Ver solo las mesas que piden atención
            </label>
          )}
          {puestos.map((p) => {
            const visibles = soloPendientes ? p.mesas.filter((m) => estados.get(claveMesa(m))?.semaforo !== "verde") : p.mesas;
            if (!visibles.length) return null;
            const conTestigo = p.mesas.filter((m) => m.testigo && m.testigo !== "retirado").length;
            return (
              <section key={p.id} className="tarjeta pila" aria-label={p.nombre}>
                <div className="fila entre">
                  <h3>{p.nombre}</h3>
                  <span className="tenue">{p.mesas.length} mesas, {pct(conTestigo / p.mesas.length)} con testigo</span>
                </div>
                <div className="cuadricula-mesas">
                  {visibles.map((m) => {
                    const e = estados.get(claveMesa(m))!;
                    return (
                      <button key={claveMesa(m)} className={`mesa ${e.semaforo}${m.acta && m.acta !== "descartada" ? " con-acta" : ""}`}
                        aria-pressed={elegida === claveMesa(m)} title={`Mesa ${m.mesa}: ${e.motivo}`}
                        aria-label={`Mesa ${m.mesa}, ${p.nombre}: ${e.motivo}`} onClick={() => setElegida(claveMesa(m))}>
                        {m.mesa}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          <div className="leyenda">
            <span><i className="punto" style={{ background: "var(--rojo)" }} />Actuar ya</span>
            <span><i className="punto" style={{ background: "var(--ambar)" }} />Atención</span>
            <span><i className="punto" style={{ background: "var(--verde)" }} />Sin pendientes</span>
            <span><i className="punto" style={{ background: "var(--acento)" }} />Con E-14</span>
          </div>
        </div>

        <aside className="pila">
          {mesaElegida && (
            <DetalleMesa mesa={mesaElegida} motivo={estados.get(claveMesa(mesaElegida))!.motivo} semaforo={estados.get(claveMesa(mesaElegida))!.semaforo}
              puedeRevisar={maneja} alRevisar={() => setActa(mesaElegida.actaId)} alCerrar={() => setElegida(null)} />
          )}

          <section className="tarjeta pila" aria-label="Novedades">
            <h2>Novedades</h2>
            {novedades.map((n) => (
              <Novedad key={n.id} n={n} ahora={ahora} maneja={maneja} responsables={responsables} responsable={nombreDe(n.responsableId)}
                alCambiar={(estado, resp) => hacer(() => fuente.atenderNovedad(sesion, n.id, estado, resp))} />
            ))}
            {!novedades.length && <p className="tenue">Sin novedades pendientes.</p>}
          </section>

          <section className="tarjeta pila" aria-label="E-14 por revisar">
            <h2>E-14 por revisar</h2>
            <p className="tenue" style={{ fontSize: 13 }}>Ningún acta se suma sin que una persona compare los números con la foto.</p>
            {actasPorRevisar.slice(0, 8).map((m) => (
              <div key={m.actaId} className="fila entre">
                <span>{m.puesto}, mesa {m.mesa}</span>
                <span className="fila" style={{ gap: 6 }}>
                  {m.alertasActa > 0 && <span className="sello ambar">{m.alertasActa} {m.alertasActa === 1 ? "alerta" : "alertas"}</span>}
                  {maneja && <button className="btn btn-chico" onClick={() => setActa(m.actaId)}>Revisar</button>}
                </span>
              </div>
            ))}
            {actasPorRevisar.length > 8 && <p className="etiqueta">Y {actasPorRevisar.length - 8} más.</p>}
            {!actasPorRevisar.length && <p className="tenue">No hay actas pendientes.</p>}
          </section>

          {ahora < jornada.cierre && sinCubrir.length > 0 && (
            <section className="tarjeta pila" aria-label="Cubrir primero">
              <h2>Cubrir primero</h2>
              <p className="tenue" style={{ fontSize: 13 }}>Mesas sin testigo donde hay más votos en juego según la elección anterior.</p>
              {sinCubrir.slice(0, 6).map((m) => (
                <div key={claveMesa(m)} className="fila entre">
                  <span>{m.puesto}, mesa {m.mesa}</span>
                  <span className="tenue">{miles(m.votosHistoricos)} votos</span>
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>
      {!simulacro && <CumplimientoLideres direccion={direccion} />}
    </div>
  );
}

// ---------- Cumplimiento de los líderes contra el E-14 (agregado) ----------

const signo = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x * 100)} %`;

function CumplimientoLideres({ direccion }: { direccion: boolean }) {
  const { sesion } = useTablero();
  const [datos, setDatos] = useState<CumplimientoE14 | null>(null);
  const [error, setError] = useState("");
  const [opcion, setOpcion] = useState("");
  const [historica, setHistorica] = useState("");
  const [guardado, setGuardado] = useState("");

  const cargar = useCallback(() => {
    fuente.cumplimientoE14(sesion).then((d) => {
      setDatos(d); setOpcion(d.opcionE14 ?? ""); setHistorica(d.opcionHistorica ?? ""); setError("");
    }).catch((e: Error) => setError(e.message));
  }, [sesion]);
  useEffect(cargar, [cargar]);

  async function guardar() {
    setError(""); setGuardado("");
    try { await fuente.configurarOpcionesE14(sesion, opcion, historica); setGuardado("Guardado."); cargar(); }
    catch (e) { setError((e as Error).message); }
  }

  const filas = [...(datos?.lideres ?? [])].sort((a, b) =>
    Number(b.resultado.suficiente) - Number(a.resultado.suficiente) ||
    (b.resultado.suficiente && a.resultado.suficiente ? b.resultado.cobertura - a.resultado.cobertura : 0) ||
    a.nombre.localeCompare(b.nombre, "es"));
  const sinDatos = filas.filter((f) => !f.resultado.suficiente).length;

  return (
    <section className="tarjeta pila" aria-label="Cumplimiento de los líderes contra el E-14" style={{ marginTop: 24 }}>
      <h2>Cumplimiento de los líderes contra el E-14</h2>
      <p className="tenue">Compara los apoyos que cada líder registró en sus mesas con los votos de la candidata en los E-14 revisados de esas mesas. {ADVERTENCIA_CUMPLIMIENTO}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {direccion && (
        <div className="fila" style={{ gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <label className="campo" style={{ flex: "1 1 220px" }}>Cómo aparece la candidata en el E-14
            <input value={opcion} onChange={(e) => setOpcion(e.target.value)} placeholder="Tal como está impreso en el acta" />
          </label>
          <label className="campo" style={{ flex: "1 1 220px" }}>En los resultados de la elección anterior (opcional)
            <input value={historica} onChange={(e) => setHistorica(e.target.value)} placeholder="Candidato o partido" />
          </label>
          <button className="btn" onClick={guardar}>Guardar</button>
          {guardado && <span className="tenue" role="status">{guardado}</span>}
        </div>
      )}
      {datos && !datos.opcionE14 && (
        <p className="aviso">{direccion ? "Escriba cómo aparece la candidata en el E-14 para calcularlo." : "La dirección todavía no configuró cómo aparece la candidata en el E-14."}</p>
      )}
      {datos?.opcionE14 && (
        <>
          <div className="tabla-envoltura">
            <table aria-label="Cumplimiento por líder">
              <thead><tr>
                <th>Líder</th><th className="num">Mesas con E-14 revisado</th><th className="num">Apoyos</th>
                <th className="num">Votos</th><th className="num">Votos frente a apoyos</th><th className="num">Frente a la elección anterior</th>
              </tr></thead>
              <tbody>
                {filas.map(({ liderId, nombre, resultado: r }) => (
                  <tr key={liderId}>
                    <td>{nombre}</td>
                    <td className="num">{miles(r.mesas)}</td>
                    <td className="num">{miles(r.apoyos)}</td>
                    {r.suficiente ? (
                      <>
                        <td className="num">{miles(r.votos)}</td>
                        <td className="num">{pct(r.cobertura)}</td>
                        <td className="num">{r.crecimiento === null ? "—" : signo(r.crecimiento)}</td>
                      </>
                    ) : (
                      <td className="num tenue" colSpan={3} title={r.motivo}>Sin datos suficientes</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sinDatos > 0 && <p className="etiqueta">«Sin datos suficientes»: hacen falta al menos 3 mesas con E-14 revisado y 10 apoyos para comparar sin exponer a nadie.</p>}
          <p className="etiqueta">«Frente a la elección anterior» no prueba que el cambio se deba al líder.</p>
        </>
      )}
    </section>
  );
}

function Cifra({ etiqueta, dato, nota }: { etiqueta: string; dato: string; nota: string }) {
  return <div className="tarjeta"><div className="etiqueta">{etiqueta}</div><div className="dato">{dato}</div><p className="tenue">{nota}</p></div>;
}

const NOMBRE_TESTIGO = { asignado: "Asignado", confirmado: "Confirmado, sin llegar", en_mesa: "En la mesa", retirado: "Se retiró" } as const;
const NOMBRE_ACTA = { recibida: "Recibido", leida: "Leído, por revisar", revisada: "Revisado", consolidada: "Consolidado", descartada: "Foto descartada" } as const;

function DetalleMesa({ mesa, motivo, semaforo, puedeRevisar, alRevisar, alCerrar }: {
  mesa: MesaTablero; motivo: string; semaforo: Semaforo; puedeRevisar: boolean; alRevisar: () => void; alCerrar: () => void;
}) {
  const porRevisar = mesa.acta === "recibida" || mesa.acta === "leida";
  return (
    <section className="tarjeta pila" aria-label={`Mesa ${mesa.mesa}`}>
      <div className="fila entre">
        <h2>Mesa {mesa.mesa}</h2>
        <button className="btn btn-chico" onClick={alCerrar} aria-label="Cerrar el detalle de la mesa">Cerrar</button>
      </div>
      <span className="etiqueta">{mesa.puesto}</span>
      <p><span className={`sello ${semaforo}`}>{motivo}</span></p>
      <div className="fila entre"><span className="tenue">Testigo</span><span>{mesa.testigo ? NOMBRE_TESTIGO[mesa.testigo] : "Sin asignar"}{mesa.llegadaEn ? `, llegó ${horaCorta(mesa.llegadaEn)}` : ""}</span></div>
      <div className="fila entre"><span className="tenue">E-14</span><span>{mesa.acta ? NOMBRE_ACTA[mesa.acta] : "Sin recibir"}</span></div>
      <div className="fila entre"><span className="tenue">Novedades</span><span>{mesa.novedades.length}</span></div>
      {porRevisar && puedeRevisar && <button className="btn btn-primario" onClick={alRevisar}>Revisar el E-14</button>}
    </section>
  );
}

function Novedad({ n, ahora, maneja, responsables, responsable, alCambiar }: {
  n: NovedadTablero & { puesto: string; mesa: number }; ahora: Date; maneja: boolean; responsables: Miembro[]; responsable: string | null;
  alCambiar: (estado: "abierta" | "atendida" | "cerrada" | null, responsable?: string) => void;
}) {
  const minutos = Math.max(0, Math.round((ahora.getTime() - n.hora.getTime()) / 60_000));
  return (
    <div className={`fila-ocr${n.estado === "escalada" ? " dup" : n.prioridad === "alta" ? " duda" : ""}`}>
      <div className="fila entre">
        <strong>{n.puesto}, mesa {n.mesa}</strong>
        <span className="fila" style={{ gap: 4 }}>
          {n.estado === "escalada" && <span className="sello rojo">escalada</span>}
          <span className={`sello ${n.prioridad === "alta" ? "rojo" : n.prioridad === "media" ? "ambar" : ""}`}>{n.prioridad}</span>
        </span>
      </div>
      <span>{n.tipo}</span>
      <span className="etiqueta">{horaCorta(n.hora)} · hace {minutos} min{responsable ? ` · responsable: ${responsable}` : ""}</span>
      {maneja && (
        <div className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
          <button className="btn btn-chico" onClick={() => alCambiar("atendida")}>Marcar atendida</button>
          <button className="btn btn-chico" onClick={() => alCambiar("cerrada")}>Cerrar</button>
          {responsables.length > 0 && (
            <select className="btn btn-chico" aria-label="Asignar responsable" value=""
              onChange={(e) => e.target.value && alCambiar(null, e.target.value)}>
              <option value="">Asignar responsable…</option>
              {responsables.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Revisión del E-14 (regla 7) ----------

const VACIA: ActaLeida = { mesa: null, votos: [{ opcion: "", votos: null }], blancos: null, nulos: null, noMarcados: null, totalVotos: null, sufragantes: null, confianza: 1 };
const numero = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.floor(Number(v.replace(/\D/g, "")))));

function RevisarE14({ id, alCerrar, alGuardar }: { id: string; alCerrar: () => void; alGuardar: () => void }) {
  const { sesion } = useTablero();
  const [datos, setDatos] = useState<ActaParaRevisar | null>(null);
  const [acta, setActa] = useState<ActaLeida>(VACIA);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [leyendo, setLeyendo] = useState(false);
  const cargar = useCallback(() => {
    fuente.actaE14(sesion, id).then((d) => {
      setDatos(d);
      setActa(d.lectura ? { ...d.lectura, confianza: 1 } : { ...VACIA, mesa: d.mesa });
    }).catch((e: Error) => setError(e.message));
  }, [id, sesion]);
  useEffect(cargar, [cargar]);

  async function leer() {
    setLeyendo(true); setError("");
    try { await fuente.leerE14(sesion, id); cargar(); } catch (e) { setError((e as Error).message); } finally { setLeyendo(false); }
  }

  // Las alertas se recalculan con lo que la persona corrige; la confianza de la IA ya no aplica.
  const alertas = alertasActa({ ...acta, confianza: 1 });
  const completa = acta.votos.length > 0 && acta.votos.every((v) => v.opcion.trim() && v.votos !== null);
  const campo = (k: "blancos" | "nulos" | "noMarcados" | "totalVotos" | "sufragantes", nombre: string) => (
    <label className="campo">{nombre}
      <input inputMode="numeric" value={acta[k] ?? ""} onChange={(e) => setActa({ ...acta, [k]: numero(e.target.value) })} />
    </label>
  );

  async function guardar(descartar: boolean) {
    if (descartar && !window.confirm("¿Descartar esta foto? El acta queda descartada y el testigo debe enviar otra.")) return;
    setGuardando(true); setError("");
    try {
      await fuente.revisarE14(sesion, id, descartar ? null : { ...acta, votos: acta.votos.map((v) => ({ ...v, opcion: v.opcion.trim() })) });
      alGuardar();
    } catch (e) { setError((e as Error).message); } finally { setGuardando(false); }
  }

  return (
    <div className="pila">
      <div className="pagina-cabeza">
        <div>
          <h1>Revisar E-14{datos ? `: ${datos.puesto}, mesa ${datos.mesa}` : ""}</h1>
          <p className="tenue">Compare cada número con la foto. Las alertas señalan descuadres para revisar: pueden ser errores de lectura, de escritura o enmiendas, y no prueban nada por sí solas.</p>
        </div>
        <button className="btn" onClick={alCerrar}>Volver al tablero</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {datos?.subidaPorMi && <p className="aviso">Usted subió esta acta: la debe revisar otra persona del centro de mando.</p>}
      {datos && (
        <div className="escenario" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          <div className="tarjeta">
            {datos.foto
              ? <img src={datos.foto} alt={`Foto del E-14 de la mesa ${datos.mesa}`} style={{ width: "100%", borderRadius: 8 }} />
              : <p className="tenue">{fuente.modo === "demo" ? "En la demostración no hay foto: los números son de una lectura ficticia." : "No hay foto para mostrar."}</p>}
          </div>
          <div className="tarjeta pila">
            {!datos.lectura && (
              <div className="aviso pila" style={{ gap: 8 }}>
                <span>Esta foto no se ha leído. Puede leerla con IA o digitar los números tal como aparecen en el acta. En los dos casos, usted compara cada número con la foto antes de confirmar.</span>
                {datos.estado === "recibida" && datos.foto && (
                  <button className="btn btn-chico" style={{ justifySelf: "start" }} disabled={leyendo} onClick={leer}>
                    {leyendo ? "Leyendo la foto…" : "Leer con IA"}
                  </button>
                )}
              </div>
            )}
            {datos.lectura && datos.lectura.confianza < 1 && (
              <p className="aviso">Números leídos con IA (confianza {Math.round(datos.lectura.confianza * 100)} %). Compárelos uno por uno con la foto.</p>
            )}
            <table className="revision-tabla">
              <thead><tr><th>Candidato, lista o partido</th><th>Votos</th><th /></tr></thead>
              <tbody>
                {acta.votos.map((v, i) => (
                  <tr key={i}>
                    <td><input type="text" aria-label={`Opción ${i + 1}`} value={v.opcion}
                      onChange={(e) => setActa({ ...acta, votos: acta.votos.map((x, j) => (j === i ? { ...x, opcion: e.target.value } : x)) })} /></td>
                    <td><input type="text" inputMode="numeric" aria-label={`Votos de la opción ${i + 1}`} value={v.votos ?? ""}
                      className={v.votos === null ? "duda" : ""}
                      onChange={(e) => setActa({ ...acta, votos: acta.votos.map((x, j) => (j === i ? { ...x, votos: numero(e.target.value) } : x)) })} /></td>
                    <td>{acta.votos.length > 1 && (
                      <button className="btn btn-chico" aria-label={`Quitar la opción ${i + 1}`}
                        onClick={() => setActa({ ...acta, votos: acta.votos.filter((_, j) => j !== i) })}>Quitar</button>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn btn-chico" style={{ justifySelf: "start" }}
              onClick={() => setActa({ ...acta, votos: [...acta.votos, { opcion: "", votos: null }] })}>Agregar opción</button>
            <div className="rejilla" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
              {campo("blancos", "En blanco")}{campo("nulos", "Nulos")}{campo("noMarcados", "No marcados")}
              {campo("totalVotos", "Total de votos")}{campo("sufragantes", "Sufragantes")}
            </div>
            {alertas.length > 0
              ? <ul className="pila alertas-acta" aria-label="Alertas del acta">{alertas.map((a) => <li key={a} className="sello ambar" style={{ whiteSpace: "normal" }}>{a}</li>)}</ul>
              : <p className="sello verde">Las sumas cuadran.</p>}
            <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primario" disabled={guardando || !completa || datos.subidaPorMi} onClick={() => guardar(false)}>
                {alertas.length ? "Confirmar con alertas" : "Confirmar revisión"}
              </button>
              <button className="btn" disabled={guardando || datos.subidaPorMi} onClick={() => guardar(true)}>Descartar la foto</button>
            </div>
            {!completa && <p className="etiqueta">Escriba el nombre y los votos de cada opción para confirmar.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Barra, diasParaEleccion } from "./comunes";
import { campana, incidenciasBase, lideres, puestos, recomendaciones, todasLasMesas, totales, zonaDe, type Incidencia } from "./data";
import { Escaner } from "./Escaner";
import { miles, pct, porcentajeCobertura, prioridadCobertura, textoAccion } from "./logic";
import type { Tarea } from "./Strategos";

/* ---------- Planillas (gerente / coordinador) ---------- */
export function Planillas() {
  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>Planillas a la base</h1>
          <p className="tenue">De la caja de planillas escritas a mano a registros revisados, sin digitar. El líder escanea desde su celular; la coordinación valida.</p>
        </div>
      </div>
      <div className="escenario">
        <div className="pila">
          <div className="rejilla">
            <div className="tarjeta"><div className="etiqueta">Planillas recibidas esta semana</div><div className="dato">138</div></div>
            <div className="tarjeta"><div className="etiqueta">Filas leídas</div><div className="dato">1.204</div></div>
            <div className="tarjeta"><div className="etiqueta">Esperando revisión</div><div className="dato">212</div></div>
          </div>
          <div className="tarjeta pila">
            <h2>Cómo funciona</h2>
            <ol className="pila" style={{ margin: 0, paddingLeft: 18 }}>
              <li>La campaña imprime la planilla de cada líder. Trae un código que dice de quién es, de qué zona y el texto de autorización de datos que firma cada persona.</li>
              <li>El líder toma la foto. Si no hay señal, queda guardada en el teléfono.</li>
              <li>La lectura marca en ámbar lo que no se leyó con seguridad y en rojo las cédulas repetidas.</li>
              <li>El líder corrige y envía. Los registros entran como «pendientes de validar» con la foto como soporte.</li>
            </ol>
            <button className="btn" style={{ justifySelf: "start" }}>Descargar planilla en blanco</button>
          </div>
          <p className="aviso">La firma de autorización en la planilla es la prueba del consentimiento (Ley 1581). Sin esa columna, la fila se guarda como «sin autorización» y no se usa para contacto.</p>
        </div>
        <Telefono titulo="Ventaja Mando"><Escaner /></Telefono>
      </div>
    </div>
  );
}

/* ---------- Teléfono ---------- */
export function Telefono({ titulo, children, nav }: { titulo: string; children: ReactNode; nav?: ReactNode }) {
  return (
    <div className="telefono" aria-label="Vista en el celular">
      <div className="tel-top"><span>9:41</span><span>{titulo}</span><span>4G</span></div>
      <div className="tel-cuerpo">{children}</div>
      {nav && <div className="tel-nav">{nav}</div>}
    </div>
  );
}

/* ---------- Bandeja del líder (celular) ---------- */
export function BandejaLider() {
  const yo = lideres[0];
  const [tab, setTab] = useState<"hoy" | "planilla" | "metas">("hoy");
  const [hechas, setHechas] = useState<string[]>([]);
  const tareas = [
    { id: "a", t: "Visitar a 8 simpatizantes sin validar", d: `${zonaDe(yo.zonaId).nombre}, antes de las 6 p. m.` },
    { id: "b", t: "Invitar a la reunión del jueves", d: "12 contactos con autorización" },
    { id: "c", t: "Escanear la planilla del sábado", d: "Lote 14" },
  ];
  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>Así lo ve un líder</h1>
          <p className="tenue">Tres botones y nada más: lo que tengo que hacer hoy, escanear planillas y cómo voy. Funciona sin señal.</p>
        </div>
      </div>
      <div className="escenario" style={{ gridTemplateColumns: "360px minmax(0,1fr)" }}>
        <Telefono titulo={yo.nombre.split(" ")[0]} nav={
          <>
            <button aria-current={tab === "hoy" ? "page" : undefined} onClick={() => setTab("hoy")}>Hoy</button>
            <button aria-current={tab === "planilla" ? "page" : undefined} onClick={() => setTab("planilla")}>Planilla</button>
            <button aria-current={tab === "metas" ? "page" : undefined} onClick={() => setTab("metas")}>Mi meta</button>
          </>
        }>
          {tab === "hoy" && (
            <>
              <h2>Hola, {yo.nombre.split(" ")[0]}</h2>
              <p className="tenue" style={{ fontSize: 13 }}>{tareas.length - hechas.length} tareas para hoy</p>
              {tareas.map((t) => (
                <button key={t.id} className="fila-ocr" style={{ textAlign: "left", opacity: hechas.includes(t.id) ? 0.5 : 1 }}
                  onClick={() => setHechas(hechas.includes(t.id) ? hechas.filter((x) => x !== t.id) : [...hechas, t.id])}>
                  <strong>{hechas.includes(t.id) ? "Hecha: " : ""}{t.t}</strong>
                  <span className="tenue">{t.d}</span>
                </button>
              ))}
              <p className="etiqueta">Sin conexión: 3 registros esperan para enviarse.</p>
            </>
          )}
          {tab === "planilla" && <Escaner />}
          {tab === "metas" && (
            <>
              <h2>Mi meta</h2>
              <div className="dato">{miles(yo.validados)}<span className="tenue" style={{ fontSize: 16 }}> / {miles(yo.meta)}</span></div>
              <Barra valor={yo.validados / yo.meta} />
              <p className="tenue" style={{ fontSize: 13 }}>Solo cuentan los validados. Tienes {miles(yo.registrados - yo.validados)} registros esperando validación.</p>
            </>
          )}
        </Telefono>
        <div className="pila">
          <div className="tarjeta pila">
            <h2>Por qué así</h2>
            <p className="tenue">Las plataformas del mercado le muestran al líder el mismo menú de 20 opciones que al gerente. Aquí cada rol entra a su propio espacio.</p>
            <p className="tenue">El botón de WhatsApp abre el chat en el teléfono del líder con el mensaje listo, y lo envía él. No hay bots ni envíos automáticos que puedan bloquear el número de la campaña.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Día E ---------- */
export function DiaE() {
  const [simulacro, setSimulacro] = useState(false);
  const [e14, setE14] = useState<Set<string>>(new Set());
  const [novedades, setNovedades] = useState<Incidencia[]>(incidenciasBase);

  useEffect(() => {
    if (!simulacro) return;
    const t = setInterval(() => {
      setE14((prev) => {
        const libres = todasLasMesas.filter((m) => m.testigoId && !prev.has(`${m.puestoId}-${m.mesa}`));
        if (!libres.length) return prev;
        const n = new Set(prev);
        libres.slice(0, 3).forEach((m) => n.add(`${m.puestoId}-${m.mesa}`));
        return n;
      });
    }, 900);
    return () => clearInterval(t);
  }, [simulacro]);

  const conTestigo = todasLasMesas.filter((m) => m.testigoId).length;
  const sinCubrir = prioridadCobertura(todasLasMesas);
  const claveNov = useMemo(() => new Set(novedades.map((n) => `${n.puestoId}-${n.mesa}`)), [novedades]);

  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>Día E</h1>
          <p className="tenue">Cobertura de mesas, novedades y E-14 en vivo. Consolidación privada de la campaña: no reemplaza el preconteo ni el escrutinio.</p>
        </div>
        <button className={`btn ${simulacro ? "" : "btn-primario"}`} onClick={() => setSimulacro(!simulacro)}>
          {simulacro ? "Pausar simulacro" : "Iniciar simulacro de jornada"}
        </button>
      </div>

      <div className="rejilla" style={{ marginBottom: 16 }}>
        <div className="tarjeta"><div className="etiqueta">Mesas con testigo</div><div className="dato">{pct(conTestigo / todasLasMesas.length)}</div><p className="tenue">{conTestigo} de {todasLasMesas.length}</p></div>
        <div className="tarjeta"><div className="etiqueta">E-14 recibidos</div><div className="dato">{e14.size}</div><Barra valor={e14.size / conTestigo} /></div>
        <div className="tarjeta"><div className="etiqueta">Novedades abiertas</div><div className="dato">{novedades.length}</div><p className="tenue">{novedades.filter((n) => n.prioridad === "alta").length} de prioridad alta</p></div>
      </div>

      <div className="escenario" style={{ gridTemplateColumns: "minmax(0,1fr) 340px" }}>
        <div className="pila">
          {puestos.map((p) => (
            <section key={p.id} className="tarjeta pila" aria-label={p.nombre}>
              <div className="fila entre">
                <div><h3>{p.nombre}</h3><span className="etiqueta">{zonaDe(p.zonaId).nombre}, {p.mesas.length} mesas</span></div>
                <span className="tenue">{pct(porcentajeCobertura(p.mesas))} cubierto</span>
              </div>
              <div className="cuadricula-mesas">
                {p.mesas.map((m) => {
                  const k = `${m.puestoId}-${m.mesa}`;
                  const cls = !m.testigoId ? "sin" : claveNov.has(k) ? "nov" : e14.has(k) ? "e14" : "con";
                  return <span key={k} className={`mesa ${cls}`} title={`Mesa ${m.mesa}`}>{m.mesa}</span>;
                })}
              </div>
            </section>
          ))}
          <div className="leyenda">
            <span><i className="punto" style={{ background: "var(--rojo)" }} />Sin testigo</span>
            <span><i className="punto" style={{ background: "var(--verde)" }} />Con testigo</span>
            <span><i className="punto" style={{ background: "var(--acento)" }} />E-14 recibido</span>
            <span><i className="punto" style={{ background: "var(--ambar)" }} />Con novedad</span>
          </div>
        </div>
        <aside className="pila">
          <div className="tarjeta pila">
            <h2>Novedades</h2>
            {novedades.map((n) => (
              <div key={n.id} className="fila-ocr">
                <div className="fila entre"><strong>{puestos.find((p) => p.id === n.puestoId)!.nombre}, mesa {n.mesa}</strong><span className={`sello ${n.prioridad === "alta" ? "rojo" : "ambar"}`}>{n.prioridad}</span></div>
                <span>{n.tipo}</span>
                <div className="fila entre"><span className="etiqueta">{n.hora}</span>
                  <button className="btn btn-chico" onClick={() => setNovedades(novedades.filter((x) => x.id !== n.id))}>Marcar atendida</button></div>
              </div>
            ))}
            {!novedades.length && <p className="tenue">Sin novedades abiertas.</p>}
          </div>
          <div className="tarjeta pila">
            <h2>Cubrir primero</h2>
            <p className="tenue" style={{ fontSize: 13 }}>Mesas sin testigo donde hay más votos en juego según 2023.</p>
            {sinCubrir.slice(0, 6).map((m) => (
              <div key={`${m.puestoId}-${m.mesa}`} className="fila entre">
                <span>{puestos.find((p) => p.id === m.puestoId)!.nombre}, mesa {m.mesa}</span>
                <span className="tenue">{m.votosHistoricos} votos</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ---------- Testigo (celular) ---------- */
export function MiMesa() {
  const [foto, setFoto] = useState(false);
  const [novedad, setNovedad] = useState(false);
  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>Así lo ve un testigo</h1>
          <p className="tenue">Su mesa, la foto del E-14 y un botón para reportar novedades. Nada más.</p>
        </div>
      </div>
      <div className="escenario" style={{ gridTemplateColumns: "360px minmax(0,1fr)" }}>
        <Telefono titulo="Día E">
          <h2>Mesa 7</h2>
          <p className="tenue" style={{ fontSize: 13 }}>{puestos[0].nombre}. Apertura confirmada a las 7:58 a. m.</p>
          <button className="btn btn-primario" onClick={() => setFoto(true)} disabled={foto}>{foto ? "E-14 enviado a las 4:21 p. m." : "Tomar foto del E-14"}</button>
          {foto && <p className="aviso">La lectura de los votos la revisa una persona del centro de mando antes de sumarla. La foto queda como evidencia de la mesa.</p>}
          <button className="btn" onClick={() => setNovedad(true)} disabled={novedad}>{novedad ? "Novedad enviada al abogado de zona" : "Reportar una novedad"}</button>
          <p className="etiqueta">Sin señal: el reporte se guarda y se envía al recuperar conexión.</p>
        </Telefono>
        <div className="tarjeta pila">
          <h2>Complementa a Comitium</h2>
          <p className="tenue">La app del CNE sirve para la acreditación y el reporte oficial del testigo. Esta vista es la coordinación interna de la campaña: quién está en qué mesa, qué novedades hay y qué falta.</p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Datos y cumplimiento ---------- */
export function Datos() {
  const autorizados = Math.round(totales.validados * 0.94);
  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>Datos y cumplimiento</h1>
          <p className="tenue">Lo que la campaña tiene que poder demostrar si alguien pregunta: de dónde salió cada dato, quién lo autorizó y quién lo ha usado.</p>
        </div>
      </div>
      <div className="rejilla" style={{ marginBottom: 16 }}>
        <div className="tarjeta"><div className="etiqueta">Con autorización vigente</div><div className="dato">{pct(autorizados / totales.validados)}</div><p className="tenue">{miles(autorizados)} personas</p></div>
        <div className="tarjeta"><div className="etiqueta">Solicitudes de titulares abiertas</div><div className="dato">3</div><p className="tenue">La más antigua vence en 6 días hábiles</p></div>
        <div className="tarjeta"><div className="etiqueta">Exportaciones este mes</div><div className="dato">2</div><p className="tenue">Ambas con marca de agua y registro</p></div>
      </div>
      <div className="rejilla" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <div className="tarjeta pila">
          <h2>Opinión política</h2>
          <p className="tenue">Es un dato sensible. Esta campaña lo tiene <strong style={{ color: "var(--texto)" }}>apagado</strong>: la intención se mide en agregado por mesa y por zona, nunca por persona.</p>
          <span className="sello verde" style={{ justifySelf: "start" }}>Sin clasificación individual</span>
        </div>
        <div className="tarjeta pila">
          <h2>WhatsApp</h2>
          <p className="tenue">Solo de persona a persona: el líder envía desde su teléfono. Ningún bot ni envío automático usa el número de la campaña.</p>
          <span className="sello verde" style={{ justifySelf: "start" }}>Dentro de las reglas de WhatsApp</span>
        </div>
        <div className="tarjeta pila">
          <h2>Solicitudes ciudadanas</h2>
          <p className="tenue">Se registran los temas que pide la comunidad, sin valor en pesos y sin relación con la intención de voto de la persona.</p>
          <span className="sello verde" style={{ justifySelf: "start" }}>Separadas de la base electoral</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Candidato ---------- */
export function Resumen({ aprobadas }: { aprobadas: Tarea[] }) {
  const meta = totales.comprometidos / campana.metaVotos;
  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>Buenos días, {campana.candidato.split(" ")[0]}</h1>
          <p className="tenue">{campana.cargo}. Faltan {diasParaEleccion()} días para la elección.</p>
        </div>
      </div>
      <div className="rejilla">
        <div className="tarjeta pila">
          <div className="etiqueta">Cómo vamos</div>
          <div className="dato">{pct(meta)}</div>
          <Barra valor={meta} color="var(--verde)" />
          <p className="tenue">{miles(totales.comprometidos)} comprometidos de una meta de {miles(campana.metaVotos)} votos.</p>
        </div>
        <div className="tarjeta pila">
          <div className="etiqueta">La base</div>
          <div className="dato">{miles(totales.validados)}</div>
          <p className="tenue">Validados de {miles(totales.bruto)} registrados. {pct(1 - totales.validados / totales.bruto)} todavía sin comprobar.</p>
        </div>
        <div className="tarjeta pila">
          <div className="etiqueta">La pauta</div>
          <div className="dato">{miles(Math.round(totales.alcance / 1000))} mil</div>
          <p className="tenue">Personas alcanzadas en 14 días, con $ {miles(totales.gasto)} invertidos.</p>
        </div>
      </div>
      <div className="tarjeta pila" style={{ marginTop: 16 }}>
        <h2>Dónde está la oportunidad</h2>
        {recomendaciones.filter((r) => r.accion !== "mantener").sort((a, b) => b.brecha - a.brecha).slice(0, 3).map((r) => (
          <div key={r.territorioId} className="fila entre">
            <span><strong>{zonaDe(r.territorioId).nombre}</strong> <span className="tenue">{textoAccion[r.accion].toLowerCase()}</span></span>
            <span className="tenue">{miles(zonaDe(r.territorioId).potencial)} votos en juego</span>
          </div>
        ))}
      </div>
      <div className="tarjeta pila" style={{ marginTop: 16 }}>
        <h2>Decisiones de hoy</h2>
        {aprobadas.length ? aprobadas.map((t) => (
          <div key={t.id} className="fila entre"><span>{t.titulo}</span><span className="sello verde">Aprobada</span></div>
        )) : <p className="tenue">Su gerente todavía no ha aprobado tareas hoy. Las que Strategos propone aparecen aquí cuando alguien las aprueba.</p>}
      </div>
    </div>
  );
}

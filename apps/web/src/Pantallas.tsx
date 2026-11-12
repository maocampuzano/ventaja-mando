import { useState, type ReactNode } from "react";
import { Barra, diasParaEleccion } from "./comunes";
// La bandeja del líder y la mesa del testigo son vistas previas de la app (fase 3): usan la semilla ficticia.
import { lideres as lideresSemilla, puestos as puestosSemilla, zonaDe as zonaSemilla } from "./data";
import { useTablero } from "./datos/contexto";
import { Escaner } from "./Escaner";
import { ImprimirPlanillas } from "./ImprimirPlanillas";
import { RevisarPlanillas } from "./RevisarPlanillas";
import { miles, pct, textoAccion } from "@ventaja/nucleo";
import type { Tarea } from "./Asesor";

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
          <RevisarPlanillas />
          <div className="tarjeta pila">
            <h2>Cómo funciona</h2>
            <ol className="pila" style={{ margin: 0, paddingLeft: 18 }}>
              <li>La campaña imprime la planilla de cada líder. Trae un código QR que dice de qué lote y qué hoja es (y así, de qué líder), y el texto de autorización de datos que firma cada persona.</li>
              <li>El líder toma la foto. Si no hay señal, queda guardada en el teléfono.</li>
              <li>La IA lee la foto y marca en ámbar lo que no se leyó con seguridad y en rojo lo repetido o lo que no se puede registrar.</li>
              <li>Una persona compara cada fila con la foto, corrige y aprueba la hoja. Solo entonces los registros entran, como «sin contactar», con la foto como soporte de su autorización.</li>
            </ol>
          </div>
          <ImprimirPlanillas />
          <p className="aviso">La firma de autorización en la planilla es la prueba del consentimiento (Ley 1581). Una fila sin firma no se registra.</p>
        </div>
        <Telefono titulo="Comando"><Escaner /></Telefono>
      </div>
    </div>
  );
}

/* ---------- Teléfono ---------- */
export function Telefono({ titulo, children, nav }: { titulo: string; children: ReactNode; nav?: ReactNode }) {
  return (
    <div className="telefono tema-sala" aria-label="Vista en el celular">
      <div className="tel-top"><span>9:41</span><span>{titulo}</span><span>4G</span></div>
      <div className="tel-cuerpo">{children}</div>
      {nav && <div className="tel-nav">{nav}</div>}
    </div>
  );
}

/* ---------- Bandeja del líder (celular) ---------- */
export function BandejaLider() {
  const yo = lideresSemilla[0];
  const [tab, setTab] = useState<"hoy" | "planilla" | "metas">("hoy");
  const [hechas, setHechas] = useState<string[]>([]);
  const tareas = [
    { id: "a", t: "Visitar a 8 simpatizantes sin validar", d: `${zonaSemilla(yo.zonaId).nombre}, antes de las 6 p. m.` },
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
          <p className="tenue" style={{ fontSize: 13 }}>{puestosSemilla[0].nombre}. Apertura confirmada a las 7:58 a. m.</p>
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

/* ---------- Candidato ---------- */
export function Resumen({ aprobadas }: { aprobadas: Tarea[] }) {
  const { campana, totales, recomendaciones, zonaDe } = useTablero();
  const meta = totales.comprometidos / campana.metaVotos;
  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>Buenos días, {campana.candidato.split(" ")[0]}</h1>
          <p className="tenue">{campana.cargo}. Faltan {diasParaEleccion(campana.eleccion)} días para la elección.</p>
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
        )) : <p className="tenue">Su gerente todavía no ha aprobado tareas hoy. Las que propone el Asesor IA aparecen aquí cuando alguien las aprueba.</p>}
      </div>
    </div>
  );
}

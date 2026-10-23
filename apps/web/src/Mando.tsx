import { useState, type ReactNode } from "react";
import { Mapa, type Capa } from "./Mapa";
import { Barra } from "./comunes";
import { useTablero } from "./datos/contexto";
import { miles, pct, porcentajeCobertura, textoAccion } from "@ventaja/nucleo";
import { Strategos, type Tarea } from "./Strategos";

const capas: { id: Capa; nombre: string; leyenda: ReactNode }[] = [
  {
    id: "accion", nombre: "Qué hacer en cada zona",
    leyenda: <><span><i className="punto" style={{ background: "#f0a73a" }} />Brigada</span><span><i className="punto" style={{ background: "#1f5bff" }} />Pauta</span><span><i className="punto" style={{ background: "#b46cff" }} />Oportunidad</span></>,
  },
  { id: "tierra", nombre: "Simpatizantes validados", leyenda: <span>Más intenso, más validados frente al potencial</span> },
  { id: "pauta", nombre: "Alcance de la pauta", leyenda: <span>Meta y Google, últimos 14 días</span> },
  { id: "meta", nombre: "Avance frente a la meta", leyenda: <><span><i className="punto" style={{ background: "#e5534b" }} />Bajo</span><span><i className="punto" style={{ background: "#2eb872" }} />En meta</span></> },
  { id: "testigos", nombre: "Cobertura de testigos", leyenda: <span>Círculos: puestos, color según mesas cubiertas</span> },
];

const nombreTipo = { brigada: "Brigada", pauta: "Más pauta", oportunidad: "Oportunidad", mantener: "Mantener" };
const colorTipo = { brigada: "ambar", pauta: "azul", oportunidad: "azul", mantener: "" };

export function Mando({ barra, aprobadas, alAprobar }: { barra: ReactNode; aprobadas: string[]; alAprobar: (t: Tarea) => void }) {
  const { meta: metaVista, recomendaciones, totales, zonaDe, modo } = useTablero();
  const [capa, setCapa] = useState<Capa>("accion");
  const [sel, setSel] = useState<string | null>(null);
  const [pest, setPest] = useState<"zona" | "ia">("ia");

  const elegir = (id: string) => { setSel(id); setPest("zona"); };
  const accionables = recomendaciones.filter((r) => r.accion !== "mantener")
    .sort((a, b) => (b.digital + b.brecha - b.tierra) - (a.digital + a.brecha - a.tierra));
  const meta = metaVista.votos ? totales.comprometidos / metaVista.votos : 0;
  const capaActual = capas.find((c) => c.id === capa)!;

  return (
    <>
      <Mapa capa={capa} seleccion={sel} alSeleccionar={elegir} />
      {barra}

      <section className="flota panel-kpi" aria-label="Calidad de la base">
        <h2>La base, sin inflar</h2>
        <p className="tenue" style={{ fontSize: 12.5, marginTop: 2 }}>Cada cifra dice cuánto de lo registrado es real.</p>
        <div className="embudo">
          <div className="embudo-fila"><span>Registrados</span><span className="cifra">{miles(totales.bruto)}</span><Barra valor={1} color="#3a465c" /></div>
          <div className="embudo-fila"><span>Validados</span><span className="cifra">{miles(totales.validados)}</span><Barra valor={totales.validados / totales.bruto} /></div>
          <div className="embudo-fila"><span>Comprometidos</span><span className="cifra">{miles(totales.comprometidos)}</span><Barra valor={totales.comprometidos / totales.bruto} color="var(--verde)" /></div>
        </div>
        <div className="meta-linea">
          <span className="tenue">{metaVista.texto} {miles(metaVista.votos)} votos</span>
          <strong>{pct(meta)} cubierto</strong>
        </div>
      </section>

      {modo === "demo" && <span className="ficticio">Datos ficticios. Zonas ilustrativas, no son límites oficiales.</span>}

      <div className="capas" role="group" aria-label="Capas del mapa">
        {capas.map((c) => (
          <button key={c.id} className="capa-btn" aria-pressed={capa === c.id} onClick={() => setCapa(c.id)}>{c.nombre}</button>
        ))}
        <div className="leyenda" style={{ marginTop: 4 }}>{capaActual.leyenda}</div>
      </div>

      <section className="flota franja" aria-label="Recomendaciones de hoy">
        <div className="fila entre">
          <h3>Dónde actuar hoy</h3>
          <span className="tenue" style={{ fontSize: 12 }}>Cruce de pauta, tierra y potencial por zona</span>
        </div>
        <div className="franja-lista">
          {accionables.map((r) => (
            <button key={r.territorioId} className="reco" aria-pressed={sel === r.territorioId} onClick={() => elegir(r.territorioId)}>
              <span className="fila entre"><strong>{zonaDe(r.territorioId).nombre}</strong><span className={`sello ${colorTipo[r.accion]}`}>{nombreTipo[r.accion]}</span></span>
              <span className="tenue" style={{ fontSize: 12.5 }}>{textoAccion[r.accion]}</span>
              <span className="tenue" style={{ fontSize: 12 }}>Pauta {pct(r.digital)}, tierra {pct(r.tierra)}</span>
            </button>
          ))}
          {!accionables.length && <p className="tenue" style={{ fontSize: 12.5 }}>Ninguna zona a la vista necesita un cambio hoy: todas van al ritmo esperado.</p>}
        </div>
      </section>

      <aside className="flota panel-lado">
        <div className="pestanas" role="tablist">
          <button role="tab" className="pestana" aria-selected={pest === "zona"} onClick={() => setPest("zona")}>Zona</button>
          <button role="tab" className="pestana" aria-selected={pest === "ia"} onClick={() => setPest("ia")}>Strategos</button>
        </div>
        <div className="cuerpo">
          {pest === "ia" ? <Strategos aprobadas={aprobadas} alAprobar={alAprobar} /> : sel ? <PerfilZona id={sel} /> : (
            <p className="tenue">Toque una zona del mapa o una recomendación para ver su detalle.</p>
          )}
        </div>
      </aside>
    </>
  );
}

function PerfilZona({ id }: { id: string }) {
  const { zonaDe, recDe, lideres, puestos } = useTablero();
  const z = zonaDe(id);
  const r = recDe(id);
  const suyos = lideres.filter((l) => l.zonaId === id);
  const susPuestos = puestos.filter((p) => p.zonaId === id);
  return (
    <>
      <div>
        <h2>{z.nombre}</h2>
        <p className="tenue">{textoAccion[r.accion]}</p>
      </div>
      <div className="rejilla" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><div className="etiqueta">Potencial (votos 2023)</div><div className="dato" style={{ fontSize: 22 }}>{miles(z.potencial)}</div></div>
        <div><div className="etiqueta">Validados</div><div className="dato" style={{ fontSize: 22 }}>{miles(z.validados)}</div></div>
        <div><div className="etiqueta">Comprometidos / meta</div><div className="dato" style={{ fontSize: 22 }}>{pct(z.comprometidos / z.meta)}</div></div>
        <div><div className="etiqueta">Líderes asignados</div><div className="dato" style={{ fontSize: 22 }}>{suyos.length}</div></div>
      </div>
      <hr className="separa" />
      <div className="pila" style={{ gap: 8 }}>
        <h3>Pauta en la zona</h3>
        <div className="fila entre"><span className="tenue">Alcance</span><span>{miles(z.alcance)} personas</span></div>
        <div className="fila entre"><span className="tenue">Clics</span><span>{miles(z.clics)}</span></div>
        <div className="fila entre"><span className="tenue">Inversión</span><span>$ {miles(z.gasto)}</span></div>
      </div>
      <hr className="separa" />
      <div className="pila" style={{ gap: 8 }}>
        <h3>Líderes de la zona</h3>
        {suyos.length ? suyos.map((l) => (
          <div key={l.id} className="fila entre"><span>{l.nombre}</span><span className="tenue">{miles(l.validados)} validados</span></div>
        )) : <p className="tenue">Ningún líder asignado. Es la primera tarea de la brigada.</p>}
      </div>
      {susPuestos.length > 0 && (
        <>
          <hr className="separa" />
          <div className="pila" style={{ gap: 8 }}>
            <h3>Puestos de votación</h3>
            {susPuestos.map((p) => (
              <div key={p.id} className="fila entre"><span>{p.nombre}</span><span className="tenue">{pct(porcentajeCobertura(p.mesas))} de mesas con testigo</span></div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

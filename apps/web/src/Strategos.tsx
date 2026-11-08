// Strategos en el Mando. Pregunta con los datos agregados del alcance de quien consulta y muestra de dónde salió cada
// respuesta. Los líderes llegan como «L-03» (la IA no recibe nombres, regla 6): aquí, del lado de quien consulta,
// se traducen al nombre. Las tareas propuestas no se ejecutan hasta que la gerencia las aprueba.
import { useMemo, useRef, useState, type FormEvent } from "react";
import { armarDatosStrategos, refsLideres, type TareaPropuesta } from "@ventaja/nucleo";
import { fuente } from "./datos/index";
import { useTablero } from "./datos/contexto";
import type { RespuestaStrategosPanel } from "./datos/tipos";

export type Tarea = { id: string; titulo: string; detalle: string };

const SUGERIDAS = ["¿Dónde actúo esta semana?", "¿Qué líderes debo revisar?", "¿Cómo vamos frente a la meta?"];

type Turno = { id: number; pregunta: string; respuesta?: RespuestaStrategosPanel; error?: string };

export function Strategos({ aprobadas, alAprobar }: { aprobadas: string[]; alAprobar: (t: Tarea) => void }) {
  const { sesion, zonas, lideres, meta } = useTablero();
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const ocupado = turnos.some((t) => !t.respuesta && !t.error);
  const siguiente = useRef(1);

  const datos = useMemo(() => armarDatosStrategos(
    { candidato: sesion.campana.candidato, cargo: sesion.campana.cargo, metaVotos: meta.votos, eleccion: sesion.campana.eleccion },
    zonas, lideres,
  ), [sesion, zonas, lideres, meta.votos]);

  // De referencia a nombre, solo en la pantalla.
  const nombres = useMemo(() => {
    const porId = new Map(lideres.map((l) => [l.id, l.nombre]));
    return new Map([...refsLideres(lideres.map((l) => l.id))].map(([id, ref]) => [ref, porId.get(id) ?? ref]));
  }, [lideres]);
  const zonaNombre = useMemo(() => new Map(zonas.map((z) => [z.id, z.nombre])), [zonas]);
  const conNombres = (t: string) => t.replace(/\bL-\d{2,}\b/g, (r) => nombres.get(r) ?? r);

  const tareaDe = (turno: number, i: number, t: TareaPropuesta): Tarea => {
    const donde = [...t.zonas.map((z) => zonaNombre.get(z) ?? z), ...t.lideres.map((r) => nombres.get(r) ?? r)];
    const detalle = conNombres(t.detalle);
    const faltan = donde.filter((d) => !detalle.includes(d));
    return { id: `ia-${turno}-${i}`, titulo: conNombres(t.titulo), detalle: detalle + (faltan.length ? ` (${faltan.join(", ")})` : "") };
  };

  async function preguntar(p: string) {
    const pregunta = p.trim();
    if (!pregunta || ocupado) return;
    const id = siguiente.current++;
    setTurnos((ts) => [...ts, { id, pregunta }]);
    setTexto("");
    try {
      const respuesta = await fuente.preguntarStrategos(sesion, pregunta, datos);
      setTurnos((ts) => ts.map((t) => (t.id === id ? { ...t, respuesta } : t)));
    } catch (x) {
      setTurnos((ts) => ts.map((t) => (t.id === id ? { ...t, error: (x as Error).message } : t)));
    }
  }

  const enviar = (e: FormEvent) => { e.preventDefault(); void preguntar(texto); };
  const hechas = new Set(turnos.map((t) => t.pregunta));

  return (
    <>
      <p className="tenue">
        Strategos responde con los datos agregados de su alcance y dice de dónde salió cada respuesta. No recibe listas de personas. Las tareas que propone no se ejecutan hasta que usted las apruebe.
      </p>
      {turnos.map((t) => (
        <div key={t.id} className="pila" aria-label={`Pregunta: ${t.pregunta}`}>
          <div className="mensaje yo">{t.pregunta}</div>
          {!t.respuesta && !t.error && <div className="mensaje ia tenue" role="status">Revisando los datos de la campaña…</div>}
          {t.error && <div className="mensaje ia"><p className="error" role="alert">{t.error}</p></div>}
          {t.respuesta && (
            <>
              <div className="mensaje ia">
                <p>{conNombres(t.respuesta.texto)}</p>
                {t.respuesta.fuentes.length > 0 && <ul className="fuentes" aria-label="Fuentes">{t.respuesta.fuentes.map((f) => <li key={f}>{f}</li>)}</ul>}
                {t.respuesta.aviso && <p className="etiqueta">{t.respuesta.aviso}</p>}
              </div>
              {t.respuesta.tareas.map((tp, i) => {
                const tarea = tareaDe(t.id, i, tp);
                return (
                  <div key={tarea.id} className="tarea-prop">
                    <div>
                      <h3>{tarea.titulo}</h3>
                      <p className="tenue" style={{ fontSize: 12.5, marginTop: 2 }}>{tarea.detalle}</p>
                    </div>
                    <div className="fila">
                      {aprobadas.includes(tarea.id) ? (
                        <span className="sello verde">Aprobada y asignada</span>
                      ) : (
                        <button className="btn btn-primario btn-chico" onClick={() => alAprobar(tarea)}>Aprobar tarea</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      ))}
      <div className="sugeridas" aria-label="Preguntas sugeridas">
        {SUGERIDAS.filter((q) => !hechas.has(q)).map((q) => (
          <button key={q} className="sugerida" onClick={() => void preguntar(q)} disabled={ocupado}>{q}</button>
        ))}
      </div>
      <form className="fila" onSubmit={enviar}>
        <input className="enlace" style={{ flex: 1 }} value={texto} maxLength={500} placeholder="Escriba su pregunta"
          aria-label="Pregunta para Strategos" onChange={(e) => setTexto(e.target.value)} />
        <button className="btn btn-primario btn-chico" type="submit" disabled={ocupado || !texto.trim()}>Preguntar</button>
      </form>
      <p className="aviso">
        {fuente.modo === "demo"
          ? "Modo demo: responde el modelo simulado, con los mismos datos y herramientas que usará la IA."
          : "Los pronósticos son escenarios con supuestos, nunca una certeza. Revise antes de decidir."}
      </p>
    </>
  );
}

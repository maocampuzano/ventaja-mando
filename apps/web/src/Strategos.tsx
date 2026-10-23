import { useState } from "react";
import { lideres, preguntasStrategos, recomendaciones, zonaDe } from "./data";

export type Tarea = { id: string; titulo: string; detalle: string };

function tareasPropuestas(tipos: string[]): Tarea[] {
  const brigadas = recomendaciones.filter((r) => r.accion === "brigada").sort((a, b) => b.digital - a.digital);
  const revisar = [...lideres].sort((a, b) => a.indice.total - b.indice.total).slice(0, 3);
  const t: Tarea[] = [];
  if (tipos.includes("brigada") && brigadas.length)
    t.push({ id: "t-brigada", titulo: `Brigada de fin de semana en ${brigadas.slice(0, 2).map((b) => zonaDe(b.territorioId).nombre).join(" y ")}`, detalle: "Asignar a 2 coordinadores, sábado 8:00 a 12:00, con formulario de registro y autorización." });
  const oportunidad = recomendaciones.filter((r) => r.accion === "oportunidad").sort((a, b) => b.brecha - a.brecha)[0];
  if (tipos.includes("llamadas") && oportunidad)
    t.push({ id: "t-llamadas", titulo: `Cola de llamadas para ${zonaDe(oportunidad.territorioId).nombre}`, detalle: "Simpatizantes sin contactar de esa zona, con guion de invitación a la reunión del jueves." });
  if (tipos.includes("revision"))
    t.push({ id: "t-revision", titulo: "Reunión de depuración con 3 líderes", detalle: revisar.map((l) => l.nombre).join(", ") + ": revisar coincidencias antes de asignar metas nuevas." });
  return t;
}

export function Strategos({ aprobadas, alAprobar }: { aprobadas: string[]; alAprobar: (t: Tarea) => void }) {
  const [hilo, setHilo] = useState<number[]>([]);
  const [escribiendo, setEscribiendo] = useState(false);

  const preguntar = (i: number) => {
    if (escribiendo || hilo.includes(i)) return;
    setEscribiendo(true);
    setTimeout(() => { setHilo((h) => [...h, i]); setEscribiendo(false); }, 700);
  };

  return (
    <>
      <p className="tenue">
        Strategos responde con los datos agregados de la campaña y dice de dónde salió cada respuesta. Las tareas que propone no se ejecutan hasta que usted las apruebe.
      </p>
      {hilo.map((i) => {
        const p = preguntasStrategos[i];
        return (
          <div key={i} className="pila">
            <div className="mensaje yo">{p.q}</div>
            <div className="mensaje ia">
              <p>{p.a}</p>
              <ul className="fuentes">{p.fuentes.map((f) => <li key={f}>{f}</li>)}</ul>
            </div>
            {tareasPropuestas(p.tareas).map((t) => (
              <div key={t.id} className="tarea-prop">
                <div>
                  <h3>{t.titulo}</h3>
                  <p className="tenue" style={{ fontSize: 12.5, marginTop: 2 }}>{t.detalle}</p>
                </div>
                <div className="fila">
                  {aprobadas.includes(t.id) ? (
                    <span className="sello verde">Aprobada y asignada</span>
                  ) : (
                    <button className="btn btn-primario btn-chico" onClick={() => alAprobar(t)}>Aprobar tarea</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}
      {escribiendo && <div className="mensaje ia tenue">Revisando los datos de la campaña…</div>}
      <div className="sugeridas" aria-label="Preguntas sugeridas">
        {preguntasStrategos.map((p, i) => !hilo.includes(i) && (
          <button key={i} className="sugerida" onClick={() => preguntar(i)} disabled={escribiendo}>{p.q}</button>
        ))}
      </div>
      <p className="aviso">Prototipo: las respuestas son de ejemplo. En el producto, Strategos consulta vistas agregadas; no recibe listas de personas.</p>
    </>
  );
}

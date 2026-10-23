import { useMemo, useState } from "react";
import { Barra, claseIndice, colorIndice } from "./comunes";
import { lideres, zonaDe, type Lider } from "./data";
import { enlaceWhatsAppManual, miles, pct } from "./logic";

const comps = [
  { k: "calidad", n: "Calidad", ayuda: "Validados sobre registrados" },
  { k: "limpieza", n: "Limpieza", ayuda: "Sin coincidencias con otros líderes" },
  { k: "ejecucion", n: "Tareas", ayuda: "Tareas hechas sobre asignadas" },
  { k: "avanceMeta", n: "Meta", ayuda: "Validados frente a su meta" },
] as const;

export function Lideres() {
  const [orden, setOrden] = useState<"asc" | "desc">("desc");
  const [sel, setSel] = useState<Lider | null>(null);
  const lista = useMemo(
    () => [...lideres].sort((a, b) => (orden === "desc" ? b.indice.total - a.indice.total : a.indice.total - b.indice.total)),
    [orden]
  );
  const revisar = lideres.filter((l) => l.indice.total < 0.5).length;

  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>Líderes</h1>
          <p className="tenue">El índice suma cuatro cosas que se pueden comprobar. Ningún líder queda como «bueno» o «malo» sin que se vea por qué.</p>
        </div>
        <div className="fila">
          <span className="sello rojo">{revisar} para revisar</span>
          <button className="btn" onClick={() => setOrden(orden === "desc" ? "asc" : "desc")}>
            {orden === "desc" ? "Ver primero los más bajos" : "Ver primero los más altos"}
          </button>
        </div>
      </div>

      <div className="escenario" style={{ gridTemplateColumns: sel ? "minmax(0,1fr) 340px" : "1fr" }}>
        <div className="tarjeta tabla-envoltura" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Líder</th><th>Zona</th><th className="num">Registrados</th><th className="num">Validados</th>
                <th>Componentes del índice</th><th className="num">Índice</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((l) => (
                <tr key={l.id} className="clic" aria-selected={sel?.id === l.id} onClick={() => setSel(l)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSel(l)}>
                  <td><strong>{l.nombre}</strong></td>
                  <td className="tenue">{zonaDe(l.zonaId).nombre}</td>
                  <td className="num">{miles(l.registrados)}</td>
                  <td className="num">{miles(l.validados)}</td>
                  <td>
                    <div className="componentes">
                      {comps.map((c) => (
                        <div key={c.k} className="comp" title={c.ayuda}>
                          <span>{c.n}</span>
                          <Barra valor={l.indice.componentes[c.k]} color={colorIndice(l.indice.componentes[c.k])} />
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="num"><span className={`sello ${claseIndice(l.indice.total)}`}>{Math.round(l.indice.total * 100)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sel && (
          <aside className="tarjeta pila" aria-label={`Detalle de ${sel.nombre}`}>
            <div className="fila entre">
              <h2>{sel.nombre}</h2>
              <button className="btn btn-chico" onClick={() => setSel(null)}>Cerrar</button>
            </div>
            <p className="tenue">{zonaDe(sel.zonaId).nombre}, meta de {miles(sel.meta)} validados.</p>
            {comps.map((c) => (
              <div key={c.k} className="pila" style={{ gap: 4 }}>
                <div className="fila entre"><span>{c.n}</span><strong>{pct(sel.indice.componentes[c.k])}</strong></div>
                <Barra valor={sel.indice.componentes[c.k]} color={colorIndice(sel.indice.componentes[c.k])} />
                <span className="etiqueta">{c.ayuda}</span>
              </div>
            ))}
            {sel.duplicadosConOtros / sel.registrados > 0.15 && (
              <p className="aviso">{miles(sel.duplicadosConOtros)} de sus registros coinciden con los de otros líderes. Puede ser una lista compartida: conviene revisarla con él antes de sumar sus cifras.</p>
            )}
            <div className="fila">
              <a className="btn btn-primario" href={enlaceWhatsAppManual("573000000000", `Hola ${sel.nombre.split(" ")[0]}, ¿podemos revisar tu lista esta semana?`)} target="_blank" rel="noreferrer">
                Escribirle por WhatsApp
              </a>
            </div>
            <p className="etiqueta">Abre su WhatsApp con el mensaje listo; lo envía usted. El número del prototipo es ficticio.</p>
            <hr className="separa" />
            <h3>Después de la elección</h3>
            <p className="tenue" style={{ fontSize: 13 }}>Se comparan los apoyos que registró con los votos del E-14 en sus mesas, siempre en agregado por mesa. Nunca dice cómo votó una persona.</p>
          </aside>
        )}
      </div>
    </div>
  );
}

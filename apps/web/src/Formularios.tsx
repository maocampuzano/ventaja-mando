// Constructor básico de formularios: la dirección arma las preguntas que el equipo usa en tierra (la app de la fase 3
// las llena sin conexión). Se revisan con las reglas de nucleo/formularios y la base las vuelve a revisar al guardar.
import { useEffect, useMemo, useState } from "react";
import {
  nombreTipoCampo, nuevoIdCampo, revisarEsquema, validarRespuesta, type Campo, type TipoCampo, type ValorRespuesta,
} from "@ventaja/nucleo";
import { fuente } from "./datos";
import { useTablero } from "./datos/contexto";
import type { Formulario } from "./datos/tipos";

const TIPOS = Object.keys(nombreTipoCampo) as TipoCampo[];
type Borrador = { id?: string; nombre: string; campos: Campo[] };
const vacio = (): Borrador => ({ nombre: "", campos: [] });

export function Formularios() {
  const { sesion } = useTablero();
  const [lista, setLista] = useState<Formulario[]>([]);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const cargar = () => { fuente.formularios(sesion).then(setLista).catch((e: Error) => setError(e.message)); };
  useEffect(cargar, [sesion]);

  async function guardar() {
    if (!borrador) return;
    setError(""); setAviso("");
    try {
      const f = await fuente.guardarFormulario(sesion, { id: borrador.id, nombre: borrador.nombre, esquema: { campos: borrador.campos } });
      setAviso(`Formulario «${f.nombre}» guardado (versión ${f.version}).`);
      setBorrador(null); cargar();
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>Formularios</h1>
          <p className="tenue">Las preguntas que el equipo hace en tierra. No se pregunta por el voto ni por la opinión política de cada persona, ni se pide la cédula: la base no lo permite.</p>
        </div>
        {!borrador && <button className="btn btn-primario" onClick={() => { setBorrador(vacio()); setAviso(""); }}>Nuevo formulario</button>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {aviso && <p className="aviso" role="status">{aviso}</p>}
      {borrador
        ? <Editor borrador={borrador} cambiar={setBorrador} guardar={guardar} cancelar={() => { setBorrador(null); setError(""); }} />
        : (
          <section className="tarjeta pila" aria-label="Formularios de la campaña">
            {!lista.length && <p className="tenue">Todavía no hay formularios.</p>}
            {lista.map((f) => (
              <div key={f.id} className="fila entre">
                <span><strong>{f.nombre}</strong> <span className="tenue">· versión {f.version} · {f.esquema.campos.length} {f.esquema.campos.length === 1 ? "pregunta" : "preguntas"}</span></span>
                <button className="btn btn-chico" onClick={() => { setBorrador({ id: f.id, nombre: f.nombre, campos: structuredClone(f.esquema.campos) }); setAviso(""); }}>Editar</button>
              </div>
            ))}
          </section>
        )}
    </div>
  );
}

function Editor({ borrador, cambiar, guardar, cancelar }: {
  borrador: Borrador; cambiar: (b: Borrador) => void; guardar: () => void; cancelar: () => void;
}) {
  const revision = useMemo(() => revisarEsquema(borrador.nombre, { campos: borrador.campos }), [borrador]);
  const poner = (i: number, c: Partial<Campo>) => cambiar({ ...borrador, campos: borrador.campos.map((x, j) => (j === i ? { ...x, ...c } : x)) });
  const mover = (i: number, d: -1 | 1) => {
    const cs = [...borrador.campos];
    [cs[i], cs[i + d]] = [cs[i + d], cs[i]];
    cambiar({ ...borrador, campos: cs });
  };
  const agregar = (tipo: TipoCampo) => cambiar({ ...borrador, campos: [...borrador.campos, {
    id: nuevoIdCampo(borrador.campos.map((c) => c.id)), tipo, etiqueta: "", obligatorio: false,
    ...(tipo === "opcion" || tipo === "multiple" ? { opciones: ["", ""] } : {}),
  }] });

  return (
    <div className="escenario" style={{ gridTemplateColumns: "minmax(0, 1fr) 380px" }}>
      <section className="tarjeta pila" aria-label="Editor de formulario">
        <label className="campo">Nombre del formulario
          <input value={borrador.nombre} onChange={(e) => cambiar({ ...borrador, nombre: e.target.value })} placeholder="Ej.: Visita casa a casa" />
        </label>
        {borrador.campos.map((c, i) => (
          <fieldset key={c.id} className="campo-formulario" aria-label={`Pregunta ${i + 1}`}>
            <legend>Pregunta {i + 1} · {nombreTipoCampo[c.tipo]}</legend>
            <label className="campo">Pregunta
              <input value={c.etiqueta} onChange={(e) => poner(i, { etiqueta: e.target.value })} />
            </label>
            {(c.tipo === "opcion" || c.tipo === "multiple") && (
              <label className="campo">Opciones (una por línea)
                <textarea rows={3} value={(c.opciones ?? []).join("\n")} onChange={(e) => poner(i, { opciones: e.target.value.split("\n") })} />
              </label>
            )}
            <label className="campo">Ayuda (opcional)
              <input value={c.ayuda ?? ""} onChange={(e) => poner(i, { ayuda: e.target.value || undefined })} />
            </label>
            {[...revision.errores, ...revision.avisos].filter((e) => e.startsWith(`Campo ${i + 1}:`) || e.startsWith(`Campo ${i + 1} («`)).map((e) => (
              <p key={e} className={revision.errores.includes(e) ? "error" : "aviso"} role={revision.errores.includes(e) ? "alert" : undefined}>
                {e.replace(/^Campo \d+ ?(\(«.*?»\))?:? ?/, "")}
              </p>
            ))}
            <div className="fila">
              <label className="fila"><input type="checkbox" checked={c.obligatorio} onChange={(e) => poner(i, { obligatorio: e.target.checked })} /> Obligatoria</label>
              <span className="espacio" />
              <button type="button" className="btn btn-chico" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Subir la pregunta ${i + 1}`}>↑</button>
              <button type="button" className="btn btn-chico" disabled={i === borrador.campos.length - 1} onClick={() => mover(i, 1)} aria-label={`Bajar la pregunta ${i + 1}`}>↓</button>
              <button type="button" className="btn btn-chico" onClick={() => cambiar({ ...borrador, campos: borrador.campos.filter((_, j) => j !== i) })}>Quitar</button>
            </div>
          </fieldset>
        ))}
        <div className="fila">
          <span className="tenue">Agregar:</span>
          {TIPOS.map((t) => <button key={t} type="button" className="btn btn-chico" onClick={() => agregar(t)}>{nombreTipoCampo[t]}</button>)}
        </div>
        {revision.errores.length > 0 && (
          <ul className="lista-filas error" aria-label="Errores del formulario">{revision.errores.map((e) => <li key={e}>{e}</li>)}</ul>
        )}
        {revision.avisos.length > 0 && <ul className="lista-filas aviso">{revision.avisos.map((e) => <li key={e}>{e}</li>)}</ul>}
        <div className="fila">
          <button className="btn btn-primario" disabled={revision.errores.length > 0} onClick={guardar}>Guardar formulario</button>
          <button className="btn" onClick={cancelar}>Cancelar</button>
        </div>
        <p className="aviso">Cada formulario lleno debe ir con la autorización de datos de la persona. El texto de esa autorización lo valida el abogado (V3).</p>
      </section>
      <VistaPrevia nombre={borrador.nombre} campos={borrador.campos} />
    </div>
  );
}

function VistaPrevia({ nombre, campos }: { nombre: string; campos: Campo[] }) {
  const [datos, setDatos] = useState<Record<string, ValorRespuesta>>({});
  const errores = validarRespuesta({ campos }, datos);
  const poner = (id: string, v: ValorRespuesta) => setDatos({ ...datos, [id]: v });
  return (
    <aside className="tarjeta pila vista-previa" aria-label="Vista previa">
      <div className="etiqueta">Vista previa: así lo ve quien lo llena</div>
      <h2>{nombre || "Sin nombre"}</h2>
      {campos.map((c) => {
        const ops = (c.opciones ?? []).filter((o) => o.trim());
        return (
          <div key={c.id} className="campo">
            <span>{c.etiqueta || <em>Pregunta sin escribir</em>}{c.obligatorio && " *"}</span>
            {c.ayuda && <span className="tenue">{c.ayuda}</span>}
            {c.tipo === "texto" && <input onChange={(e) => poner(c.id, e.target.value)} />}
            {c.tipo === "numero" && <input type="number" onChange={(e) => poner(c.id, e.target.value === "" ? null : Number(e.target.value))} />}
            {c.tipo === "fecha" && <input type="date" onChange={(e) => poner(c.id, e.target.value)} />}
            {c.tipo === "si_no" && (
              <select onChange={(e) => poner(c.id, e.target.value === "" ? null : e.target.value === "si")}>
                <option value="">—</option><option value="si">Sí</option><option value="no">No</option>
              </select>
            )}
            {c.tipo === "opcion" && (
              <select onChange={(e) => poner(c.id, e.target.value || null)}>
                <option value="">—</option>{ops.map((o) => <option key={o}>{o}</option>)}
              </select>
            )}
            {c.tipo === "multiple" && ops.map((o) => (
              <label key={o} className="fila"><input type="checkbox" onChange={(e) => {
                const actual = (datos[c.id] as string[] | undefined) ?? [];
                poner(c.id, e.target.checked ? [...actual, o] : actual.filter((x) => x !== o));
              }} />{o}</label>
            ))}
            {errores[c.id] && datos[c.id] !== undefined && <span className="error">{errores[c.id]}</span>}
          </div>
        );
      })}
      {!campos.length && <p className="tenue">Agregue preguntas para verlas aquí.</p>}
    </aside>
  );
}

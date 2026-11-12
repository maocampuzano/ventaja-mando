// Ajustes de la campaña, en un solo lugar: sus datos, el tope de gastos, quién entra y con qué rol, y la apariencia.
// Solo la dirección llega aquí; el tope lo guarda la misma función de Cuentas, que la base restringe a la dirección.
import { useEffect, useState } from "react";
import { fecha, miles, moneda } from "@ventaja/nucleo";
import { useTablero } from "./datos/contexto";
import { fuente } from "./datos/index";

const numero = (texto: string) => Number(texto.replace(/\D/g, "")) || 0;

const queHace: [string, string][] = [
  ["Gerente", "Dirige la campaña: ve todo, aprueba envíos, lleva las cuentas y responde por los datos."],
  ["Candidato", "Ve el resumen, las cuentas y el día E. No ve listas de personas."],
  ["Coordinador", "Ve y maneja solo sus zonas: sus líderes, sus planillas y sus mesas."],
  ["Líder", "Registra simpatizantes desde el celular, con la autorización de cada persona."],
  ["Testigo", "El día E reporta su mesa: foto del E-14 y novedades."],
  ["Operador de llamadas", "Llama a una persona a la vez, con el guion de la campaña."],
];

export function Ajustes({ sala, cambiarTema, ir }: { sala: boolean; cambiarTema: () => void; ir: (vista: string) => void }) {
  const { sesion, campana } = useTablero();
  const [topeActual, setTopeActual] = useState<number | null | undefined>(undefined);
  const [tope, setTope] = useState("");
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;
    fuente.finanzas(sesion).then((f) => { if (vigente) { setTopeActual(f.tope); setTope(f.tope ? String(f.tope) : ""); } })
      .catch((e: Error) => { if (vigente) setError(e.message); });
    return () => { vigente = false; };
  }, [sesion]);

  const guardarTope = async () => {
    setAviso(""); setError("");
    try { await fuente.configurarTope(sesion, numero(tope)); setTopeActual(numero(tope)); setAviso("Tope de gastos guardado."); }
    catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>Ajustes</h1>
          <p className="tenue">Lo que se define una vez para toda la campaña.</p>
        </div>
      </div>

      <div className="hoy">
        <div className="hoy-col">
          <section className="tarjeta pila" aria-labelledby="aj-campana">
            <h2 id="aj-campana">La campaña</h2>
            <div className="rejilla" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
              <div><div className="etiqueta">Candidatura</div><strong>{campana.candidato}</strong></div>
              <div><div className="etiqueta">Cargo</div><strong>{campana.cargo}</strong></div>
              <div><div className="etiqueta">Día de la elección</div><strong>{campana.eleccion ? fecha(campana.eleccion) : "Sin fecha"}</strong></div>
              <div><div className="etiqueta">Meta de votos</div><strong>{miles(campana.metaVotos)}</strong></div>
            </div>
            <p className="tenue">Estos datos se definen al crear la campaña. Para corregirlos, escriba a soporte de Comando.</p>
          </section>

          <section className="tarjeta pila" aria-labelledby="aj-tope">
            <h2 id="aj-tope">Tope de gastos del CNE</h2>
            <p className="tenue">Es el máximo que la campaña puede gastar, según la resolución del Consejo Nacional Electoral para su cargo y municipio. Con él, Cuentas avisa cuando los gastos pasan del 80 % y del 95 %.</p>
            {topeActual === undefined && !error ? <p className="tenue">Cargando…</p> : (
              <div className="fila">
                <label className="campo" style={{ flex: "1 1 220px" }}>Tope en pesos
                  <input inputMode="numeric" value={tope ? moneda(numero(tope)) : ""} placeholder="$ 0" onChange={(e) => { setTope(String(numero(e.target.value))); setAviso(""); }} />
                </label>
                <button className="btn btn-primario" style={{ alignSelf: "flex-end" }} disabled={!numero(tope) || numero(tope) === topeActual} onClick={guardarTope}>Guardar el tope</button>
              </div>
            )}
            {aviso && <p className="sello verde" role="status">{aviso}</p>}
            {error && <p className="error" role="alert">{error}</p>}
          </section>

          <section className="tarjeta pila" aria-labelledby="aj-roles">
            <div className="fila entre">
              <h2 id="aj-roles">Quién entra y con qué rol</h2>
              <button className="btn btn-chico" onClick={() => ir("equipo")}>Invitar o ver el equipo</button>
            </div>
            <p className="tenue">Cada persona entra con su propio usuario y ve solo lo de su rol. La base de datos lo hace cumplir, no solo la pantalla.</p>
            {queHace.map(([rol, texto]) => (
              <div key={rol} className="zona-fila" style={{ gridTemplateColumns: "minmax(110px, 0.6fr) 2fr", alignItems: "start" }}><strong>{rol}</strong><span className="tenue">{texto}</span></div>
            ))}
          </section>
        </div>

        <div className="hoy-col">
          <section className="tarjeta pila" aria-labelledby="aj-apariencia">
            <h2 id="aj-apariencia">Apariencia</h2>
            <p className="tenue">El panel se ve en claro. El mapa y el día E van siempre en «modo sala» (oscuro). Puede poner todo el panel en oscuro, por ejemplo para el televisor de la sede. Se recuerda en este navegador.</p>
            <label className="fila" style={{ gap: 8 }}>
              <input type="checkbox" checked={sala} onChange={cambiarTema} /> Usar el modo sala en todo el panel
            </label>
          </section>

          <section className="tarjeta pila" aria-labelledby="aj-diae">
            <h2 id="aj-diae">Día E</h2>
            <p className="tenue">Cómo aparece la candidatura en el E-14 y el simulacro se manejan en la sección Día E.</p>
            <div><button className="btn btn-chico" onClick={() => ir("diae")}>Abrir Día E</button></div>
          </section>

          <section className="tarjeta pila" aria-labelledby="aj-datos">
            <h2 id="aj-datos">Datos personales</h2>
            <p className="tenue">Autorizaciones, solicitudes de titulares, exportaciones y auditoría están en Cumplimiento.</p>
            <div><button className="btn btn-chico" onClick={() => ir("datos")}>Abrir Cumplimiento</button></div>
          </section>
        </div>
      </div>
    </div>
  );
}

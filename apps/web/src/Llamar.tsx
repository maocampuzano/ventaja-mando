// Espacio del operador de llamadas: elige una de sus colas, recibe UNA persona (nombre y celular), llama desde su
// teléfono, registra el resultado y recibe la siguiente. No ve nada más de la campaña.
// Regla 2: no hay resultado para «apoya» ni para la intención de voto.
import { useCallback, useEffect, useState } from "react";
import { RESULTADOS_LLAMADA, dentroDeHorario, miles, type ResultadoLlamada } from "@ventaja/nucleo";
import { useTablero } from "./datos/contexto";
import { fuente } from "./datos/index";
import type { LlamadaEnCurso, MiCola } from "./datos/tipos";

const telefonoParaMarcar = (t: string) => t.replace(/[^\d+]/g, "");

export function Llamar() {
  const { sesion } = useTablero();
  const [colas, setColas] = useState<MiCola[] | null>(null);
  const [colaId, setColaId] = useState<string | null>(null);
  const [llamada, setLlamada] = useState<LlamadaEnCurso | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const cargarColas = useCallback(() => {
    fuente.misColas(sesion).then((c) => { setColas(c); if (c.length === 1 && !colaId) setColaId(c[0].id); }).catch((e: Error) => setError(e.message));
  }, [sesion, colaId]);
  useEffect(cargarColas, [cargarColas]);

  const siguiente = useCallback(async (id: string) => {
    setOcupado(true); setError("");
    try { setLlamada(await fuente.siguienteLlamada(sesion, id)); } catch (e) { setError((e as Error).message); setLlamada(undefined); }
    finally { setOcupado(false); }
  }, [sesion]);
  useEffect(() => { if (colaId) void siguiente(colaId); }, [colaId, siguiente]);

  async function registrar(resultado: ResultadoLlamada) {
    if (!llamada || !colaId) return;
    if (resultado === "no_volver_a_llamar" && !window.confirm("La persona quedará dada de baja: la campaña no la volverá a contactar por ningún medio. ¿Confirmar?")) return;
    setOcupado(true); setError("");
    try { await fuente.registrarLlamada(sesion, llamada.itemId, resultado); await siguiente(colaId); cargarColas(); }
    catch (e) { setError((e as Error).message); setOcupado(false); }
  }

  const horario = dentroDeHorario(new Date());
  const cola = colas?.find((c) => c.id === colaId);

  return (
    <div className="pagina" style={{ maxWidth: 640 }}>
      <div className="pagina-cabeza">
        <div>
          <h1>Llamar</h1>
          <p className="tenue">Una persona a la vez. Llame desde su teléfono, siga el guion y registre cómo le fue. Nunca pregunte por quién va a votar.</p>
        </div>
      </div>
      {!horario.permitido && <p className="aviso">Fuera del horario de llamadas. {horario.motivo?.replace("se envían mensajes", "se llama").replace("se envía", "se llama")}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {colas && colas.length === 0 && <div className="tarjeta"><p className="tenue">Todavía no tiene colas asignadas. Su coordinación se las asigna.</p></div>}
      {colas && colas.length > 1 && (
        <label className="campo" style={{ marginBottom: 16 }}>Cola
          <select value={colaId ?? ""} onChange={(e) => { setLlamada(undefined); setColaId(e.target.value || null); }}>
            <option value="">Elija una cola…</option>
            {colas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({miles(c.porLlamar)} por llamar){c.estado !== "activa" ? ` · ${c.estado}` : ""}</option>)}
          </select>
        </label>
      )}

      {cola && llamada === null && <div className="tarjeta"><p>No queda nadie por llamar en «{cola.nombre}» por ahora. Las personas para reintentar vuelven más tarde.</p></div>}

      {llamada && (
        <section className="tarjeta pila" aria-label="Llamada en curso">
          {cola && <span className="etiqueta">{cola.nombre}</span>}
          <h2>{llamada.nombre}</h2>
          <a className="btn btn-primario" href={`tel:${telefonoParaMarcar(llamada.telefono)}`} style={{ justifySelf: "start" }}>Llamar al {llamada.telefono}</a>
          {llamada.intentos > 0 && <span className="etiqueta">Ya se intentó {llamada.intentos} {llamada.intentos === 1 ? "vez" : "veces"}.</span>}
          {llamada.guion && <div className="aviso" style={{ whiteSpace: "pre-wrap" }}><strong>Guion.</strong> {llamada.guion}</div>}
          <h3>¿Cómo le fue?</h3>
          <div className="pila" style={{ gap: 6 }}>
            {RESULTADOS_LLAMADA.map((r) => (
              <button key={r.id} className="btn" style={{ justifyContent: "flex-start", textAlign: "left" }} disabled={ocupado} onClick={() => registrar(r.id)}>
                <span><strong>{r.nombre}</strong><br /><span className="etiqueta">{r.efecto}</span></span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

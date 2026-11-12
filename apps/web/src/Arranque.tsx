// «Ponga su campaña en marcha»: los siete pasos del arranque guiado, arriba de «Hoy», solo para la dirección.
// Desaparece cuando están todos hechos, y se puede ocultar (se recuerda en ese navegador).
import { useEffect, useMemo, useState } from "react";
import { Barra } from "./comunes";
import { useTablero } from "./datos/contexto";
import { avanceArranque, pasosArranque, type EstadoArranque } from "./datos/arranque";
import { fuente } from "./datos/index";

export function Arranque({ tareasAprobadas, ir }: { tareasAprobadas: number; ir: (vista: string) => void }) {
  const { sesion, totales } = useTablero();
  const llave = `comando-arranque-oculto-${sesion.campana.id}`;
  const [oculto, setOculto] = useState(() => { try { return localStorage.getItem(llave) === "1"; } catch { return false; } });
  const [estado, setEstado] = useState<EstadoArranque>({});

  useEffect(() => {
    let vigente = true;
    const poner = (x: EstadoArranque) => { if (vigente) setEstado((e) => ({ ...e, ...x })); };
    const callar = () => { /* sin ese dato, el paso queda por hacer */ };
    fuente.finanzas(sesion).then((f) => poner({ tope: f.tope })).catch(callar);
    fuente.equipo(sesion).then((q) => poner({
      coordinadores: q.miembros.filter((m) => m.rol === "coordinador").length + q.invitaciones.filter((i) => i.rol === "coordinador").length,
    })).catch(callar);
    fuente.lotesPlanilla(sesion).then((l) => poner({ lotesPlanilla: l.length })).catch(callar);
    fuente.formularios(sesion).then((f) => poner({ formularios: f.length })).catch(callar);
    fuente.cumplimientoE14(sesion).then((c) => poner({ opcionE14: c.opcionE14 })).catch(callar);
    return () => { vigente = false; };
  }, [sesion]);

  const pasos = useMemo(() => pasosArranque({ ...estado, registrados: totales.bruto, tareasAprobadas }), [estado, totales.bruto, tareasAprobadas]);
  const { hechos, total } = avanceArranque(pasos);
  const siguiente = pasos.find((p) => !p.hecho);

  const ocultar = (v: boolean) => {
    setOculto(v);
    try { if (v) localStorage.setItem(llave, "1"); else localStorage.removeItem(llave); } catch { /* sin almacenamiento */ }
  };

  if (!siguiente) return null;
  if (oculto) {
    return (
      <p className="tenue" style={{ marginBottom: 16 }}>
        Faltan {total - hechos} pasos para tener la campaña en marcha. <button className="btn btn-chico" onClick={() => ocultar(false)}>Ver los pasos</button>
      </p>
    );
  }
  return (
    <section className="tarjeta pila arranque" aria-labelledby="arranque-titulo" style={{ marginBottom: 16 }}>
      <div className="fila entre">
        <div>
          <h2 id="arranque-titulo">Ponga su campaña en marcha</h2>
          <p className="tenue">{hechos} de {total} pasos listos. Hágalos en este orden y la campaña queda andando el mismo día.</p>
        </div>
        <button className="btn btn-chico" onClick={() => ocultar(true)}>Ocultar</button>
      </div>
      <Barra valor={hechos / total} color="var(--verde)" />
      <ol className="arranque-pasos">
        {pasos.map((p) => (
          <li key={p.id} className={p.hecho ? "hecho" : p === siguiente ? "siguiente" : ""} aria-current={p === siguiente ? "step" : undefined}>
            <span className="arranque-marca" aria-hidden="true">{p.hecho ? "✓" : ""}</span>
            <div>
              <strong>{p.titulo}</strong>{p.hecho && <span className="oculto"> (listo)</span>}
              <p className="tenue">{p.porque}</p>
            </div>
            {!p.hecho && (
              <button className={`btn btn-chico${p === siguiente ? " btn-primario" : ""}`} onClick={() => ir(p.vista)}>{p.boton}</button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

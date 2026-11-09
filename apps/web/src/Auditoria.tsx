// Auditoría y errores del panel para la dirección (fase 8), dentro de «Datos y cumplimiento».
// La auditoría no muestra teléfonos, correos ni cédulas: la base los quita antes de entregarla.
import { useCallback, useEffect, useState } from "react";
import { ACCIONES_SENSIBLES, NOMBRE_ACCION, nombreAccion } from "@ventaja/nucleo";
import { useTablero } from "./datos/contexto";
import { fuente } from "./datos/index";
import type { ErrorAgrupado, FilaAuditoria, FiltroAuditoria } from "./datos/tipos";

const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** Un resumen corto del detalle, sin volcar el JSON completo. */
function resumenDetalle(d: Record<string, unknown>): string {
  const partes: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (k === "nuevo" || k === "anterior") {
      const nombre = (v as Record<string, unknown> | null)?.nombre;
      if (nombre) partes.push(`${k === "anterior" ? "antes" : "ahora"}: ${String(nombre)}`);
    } else if (v !== null && typeof v !== "object") partes.push(`${k.replace(/_/g, " ")}: ${String(v)}`);
  }
  return partes.join(" · ");
}

export function Auditoria() {
  const { sesion } = useTablero();
  const [filtro, setFiltro] = useState<FiltroAuditoria>({});
  const [filas, setFilas] = useState<FilaAuditoria[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async (antes?: number) => {
    try {
      const nuevas = await fuente.auditoria(sesion, { ...filtro, antes });
      setFilas((f) => (antes ? [...f, ...nuevas] : nuevas));
      setHayMas(nuevas.length >= 50);
      setError("");
    } catch (e) { setError((e as Error).message); }
  }, [sesion, filtro]);
  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <section className="tarjeta pila" aria-label="Auditoría" style={{ marginTop: 16 }}>
      <h2>Auditoría</h2>
      <p className="tenue" style={{ fontSize: 13 }}>Quién hizo qué y cuándo. Se ocultan teléfonos, correos y cédulas. Las salidas de datos y las cédulas vistas van marcadas.</p>
      <div className="fila" style={{ gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        <label className="campo">Acción
          <select value={filtro.accion ?? ""} onChange={(e) => setFiltro({ ...filtro, accion: e.target.value || undefined })}>
            <option value="">Todas</option>
            {Object.entries(NOMBRE_ACCION).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
        </label>
        <label className="campo">Desde<input type="date" value={filtro.desde ?? ""} onChange={(e) => setFiltro({ ...filtro, desde: e.target.value || undefined })} /></label>
        <label className="campo">Hasta<input type="date" value={filtro.hasta ?? ""} onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value || undefined })} /></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="tabla-envoltura">
        <table aria-label="Registro de auditoría">
          <thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Detalle</th></tr></thead>
          <tbody>
            {filas.map((a) => (
              <tr key={a.id}>
                <td style={{ whiteSpace: "nowrap" }}>{fechaHora(a.en)}</td>
                <td>{a.usuario}</td>
                <td>{ACCIONES_SENSIBLES.has(a.accion) ? <span className="sello ambar">{nombreAccion(a.accion)}</span> : nombreAccion(a.accion)}
                  {["insert", "update", "delete"].includes(a.accion) && <span className="tenue"> ({a.entidad.replace(/_/g, " ")})</span>}</td>
                <td className="tenue" style={{ fontSize: 13 }}>{resumenDetalle(a.detalle)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filas.length && !error && <p className="tenue">No hay registros con ese filtro.</p>}
      {hayMas && <div><button className="btn btn-chico" onClick={() => void cargar(filas[filas.length - 1]?.id)}>Ver más</button></div>}
    </section>
  );
}

export function ErroresDelPanel() {
  const { sesion } = useTablero();
  const [errores, setErrores] = useState<ErrorAgrupado[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { fuente.erroresRecientes(sesion).then(setErrores).catch((e: Error) => setError(e.message)); }, [sesion]);
  return (
    <section className="tarjeta pila" aria-label="Errores del panel" style={{ marginTop: 16 }}>
      <h2>Errores del panel</h2>
      <p className="tenue" style={{ fontSize: 13 }}>Fallas de los últimos 30 días, agrupadas. Se guardan aquí mismo, sin servicios externos, y sin celulares, cédulas ni correos.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {errores?.length === 0 && <p className="tenue">Sin errores en los últimos 30 días.</p>}
      {errores?.map((e) => (
        <details key={e.mensaje} className="fila-ocr">
          <summary><strong>{e.mensaje}</strong> <span className="tenue">· {e.veces} {e.veces === 1 ? "vez" : "veces"}, {e.personas} {e.personas === 1 ? "persona" : "personas"}, la última el {fechaHora(e.ultima)}</span></summary>
          <span className="etiqueta">Versión {e.version || "—"} · {e.ruta || "—"}</span>
          {e.pila && <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, margin: 0 }}>{e.pila}</pre>}
        </details>
      ))}
    </section>
  );
}

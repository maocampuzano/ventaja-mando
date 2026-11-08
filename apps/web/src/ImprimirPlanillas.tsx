// Imprimir planillas para un líder: cada lote queda registrado y cada hoja lleva su QR (lote + hoja) y el texto de
// autorización con el que salió. El PDF se arma en el navegador; los datos no pasan por ningún servicio externo.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  FILAS_POR_HOJA, FINALIDADES, MAX_HOJAS_POR_LOTE, TEXTO_AUTORIZACION_ES_BORRADOR, fecha, miles, nombreArchivoPlanilla,
  textoAutorizacion, type Finalidad,
} from "@ventaja/nucleo";
import { fuente } from "./datos/index";
import { useTablero } from "./datos/contexto";
import type { LotePlanilla } from "./datos/tipos";

function descargar(bytes: Uint8Array, nombre: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function ImprimirPlanillas() {
  const { sesion, lideres, zonaDe } = useTablero();
  const ordenados = [...lideres].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const [liderId, setLiderId] = useState(ordenados[0]?.id ?? "");
  const [hojas, setHojas] = useState(5);
  const [finalidades, setFinalidades] = useState<Finalidad[]>(FINALIDADES.map((f) => f.id));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState("");
  const [lotes, setLotes] = useState<LotePlanilla[] | null>(null);

  const cargar = useCallback(() => {
    fuente.lotesPlanilla(sesion).then(setLotes).catch((e: Error) => setError(e.message));
  }, [sesion]);
  useEffect(cargar, [cargar]);

  async function generar(e: FormEvent) {
    e.preventDefault();
    const lider = lideres.find((l) => l.id === liderId);
    if (!lider) { setError("Elija un líder."); return; }
    setOcupado(true); setError(""); setListo("");
    try {
      const texto = textoAutorizacion(sesion.campana.candidato, finalidades);
      const lote = await fuente.crearLotePlanilla(sesion, { liderId, hojas, finalidades, texto });
      const { generarPlanillaPdf } = await import("./planilla/pdf");
      const bytes = await generarPlanillaPdf({
        loteId: lote.id, numero: lote.numero, hojas, candidato: sesion.campana.candidato, cargo: sesion.campana.cargo,
        lider: lider.nombre, zona: zonaDe(lider.zonaId)?.nombre ?? "", textoAutorizacion: texto,
        borrador: TEXTO_AUTORIZACION_ES_BORRADOR, generado: new Date(),
      });
      const nombre = nombreArchivoPlanilla(lote.numero, lider.nombre);
      descargar(bytes, nombre);
      setListo(`Lote ${lote.numero} listo: ${hojas} ${hojas === 1 ? "hoja" : "hojas"} para ${lider.nombre} (${nombre}).`);
      cargar();
    } catch (x) { setError((x as Error).message); } finally { setOcupado(false); }
  }

  if (!lideres.length) {
    return <section className="tarjeta pila" aria-label="Imprimir planillas"><h2>Imprimir planillas</h2>
      <p className="tenue">No hay líderes en su alcance todavía.</p></section>;
  }

  return (
    <section className="tarjeta pila" aria-label="Imprimir planillas">
      <h2>Imprimir planillas</h2>
      <p className="tenue">Cada hoja trae un código QR que dice de qué lote es y qué hoja es. Así, al escanearla, la foto queda
        con su líder sin digitar nada. El código no lleva nombres ni datos de nadie.</p>
      <form className="pila" onSubmit={generar}>
        <label className="campo">Líder
          <select value={liderId} onChange={(e) => setLiderId(e.target.value)}>
            {ordenados.map((l) => <option key={l.id} value={l.id}>{l.nombre} · {zonaDe(l.zonaId)?.nombre ?? "sin zona"}</option>)}
          </select>
        </label>
        <label className="campo">Hojas (de 1 a {MAX_HOJAS_POR_LOTE}; {FILAS_POR_HOJA} personas por hoja)
          <input type="number" min={1} max={MAX_HOJAS_POR_LOTE} required value={hojas}
            onChange={(e) => setHojas(Math.trunc(Number(e.target.value)))} />
        </label>
        <fieldset className="campo zonas-elegir">
          <legend>Para qué autoriza cada persona (al menos una)</legend>
          {FINALIDADES.map((f) => (
            <label key={f.id} className="fila">
              <input type="checkbox" checked={finalidades.includes(f.id)}
                onChange={(e) => setFinalidades(e.target.checked ? [...finalidades, f.id] : finalidades.filter((x) => x !== f.id))} />
              {f.nombre}
            </label>
          ))}
        </fieldset>
        {TEXTO_AUTORIZACION_ES_BORRADOR && (
          <p className="aviso">El texto de autorización es un borrador sin revisión jurídica. Cada hoja lo advierte en rojo: no la use con personas reales hasta que lo apruebe el abogado.</p>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        {listo && <p className="aviso" role="status">{listo}</p>}
        <button className="btn btn-primario" type="submit" disabled={ocupado || !finalidades.length || !(hojas >= 1 && hojas <= MAX_HOJAS_POR_LOTE)}>
          {ocupado ? "Generando…" : `Descargar ${miles(hojas * FILAS_POR_HOJA)} renglones en PDF`}
        </button>
      </form>

      <h3>Lotes impresos</h3>
      {!lotes ? <p className="tenue">Cargando…</p> : !lotes.length ? <p className="tenue">Todavía no se ha impreso ningún lote.</p> : (
        <div className="tabla-envoltura">
          <table aria-label="Lotes impresos">
            <thead><tr><th className="num">Lote</th><th>Líder</th><th className="num">Hojas</th><th>Fecha</th></tr></thead>
            <tbody>
              {lotes.map((l) => (
                <tr key={l.id}><td className="num">{l.numero}</td><td>{l.lider}</td><td className="num">{l.hojas}</td><td className="tenue">{fecha(l.generado)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

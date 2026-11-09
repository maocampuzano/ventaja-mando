// Finanzas de la campaña (fase 6): libro de ingresos y gastos con los códigos del formulario 5B del CNE, tope de
// gastos, alertas y exportación para el contador. La dirección registra; la candidata (responsable legal) ve.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CODIGOS_FINANZAS, FUENTES_PROHIBIDAS, codigoFinanzas, fecha, libroCsv, moneda, pct, resumenCsv, resumenFinanzas, revisarAporte,
  type FuenteProhibida, type TipoMovimiento,
} from "@ventaja/nucleo";
import { Barra } from "./comunes";
import { useTablero } from "./datos/contexto";
import { fuente } from "./datos/index";
import type { Finanzas as DatosFinanzas } from "./datos/tipos";

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const numero = (s: string) => Number(s.replace(/\D/g, "")) || 0;

function descargar(nombre: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Finanzas() {
  const { sesion } = useTablero();
  const direccion = sesion.rol === "administrador" || sesion.rol === "gerente";
  const [datos, setDatos] = useState<DatosFinanzas | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [filtro, setFiltro] = useState<"todos" | TipoMovimiento>("todos");
  const [tope, setTope] = useState("");

  const cargar = useCallback(() => {
    fuente.finanzas(sesion).then((d) => { setDatos(d); setTope(d.tope ? String(d.tope) : ""); }).catch((e: Error) => setError(e.message));
  }, [sesion]);
  useEffect(cargar, [cargar]);

  const resumen = useMemo(() => datos && resumenFinanzas(datos.movimientos, datos.tope), [datos]);

  async function hacer(accion: () => Promise<void>, exito: string) {
    setError(""); setAviso("");
    try { await accion(); setAviso(exito); cargar(); } catch (e) { setError((e as Error).message); }
  }
  async function exportar() {
    setError(""); setAviso("");
    try {
      const r = await fuente.exportarLibro(sesion);
      const marca = `${sesion.campana.candidato} · Exportado por ${r.exportadoPor} el ${fecha(r.exportadoEn)} · ref. ${r.referencia} · Uso exclusivo del contador de la campaña`;
      descargar(`libro-ingresos-gastos-${r.referencia}.csv`, libroCsv(r.filas, marca));
      if (resumen) descargar(`resumen-5B-${r.referencia}.csv`, resumenCsv(resumen, marca));
      setAviso(`Exportado con la referencia ${r.referencia}. La exportación queda registrada en la auditoría.`);
    } catch (e) { setError((e as Error).message); }
  }

  if (!datos || !resumen) return <div className="pagina">{error ? <p className="error" role="alert">{error}</p> : <p className="tenue">Cargando las finanzas…</p>}</div>;
  const lista = datos.movimientos.filter((m) => filtro === "todos" || m.tipo === filtro);

  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>Finanzas</h1>
          <p className="tenue">Libro de ingresos y gastos con los códigos del formulario 5B del CNE. El informe oficial se presenta en Cuentas Claras: aquí la campaña lleva sus cuentas al día y le entrega el libro al contador.</p>
        </div>
        {direccion && (
          <div className="fila" style={{ gap: 8 }}>
            <button className="btn" onClick={exportar}>Exportar para el contador</button>
            {!nuevo && <button className="btn btn-primario" onClick={() => setNuevo(true)}>Registrar movimiento</button>}
          </div>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {aviso && <p className="aviso" role="status">{aviso}</p>}
      {resumen.alertas.map((a) => <p key={a.texto} className={`sello ${a.nivel}`} style={{ whiteSpace: "normal", marginBottom: 8 }}>{a.texto}</p>)}

      <div className="rejilla" style={{ marginBottom: 16 }}>
        <div className="tarjeta"><div className="etiqueta">Ingresos</div><div className="dato">{moneda(resumen.ingresos)}</div><p className="tenue">{moneda(resumen.privados)} de origen privado</p></div>
        <div className="tarjeta"><div className="etiqueta">Gastos</div><div className="dato">{moneda(resumen.gastos)}</div><p className="tenue">Saldo: {moneda(resumen.saldo)}</p></div>
        <div className="tarjeta">
          <div className="etiqueta">Tope de gastos del CNE</div>
          <div className="dato">{datos.tope ? pct(resumen.usoTope ?? 0) : "—"}</div>
          {datos.tope && <Barra valor={Math.min(1, resumen.usoTope ?? 0)} color={(resumen.usoTope ?? 0) >= 0.95 ? "var(--rojo)" : (resumen.usoTope ?? 0) >= 0.8 ? "var(--ambar)" : undefined} />}
          {direccion ? (
            <div className="fila" style={{ gap: 6, marginTop: 8 }}>
              <input className="btn btn-chico" style={{ flex: 1, textAlign: "left" }} aria-label="Tope de gastos en pesos" inputMode="numeric"
                value={tope ? moneda(numero(tope)) : ""} placeholder="$ 0" onChange={(e) => setTope(String(numero(e.target.value)))} />
              <button className="btn btn-chico" disabled={!numero(tope) || numero(tope) === datos.tope}
                onClick={() => hacer(() => fuente.configurarTope(sesion, numero(tope)), "Tope de gastos guardado.")}>Guardar</button>
            </div>
          ) : <p className="tenue">{datos.tope ? moneda(datos.tope) : "Sin configurar"}</p>}
        </div>
      </div>

      {nuevo && <NuevoMovimiento datos={datos} alCerrar={() => setNuevo(false)} alGuardar={() => { setNuevo(false); setAviso("Movimiento registrado."); cargar(); }} />}

      <div className="escenario" style={{ gridTemplateColumns: "minmax(0,1fr) 340px" }}>
        <section className="tarjeta pila" aria-label="Movimientos">
          <div className="fila entre">
            <h2>Movimientos</h2>
            <select className="btn btn-chico" aria-label="Filtrar movimientos" value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
              <option value="todos">Todos</option><option value="ingreso">Ingresos</option><option value="gasto">Gastos</option>
            </select>
          </div>
          <div className="tabla-envoltura">
            <table aria-label="Libro de ingresos y gastos">
              <thead><tr><th>Fecha</th><th>Código</th><th>Concepto</th><th>Tercero</th><th className="num">Valor</th><th>Soporte</th>{direccion && <th />}</tr></thead>
              <tbody>
                {lista.map((m) => (
                  <tr key={m.id}>
                    <td>{fecha(m.fecha)}</td>
                    <td title={codigoFinanzas(m.codigo)?.nombre}>{m.codigo}</td>
                    <td>{m.concepto || codigoFinanzas(m.codigo)?.nombre}{m.forma === "especie" && <span className="tenue"> (en especie)</span>}</td>
                    <td>{m.tercero ?? "—"}</td>
                    <td className="num" style={{ color: m.tipo === "gasto" ? "var(--rojo)" : undefined }}>{m.tipo === "gasto" ? "−" : ""}{moneda(m.valor)}</td>
                    <td>{m.soporte
                      ? <button className="btn btn-chico" onClick={() => fuente.verSoporte(sesion, m.id).then((u) => u ? window.open(u, "_blank", "noopener") : setAviso("En la demostración no hay archivos de soporte."))}>Ver</button>
                      : <span className="sello ambar">Falta</span>}</td>
                    {direccion && <td><button className="btn btn-chico" onClick={() => { if (window.confirm("¿Anular este movimiento? Queda registrado en la auditoría.")) void hacer(() => fuente.anularMovimiento(sesion, m.id), "Movimiento anulado."); }}>Anular</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!lista.length && <p className="tenue">No hay movimientos.</p>}
        </section>
        <aside className="tarjeta pila" aria-label="Resumen por código">
          <h2>Resumen por código</h2>
          <p className="tenue" style={{ fontSize: 13 }}>Así se ve en el formulario 5B.</p>
          {CODIGOS_FINANZAS.map((c) => (
            <div key={c.codigo} className="fila entre" style={{ fontSize: 13 }}>
              <span title={c.detalle}><strong>{c.codigo}</strong> {c.nombre}</span>
              <span className="num">{moneda(resumen.porCodigo[c.codigo] ?? 0)}</span>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

function NuevoMovimiento({ datos, alCerrar, alGuardar }: { datos: DatosFinanzas; alCerrar: () => void; alGuardar: () => void }) {
  const { sesion } = useTablero();
  const [tipo, setTipo] = useState<TipoMovimiento>("gasto");
  const [codigo, setCodigo] = useState(208);
  const [fechaMov, setFechaMov] = useState(hoy());
  const [valor, setValor] = useState("");
  const [concepto, setConcepto] = useState("");
  const [forma, setForma] = useState<"dinero" | "especie">("dinero");
  const [parentesco, setParentesco] = useState("");
  const [terceroId, setTerceroId] = useState("");
  const [nuevoTercero, setNuevoTercero] = useState({ tipoPersona: "natural" as "natural" | "juridica", nombre: "", documento: "" });
  const [acta, setActa] = useState("");
  const [verif, setVerif] = useState<Partial<Record<FuenteProhibida, boolean>>>({});
  const [soporte, setSoporte] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const def = codigoFinanzas(codigo);
  const esAporte = codigo === 102;
  const usaTercero = esAporte || tipo === "gasto";
  const tercero = datos.terceros.find((t) => t.id === terceroId);
  const tipoPersona = tercero?.tipoPersona ?? nuevoTercero.tipoPersona;
  const yaAportado = datos.movimientos.filter((m) => m.codigo === 102 && m.terceroId === terceroId && terceroId).reduce((a, m) => a + m.valor, 0);
  const erroresAporte = esAporte ? revisarAporte({
    valor: numero(valor), tipoPersona, documento: tercero ? "x" : nuevoTercero.documento, acta, verificaciones: verif,
  }, yaAportado, datos.tope) : [];

  function cambiarTipo(t: TipoMovimiento) { setTipo(t); setCodigo(t === "ingreso" ? 101 : 208); }

  async function guardar() {
    setGuardando(true); setError("");
    try {
      let id: string | null = terceroId || null;
      if (usaTercero && !id && (nuevoTercero.nombre.trim() || nuevoTercero.documento.trim())) {
        id = await fuente.registrarTercero(sesion, nuevoTercero);
      }
      await fuente.registrarMovimiento(sesion, {
        codigo, fecha: fechaMov, valor: numero(valor), concepto, forma, terceroId: id,
        parentesco: codigo === 101 ? parentesco : undefined, acta: esAporte && tipoPersona === "juridica" ? acta : undefined,
        verificacion: esAporte ? verif : undefined, soporte,
      });
      alGuardar();
    } catch (e) { setError((e as Error).message); } finally { setGuardando(false); }
  }

  return (
    <section className="tarjeta pila" aria-label="Registrar movimiento" style={{ marginBottom: 16 }}>
      <div className="fila entre"><h2>Registrar movimiento</h2><button className="btn btn-chico" onClick={alCerrar}>Cerrar</button></div>
      <div className="fila" style={{ gap: 16 }}>
        <label className="fila" style={{ gap: 6 }}><input type="radio" name="tipo" checked={tipo === "ingreso"} onChange={() => cambiarTipo("ingreso")} />Ingreso</label>
        <label className="fila" style={{ gap: 6 }}><input type="radio" name="tipo" checked={tipo === "gasto"} onChange={() => cambiarTipo("gasto")} />Gasto</label>
      </div>
      <label className="campo">Código del CNE
        <select value={codigo} onChange={(e) => setCodigo(Number(e.target.value))}>
          {CODIGOS_FINANZAS.filter((c) => c.tipo === tipo).map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>)}
        </select>
      </label>
      {def && <p className="etiqueta">{def.detalle}{def.anexo ? ` Va en el anexo ${def.anexo}.` : ""}</p>}
      <div className="rejilla" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <label className="campo">Fecha<input type="date" value={fechaMov} onChange={(e) => setFechaMov(e.target.value)} /></label>
        <label className="campo">Valor<input inputMode="numeric" value={valor ? moneda(numero(valor)) : ""} placeholder="$ 0" onChange={(e) => setValor(String(numero(e.target.value)))} /></label>
        <label className="campo">Forma
          <select value={forma} onChange={(e) => setForma(e.target.value as "dinero" | "especie")}><option value="dinero">Dinero</option><option value="especie">En especie (a valor comercial)</option></select>
        </label>
      </div>
      <label className="campo">Concepto<input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Qué fue, en pocas palabras" /></label>
      {codigo === 101 && <label className="campo">De quién son los recursos<input value={parentesco} onChange={(e) => setParentesco(e.target.value)} placeholder="La candidata, su cónyuge, su hermano…" /></label>}

      {usaTercero && (
        <fieldset className="campo-formulario">
          <legend>{esAporte ? "Quién aporta (obligatorio: nada anónimo)" : "Proveedor (opcional)"}</legend>
          {datos.terceros.length > 0 && (
            <label className="campo">Registrado antes
              <select value={terceroId} onChange={(e) => setTerceroId(e.target.value)}>
                <option value="">Uno nuevo…</option>
                {datos.terceros.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </label>
          )}
          {!terceroId && (
            <div className="rejilla" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              <label className="campo">Tipo de persona
                <select value={nuevoTercero.tipoPersona} onChange={(e) => setNuevoTercero({ ...nuevoTercero, tipoPersona: e.target.value as "natural" | "juridica" })}>
                  <option value="natural">Natural</option><option value="juridica">Jurídica</option>
                </select>
              </label>
              <label className="campo">Nombre o razón social<input value={nuevoTercero.nombre} onChange={(e) => setNuevoTercero({ ...nuevoTercero, nombre: e.target.value })} /></label>
              <label className="campo">Cédula o NIT<input inputMode="numeric" value={nuevoTercero.documento} onChange={(e) => setNuevoTercero({ ...nuevoTercero, documento: e.target.value })} /></label>
            </div>
          )}
          {esAporte && tipoPersona === "juridica" && <label className="campo">Número del acta que aprobó el aporte<input value={acta} onChange={(e) => setActa(e.target.value)} /></label>}
        </fieldset>
      )}

      {esAporte && (
        <fieldset className="campo-formulario">
          <legend>Fuentes prohibidas (Ley 1475 de 2011, art. 27): confirme cada una</legend>
          {FUENTES_PROHIBIDAS.map((f) => (
            <label key={f.id} className="fila" style={{ gap: 8, alignItems: "flex-start", fontSize: 13 }}>
              <input type="checkbox" checked={!!verif[f.id]} onChange={(e) => setVerif({ ...verif, [f.id]: e.target.checked })} />{f.texto}
            </label>
          ))}
        </fieldset>
      )}

      <label className="campo">Soporte (factura, recibo o acta en PDF, JPG o PNG)
        <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setSoporte(e.target.files?.[0] ?? null)} />
      </label>
      {erroresAporte.map((e) => <p key={e} className="error">{e}</p>)}
      {error && <p className="error" role="alert">{error}</p>}
      <div><button className="btn btn-primario" disabled={guardando || !numero(valor) || erroresAporte.length > 0} onClick={guardar}>Registrar</button></div>
    </section>
  );
}

// Importación de una base en Excel o CSV: archivo → columnas y autorización → revisión → resultado.
// El archivo no sale del navegador: solo se envían las filas listas, y la cédula viaja para cifrarse en la base.
import { useMemo, useState } from "react";
import {
  camposImportacion, leerCsv, miles, prepararImportacion, reconocerColumnas, veTodaLaCampana,
  type CampoImportacion, type Importacion, type MapaColumnas,
} from "@ventaja/nucleo";
import { fuente } from "./datos";
import { useTablero } from "./datos/contexto";
import type { ResultadoImportacion } from "./datos/tipos";

const FINALIDADES = [
  { id: "contacto_campana", nombre: "Contacto de la campaña (llamadas, SMS y correo)" },
  { id: "actividades_territorio", nombre: "Invitaciones a actividades en su territorio" },
];
const MAX_LISTA = 200;

const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

/** Convierte una celda de Excel a texto. Las fechas quedan en aaaa-mm-dd; los números, sin notación científica. */
function aTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  return String(v);
}

async function leerArchivo(archivo: File): Promise<string[][]> {
  if (/\.csv$/i.test(archivo.name)) return leerCsv(await archivo.text());
  if (!/\.xlsx$/i.test(archivo.name)) throw new Error("Use un archivo .xlsx (Excel) o .csv. Si es .xls antiguo, ábralo en Excel y guárdelo como .xlsx.");
  const { readSheet } = await import("read-excel-file/universal");
  const filas = await readSheet(archivo);
  return filas.map((f) => f.map(aTexto)).filter((f) => f.some((c) => c.trim() !== ""));
}

export function Importar() {
  const { sesion, zonas, lideres, modo } = useTablero();
  const [archivo, setArchivo] = useState<{ nombre: string; encabezados: string[]; filas: string[][] } | null>(null);
  const [mapa, setMapa] = useState<MapaColumnas>({});
  const [finalidades, setFinalidades] = useState<string[]>(["contacto_campana"]);
  const [evidencia, setEvidencia] = useState("");
  const [error, setError] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [avance, setAvance] = useState<[number, number] | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);

  const zonaObligatoria = !veTodaLaCampana(sesion.rol);
  const reporte: Importacion | null = useMemo(() => archivo && prepararImportacion(archivo.filas, mapa, {
    zonas: zonas.map((z) => ({ id: z.id, nombre: z.nombre })),
    lideres: lideres.map((l) => ({ id: l.id, nombre: l.nombre })),
    zonaObligatoria,
    hoy: hoyBogota(),
  }), [archivo, mapa, zonas, lideres, zonaObligatoria]);

  async function elegir(f: File | undefined) {
    if (!f) return;
    setError(""); setResultado(null); setLeyendo(true);
    try {
      const [encabezados, ...filas] = await leerArchivo(f);
      if (!encabezados || !filas.length) throw new Error("El archivo no tiene filas debajo del encabezado.");
      setArchivo({ nombre: f.name, encabezados, filas });
      setMapa(reconocerColumnas(encabezados));
    } catch (e) {
      setArchivo(null);
      setError((e as Error).message || "No se pudo leer el archivo.");
    } finally { setLeyendo(false); }
  }

  async function importar() {
    if (!reporte || !archivo) return;
    setError(""); setAvance([0, reporte.listas.length]);
    try {
      setResultado(await fuente.importarPersonas(sesion, reporte.listas,
        { finalidades, evidencia: evidencia.trim(), archivo: archivo.nombre }, (h, t) => setAvance([h, t])));
    } catch (e) { setError((e as Error).message); } finally { setAvance(null); }
  }

  const puedeImportar = !!reporte && !reporte.faltanColumnas.length && reporte.listas.length > 0
    && finalidades.length > 0 && evidencia.trim().length >= 5 && !avance;
  const nombreCampo = (c: CampoImportacion) => camposImportacion.find((x) => x.campo === c)!.nombre;

  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>Importar una base</h1>
          <p className="tenue">Suba un Excel o un CSV. Antes de guardar, se revisa fila por fila y se explica qué entra, qué no y por qué.</p>
        </div>
      </div>

      {resultado ? (
        <section className="tarjeta pila" aria-label="Resultado de la importación">
          <h2>{resultado.guardado ? "Importación terminada" : "Simulación terminada"}</h2>
          {!resultado.guardado && <p className="aviso">Modo demostración: no se guardó nada. En el producto, estas personas quedarían en la base con su autorización.</p>}
          <div className="rejilla">
            <div><div className="etiqueta">Personas nuevas</div><div className="dato">{miles(resultado.creadas)}</div></div>
            <div><div className="etiqueta">Ya estaban en la base</div><div className="dato">{miles(resultado.yaExistian)}</div></div>
            <div><div className="etiqueta">Rechazadas al guardar</div><div className="dato">{miles(resultado.rechazos.length - resultado.yaExistian)}</div></div>
          </div>
          <Lista titulo="Filas que la base no aceptó" items={resultado.rechazos.map((r) => ({ numero: r.numero, mensaje: r.motivo }))} />
          <button className="btn" style={{ justifySelf: "start" }} onClick={() => { setArchivo(null); setResultado(null); setEvidencia(""); }}>Importar otro archivo</button>
        </section>
      ) : (
        <div className="pila">
          <section className="tarjeta pila" aria-label="Archivo">
            <h2>1. El archivo</h2>
            <p className="tenue">Debe traer una fila de encabezados. Columnas obligatorias: nombre y si la persona autorizó el uso de sus datos{zonaObligatoria ? ", y la zona" : ""}. Lo demás es opcional.</p>
            <label className="btn" style={{ justifySelf: "start" }}>
              {leyendo ? "Leyendo…" : archivo ? "Cambiar archivo" : "Elegir archivo"}
              <input type="file" accept=".xlsx,.csv" className="oculto" aria-label="Archivo para importar" onChange={(e) => elegir(e.target.files?.[0])} />
            </label>
            {archivo && <p><strong>{archivo.nombre}</strong> <span className="tenue">· {miles(archivo.filas.length)} filas</span></p>}
          </section>

          {archivo && reporte && (
            <>
              <section className="tarjeta pila" aria-label="Columnas">
                <h2>2. Qué es cada columna</h2>
                <p className="tenue">Las reconocimos solas; corrija si alguna quedó mal.</p>
                <div className="rejilla" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                  {camposImportacion.map((c) => (
                    <label key={c.campo} className="campo">{c.nombre} <span className="tenue">{c.ayuda}</span>
                      <select value={mapa[c.campo] ?? ""} onChange={(e) => setMapa({ ...mapa, [c.campo]: e.target.value === "" ? undefined : Number(e.target.value) })}>
                        <option value="">— No viene en el archivo —</option>
                        {archivo.encabezados.map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                {reporte.faltanColumnas.length > 0 && (
                  <p className="error" role="alert">Falta indicar: {reporte.faltanColumnas.map(nombreCampo).join(", ")}. Sin la columna de autorización no se puede importar a nadie (Ley 1581 de 2012).</p>
                )}
              </section>

              <section className="tarjeta pila" aria-label="Autorización">
                <h2>3. La autorización que firmaron</h2>
                <p className="tenue">Cada persona queda con un registro de autorización: estas finalidades, el canal «importación», la fecha del archivo (o la de hoy) y esta evidencia.</p>
                {FINALIDADES.map((f) => (
                  <label key={f.id} className="fila">
                    <input type="checkbox" checked={finalidades.includes(f.id)}
                      onChange={(e) => setFinalidades(e.target.checked ? [...finalidades, f.id] : finalidades.filter((x) => x !== f.id))} />
                    {f.nombre}
                  </label>
                ))}
                <label className="campo">Dónde está la prueba de la autorización
                  <input value={evidencia} onChange={(e) => setEvidencia(e.target.value)} placeholder="Ej.: planillas físicas firmadas, archivadas en la sede de la campaña" />
                </label>
              </section>

              {!reporte.faltanColumnas.length && (
                <section className="tarjeta pila" aria-label="Revisión">
                  <h2>4. Revisión</h2>
                  <div className="rejilla">
                    <div><div className="etiqueta">Listas para importar</div><div className="dato" data-prueba="listas">{miles(reporte.listas.length)}</div></div>
                    <div><div className="etiqueta">No entran</div><div className="dato" data-prueba="rechazadas">{miles(reporte.rechazadas.length)}</div></div>
                    <div><div className="etiqueta">Cédulas repetidas en el archivo</div><div className="dato" data-prueba="duplicados">{miles(reporte.duplicados.filter((d) => d.accion === "rechazada").length)}</div></div>
                    <div><div className="etiqueta">Posibles duplicados para revisar</div><div className="dato" data-prueba="revisar">{miles(reporte.duplicados.filter((d) => d.accion === "revisar").length)}</div></div>
                    <div><div className="etiqueta">Avisos</div><div className="dato">{miles(reporte.advertencias.length)}</div></div>
                  </div>
                  {reporte.duplicados.length > 0 && (
                    <details>
                      <summary>Por qué son duplicados ({miles(reporte.duplicados.length)})</summary>
                      <ul className="lista-filas">
                        {reporte.duplicados.slice(0, MAX_LISTA).map((d) => (
                          <li key={`${d.a}-${d.b}`}>Fila {d.b} con la fila {d.a}: {d.razones.join(", ")}. {d.accion === "rechazada" ? `Se importa solo la fila ${d.a}.` : "Entran las dos; la dirección de la campaña las verá en la revisión de duplicados para decidir si fusionarlas."}</li>
                        ))}
                      </ul>
                      {reporte.duplicados.length > MAX_LISTA && <p className="tenue">… y {miles(reporte.duplicados.length - MAX_LISTA)} más.</p>}
                    </details>
                  )}
                  <Lista titulo="Filas que no entran" items={reporte.rechazadas} />
                  <Lista titulo="Avisos (sí entran)" items={reporte.advertencias} />
                  {modo === "supabase" && <p className="aviso">Al guardar, la base también descarta las cédulas que ya tiene en su territorio. Las coincidencias con otras zonas las revisa la dirección de la campaña.</p>}
                  {error && <p className="error" role="alert">{error}</p>}
                  <div className="fila">
                    <button className="btn btn-primario" disabled={!puedeImportar} onClick={importar}>
                      {avance ? `Guardando ${miles(avance[0])} de ${miles(avance[1])}…` : `Importar ${miles(reporte.listas.length)} personas`}
                    </button>
                    {!puedeImportar && !avance && reporte.listas.length > 0 && <span className="tenue">Marque al menos una finalidad y escriba dónde está la prueba de la autorización.</span>}
                  </div>
                </section>
              )}
            </>
          )}
          {!archivo && error && <p className="error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}

function Lista({ titulo, items }: { titulo: string; items: { numero: number; mensaje: string }[] }) {
  if (!items.length) return null;
  return (
    <details>
      <summary>{titulo} ({miles(items.length)})</summary>
      <ul className="lista-filas">
        {items.slice(0, MAX_LISTA).map((x, i) => <li key={`${x.numero}-${i}`}><strong>Fila {x.numero}:</strong> {x.mensaje}</li>)}
      </ul>
      {items.length > MAX_LISTA && <p className="tenue">… y {miles(items.length - MAX_LISTA)} más.</p>}
    </details>
  );
}

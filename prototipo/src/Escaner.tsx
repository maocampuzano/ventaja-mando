import { useEffect, useState } from "react";
import { filasPlanilla } from "./data";

type Paso = "foto" | "leyendo" | "revisar" | "listo";
const orden: Paso[] = ["foto", "leyendo", "revisar", "listo"];

export function Escaner() {
  const [paso, setPaso] = useState<Paso>("foto");
  const [filas, setFilas] = useState(() => filasPlanilla.map((f) => ({ ...f, descartada: false, corregida: false })));

  useEffect(() => {
    if (paso !== "leyendo") return;
    const t = setTimeout(() => setPaso("revisar"), 1900);
    return () => clearTimeout(t);
  }, [paso]);

  const pendientes = filas.filter((f) => !f.descartada && f.duda && !f.corregida).length;
  const validas = filas.filter((f) => !f.descartada).length;
  const reiniciar = () => { setPaso("foto"); setFilas(filasPlanilla.map((f) => ({ ...f, descartada: false, corregida: false }))); };

  return (
    <>
      <div className="pasos" aria-label={`Paso ${orden.indexOf(paso) + 1} de 4`}>
        {orden.map((p, i) => <span key={p} className={`paso ${i <= orden.indexOf(paso) ? "hecho" : ""}`} />)}
      </div>

      {paso === "foto" && (
        <>
          <h2>Escanear planilla</h2>
          <p className="tenue" style={{ fontSize: 13 }}>Planilla de Yesenia Barrios, lote 14. El código de la esquina ya dice de quién es y a qué zona va.</p>
          <div className="planilla-foto" aria-label="Foto de una planilla escrita a mano (ejemplo)">
            {filasPlanilla.map((f, i) => <div key={i}>{i + 1}. {f.nombre.toLowerCase()} — {f.cedula}</div>)}
          </div>
          <button className="btn btn-primario" onClick={() => setPaso("leyendo")}>Tomar foto</button>
          <p className="etiqueta">Funciona sin señal: la foto se guarda en el teléfono y se lee al recuperar conexión.</p>
        </>
      )}

      {paso === "leyendo" && (
        <>
          <h2>Leyendo la planilla</h2>
          <div className="planilla-foto">
            {filasPlanilla.map((f, i) => <div key={i}>{i + 1}. {f.nombre.toLowerCase()} — {f.cedula}</div>)}
            <span className="escaneo" />
          </div>
          <p className="tenue" role="status">Reconociendo nombres, cédulas y celulares…</p>
        </>
      )}

      {paso === "revisar" && (
        <>
          <h2>Revise antes de enviar</h2>
          <p className="tenue" style={{ fontSize: 13 }}>
            {pendientes ? `${pendientes} filas tienen un dato que no se leyó bien.` : "Todo listo para enviar."} Lo marcado en ámbar hay que confirmarlo; nada entra a la base sin su revisión.
          </p>
          {filas.map((f, i) => (
            <div key={i} className={`fila-ocr ${f.descartada ? "" : f.duplicado ? "dup" : f.duda && !f.corregida ? "duda" : ""}`} style={{ opacity: f.descartada ? 0.45 : 1 }}>
              <strong>{f.nombre}</strong>
              <span>Cédula <span className={f.duda === "cedula" && !f.corregida ? "campo-duda" : ""}>{f.cedula}</span></span>
              <span>Celular <span className={f.duda === "celular" && !f.corregida ? "campo-duda" : ""}>{f.celular}</span>, {f.barrio}</span>
              {f.duplicado && !f.descartada && (
                <div className="fila entre"><span className="sello rojo">{f.duplicado}</span>
                  <button className="btn btn-chico" onClick={() => setFilas(filas.map((x, k) => k === i ? { ...x, descartada: true } : x))}>Descartar</button></div>
              )}
              {f.duda && !f.corregida && !f.descartada && (
                <div className="fila entre"><span className="sello ambar">Confianza {Math.round(f.confianza * 100)} %</span>
                  <button className="btn btn-chico" onClick={() => setFilas(filas.map((x, k) => k === i ? { ...x, corregida: true } : x))}>Ya lo corregí</button></div>
              )}
              {f.descartada && <span className="etiqueta">Descartada</span>}
            </div>
          ))}
          <button className="btn btn-primario" disabled={pendientes > 0} onClick={() => setPaso("listo")}>
            Enviar {validas} registros a revisión
          </button>
        </>
      )}

      {paso === "listo" && (
        <>
          <h2>Planilla enviada</h2>
          <p>{validas} registros quedaron como «pendientes de validar», con la foto de la planilla adjunta como soporte.</p>
          <p className="tenue" style={{ fontSize: 13 }}>La coordinación los valida con una llamada o una visita. Solo ahí suman a su meta.</p>
          <button className="btn" onClick={reiniciar}>Escanear otra planilla</button>
        </>
      )}
    </>
  );
}

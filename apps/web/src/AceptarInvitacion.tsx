// Pantalla a la que llega quien abre un enlace o QR de invitación (?invitacion=...).
import { useState, type FormEvent } from "react";
import type { FuenteDatos, Sesion } from "./datos/tipos";

export function AceptarInvitacion({ fuente, codigo, alEntrar, alNecesitar2fa }: {
  fuente: FuenteDatos; codigo: string; alEntrar: (s: Sesion) => void; alNecesitar2fa: () => void;
}) {
  const [tengoCuenta, setTengoCuenta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  async function aceptar(e?: FormEvent, crearCuenta = !tengoCuenta) {
    e?.preventDefault();
    setOcupado(true); setError("");
    const r = await fuente.aceptarInvitacion({ codigo, nombre, correo, clave, crearCuenta })
      .catch((x: Error) => ({ estado: "error" as const, mensaje: x.message }));
    setOcupado(false);
    if (r.estado === "ok") alEntrar(r.sesion);
    else if (r.estado === "falta-2fa" || r.estado === "inscribir-2fa") alNecesitar2fa();
    else if (r.estado === "confirmar-correo") setConfirmar(true);
    else setError(r.mensaje);
  }

  return (
    <main className="ingreso">
      <div className="ingreso-caja pila">
        <div><h1>Invitación a Ventaja Mando</h1><p className="tenue">Lo invitaron al equipo de una campaña. Use el mismo correo al que llegó la invitación.</p></div>
        {confirmar ? (
          <section className="tarjeta pila">
            <h2>Revise su correo</h2>
            <p className="tenue">Le enviamos un mensaje a <strong>{correo}</strong>. Abra el enlace que trae para confirmar su correo y luego vuelva aquí y pulse el botón.</p>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-primario" disabled={ocupado} onClick={() => aceptar(undefined, false)}>Ya confirmé mi correo</button>
          </section>
        ) : (
          <form className="tarjeta pila" onSubmit={aceptar}>
            <div className="pestanas" role="tablist">
              <button type="button" role="tab" className="pestana" aria-selected={!tengoCuenta} onClick={() => setTengoCuenta(false)}>Crear mi cuenta</button>
              <button type="button" role="tab" className="pestana" aria-selected={tengoCuenta} onClick={() => setTengoCuenta(true)}>Ya tengo cuenta</button>
            </div>
            {!tengoCuenta && (
              <label className="campo">Su nombre completo
                <input required minLength={3} autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </label>
            )}
            <label className="campo">Correo
              <input type="email" required autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} />
            </label>
            <label className="campo">{tengoCuenta ? "Contraseña" : "Contraseña nueva (mínimo 12 caracteres)"}
              <input type="password" required minLength={tengoCuenta ? 1 : 12} autoComplete={tengoCuenta ? "current-password" : "new-password"}
                value={clave} onChange={(e) => setClave(e.target.value)} />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-primario" type="submit" disabled={ocupado}>{ocupado ? "Un momento…" : "Aceptar la invitación"}</button>
            <p className="aviso">Al aceptar, la campaña podrá ver su nombre, su correo y su rol en el equipo. Sus datos se tratan según la política de datos de la campaña.</p>
          </form>
        )}
      </div>
    </main>
  );
}

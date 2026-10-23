import { useState, type FormEvent } from "react";
import { nombreRol } from "@ventaja/nucleo";
import { CLAVE_DEMO, CODIGO_2FA_DEMO, usuariosDemo } from "./datos/demo";
import type { FuenteDatos, Sesion } from "./datos/tipos";

export function InicioSesion({ fuente, alEntrar }: { fuente: FuenteDatos; alEntrar: (s: Sesion) => void }) {
  const [paso, setPaso] = useState<"clave" | "codigo">("clave");
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function entrar(c = correo, k = clave) {
    setOcupado(true); setError("");
    const r = await fuente.iniciarSesion(c, k).catch((e: Error) => ({ estado: "error" as const, mensaje: e.message }));
    setOcupado(false);
    if (r.estado === "ok") alEntrar(r.sesion);
    else if (r.estado === "falta-2fa") { setPaso("codigo"); setCodigo(""); }
    else setError(r.mensaje);
  }

  async function verificar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true); setError("");
    const r = await fuente.verificar2fa(codigo).catch((x: Error) => ({ estado: "error" as const, mensaje: x.message }));
    setOcupado(false);
    if (r.estado === "ok") alEntrar(r.sesion);
    else if (r.estado === "error") setError(r.mensaje);
  }

  return (
    <main className="ingreso">
      <div className="ingreso-caja pila">
        <div className="fila">
          <div className="marca" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="24" height="24"><path d="M8 9l8 15 8-15" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div><h1>Ventaja Mando</h1><p className="tenue">Centro de mando de la campaña</p></div>
        </div>

        {paso === "clave" ? (
          <form className="tarjeta pila" onSubmit={(e) => { e.preventDefault(); entrar(); }}>
            <h2>Entrar</h2>
            <label className="campo">Correo
              <input type="email" autoComplete="username" required value={correo} onChange={(e) => setCorreo(e.target.value)} />
            </label>
            <label className="campo">Contraseña
              <input type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-primario" type="submit" disabled={ocupado}>{ocupado ? "Entrando…" : "Entrar"}</button>
          </form>
        ) : (
          <form className="tarjeta pila" onSubmit={verificar}>
            <h2>Verificación en dos pasos</h2>
            <p className="tenue">Su rol puede ver toda la campaña. Escriba el código de 6 dígitos que muestra su app autenticadora (por ejemplo, Google Authenticator).</p>
            <label className="campo">Código
              <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required autoFocus value={codigo} onChange={(e) => setCodigo(e.target.value)} />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="fila">
              <button className="btn btn-primario" type="submit" disabled={ocupado}>{ocupado ? "Verificando…" : "Verificar"}</button>
              <button className="btn" type="button" onClick={() => { setPaso("clave"); setError(""); }}>Volver</button>
            </div>
          </form>
        )}

        {fuente.modo === "demo" && paso === "clave" && (
          <section className="tarjeta pila" aria-label="Usuarios de demostración">
            <h2>Modo demostración</h2>
            <p className="tenue">Datos ficticios de una campaña en Turbaco. Entre con cualquiera de estos usuarios: la contraseña es <code>{CLAVE_DEMO}</code> y, si le pide código, es <code>{CODIGO_2FA_DEMO}</code>.</p>
            {usuariosDemo.map((u) => (
              <button key={u.correo} className="sugerida usuario-demo" type="button" disabled={ocupado}
                onClick={() => { setCorreo(u.correo); setClave(CLAVE_DEMO); entrar(u.correo, CLAVE_DEMO); }}>
                <span><strong>{nombreRol[u.rol]}</strong> <span className="tenue">· {u.correo}</span></span>
                <span className="tenue">{u.descripcion}</span>
              </button>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

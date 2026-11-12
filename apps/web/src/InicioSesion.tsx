import { useState, type FormEvent } from "react";
import { Logo } from "./comunes";
import { nombreRol } from "@ventaja/nucleo";
import { CLAVE_DEMO, CODIGO_2FA_DEMO, usuariosDemo } from "./datos/demo";
import type { FuenteDatos, Sesion } from "./datos/tipos";

export function InicioSesion({ fuente, alEntrar, aviso }: { fuente: FuenteDatos; alEntrar: (s: Sesion) => void; aviso?: string }) {
  const [paso, setPaso] = useState<"clave" | "codigo">("clave");
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [inscripcion, setInscripcion] = useState<{ qr: string; secreto: string } | null>(null);

  async function entrar(c = correo, k = clave) {
    setOcupado(true); setError("");
    const r = await fuente.iniciarSesion(c, k).catch((e: Error) => ({ estado: "error" as const, mensaje: e.message }));
    setOcupado(false);
    if (r.estado === "ok") alEntrar(r.sesion);
    else if (r.estado === "falta-2fa") { setInscripcion(null); setPaso("codigo"); setCodigo(""); }
    else if (r.estado === "inscribir-2fa") { setInscripcion({ qr: r.qr, secreto: r.secreto }); setPaso("codigo"); setCodigo(""); }
    else if (r.estado === "error") setError(r.mensaje);
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
            <Logo />
          </div>
          <div><h1>Comando</h1><p className="tenue">De Ventaja Electoral. El centro de mando de su campaña.</p></div>
        </div>

        {aviso && <p className="aviso" role="status">{aviso}</p>}

        {fuente.modo === "demo" && paso === "clave" && fuente.entrarDemo && (
          <section className="tarjeta pila" aria-labelledby="demo-titulo">
            <h2 id="demo-titulo">Véalo por dentro</h2>
            <p className="tenue">Una campaña inventada a la Gobernación del Caquetá. Elija cómo quiere verla: cada rol entra a su propio espacio. No necesita contraseña.</p>
            {usuariosDemo.map((u) => (
              <button key={u.correo} className="sugerida usuario-demo" type="button" disabled={ocupado}
                onClick={async () => { const s = await fuente.entrarDemo!(u.rol); if (s) alEntrar(s); }}>
                <span><strong>{nombreRol[u.rol]}</strong></span>
                <span className="tenue">{u.descripcion}</span>
              </button>
            ))}
            <p className="tenue" style={{ fontSize: 12.5 }}>En una campaña real cada persona entra con su correo y su contraseña, y la dirección, además, con un código de su celular.</p>
          </section>
        )}

        {paso === "clave" ? (
          <form className="tarjeta pila" onSubmit={(e) => { e.preventDefault(); entrar(); }}>
            <h2>{fuente.modo === "demo" ? "Entrar con correo" : "Entrar"}</h2>
            {fuente.modo === "demo" && <p className="tenue">Para probar la entrada completa: cualquier correo de la demostración (por ejemplo, <code>gerente@demo.co</code>), contraseña <code>{CLAVE_DEMO}</code> y, si le pide código, <code>{CODIGO_2FA_DEMO}</code>.</p>}
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
            {inscripcion ? (
              <>
                <p className="tenue">Su rol puede ver toda la campaña, así que la primera vez debe vincular su celular. Es una sola vez:</p>
                <ol className="pila" style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Abra en su celular la app Google Authenticator o Microsoft Authenticator y toque «+» o «Agregar cuenta».</li>
                  <li>Elija «Escanear código QR» y apunte la cámara a este código.</li>
                  <li>La app mostrará «Comando» con un número de 6 dígitos que cambia cada 30 segundos. Escríbalo abajo.</li>
                </ol>
                <img className="qr-2fa" src={inscripcion.qr} alt="Código QR para vincular la app autenticadora" width={200} height={200} />
                <details>
                  <summary>No puedo escanear el código</summary>
                  <p className="tenue">En la app, elija «Ingresar una clave de configuración» y escriba esta clave: <code>{inscripcion.secreto}</code></p>
                </details>
              </>
            ) : (
              <p className="tenue">Su rol puede ver toda la campaña. Escriba el código de 6 dígitos que muestra su app autenticadora (por ejemplo, Google Authenticator).</p>
            )}
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

      </div>
    </main>
  );
}

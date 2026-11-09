// Página pública de baja: la abre quien recibió un SMS o correo de la campaña. Un solo paso, sin cuenta (regla 3).
import { useState } from "react";
import type { FuenteDatos } from "./datos/tipos";

export function Baja({ fuente, token }: { fuente: FuenteDatos; token: string }) {
  const [estado, setEstado] = useState<"inicio" | "enviando" | "listo" | "error">("inicio");
  const [campana, setCampana] = useState("");
  const [error, setError] = useState("");

  async function confirmar() {
    setEstado("enviando");
    try { setCampana(await fuente.darseDeBaja(token)); setEstado("listo"); }
    catch (e) { setError((e as Error).message); setEstado("error"); }
  }

  return (
    <main className="ingreso">
      <section className="tarjeta pila" style={{ maxWidth: 440 }} aria-label="Dejar de recibir mensajes">
        {estado === "listo" ? (
          <>
            <h1>Listo</h1>
            <p>La campaña {campana} no le volverá a enviar mensajes por SMS, correo ni otros medios.</p>
            <p className="tenue" style={{ fontSize: 13 }}>Si también quiere que borren sus datos, puede pedirlo directamente a la campaña (Ley 1581 de 2012).</p>
          </>
        ) : (
          <>
            <h1>Dejar de recibir mensajes</h1>
            <p>Al confirmar, la campaña deja de enviarle mensajes por cualquier medio.</p>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-primario" disabled={estado === "enviando"} onClick={confirmar}>
              {estado === "enviando" ? "Confirmando…" : "No quiero recibir más mensajes"}
            </button>
          </>
        )}
      </section>
    </main>
  );
}

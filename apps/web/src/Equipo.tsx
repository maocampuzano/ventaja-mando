// Equipo de la campaña: quién está, con qué rol y zonas, e invitaciones con enlace y QR por rol.
// La invitación es personal: va a un correo, y solo esa persona la puede aceptar (lo verifica la base).
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { enlaceWhatsAppManual, exige2fa, fecha, nombreRol, type RolCampana } from "@ventaja/nucleo";
import { fuente } from "./datos";
import { useTablero } from "./datos/contexto";
import type { InvitacionPendiente, Miembro } from "./datos/tipos";
import { Qr } from "./Qr";

const ROLES: RolCampana[] = ["administrador", "gerente", "candidato", "coordinador", "lider", "testigo"];
const conZonas = (r: RolCampana) => r === "coordinador" || r === "lider" || r === "testigo";

const enlaceInvitacion = (codigo: string) => `${location.origin}${location.pathname}?invitacion=${encodeURIComponent(codigo)}`;

export function Equipo() {
  const { sesion, zonas, zonaDe } = useTablero();
  const [equipo, setEquipo] = useState<{ miembros: Miembro[]; invitaciones: InvitacionPendiente[] } | null>(null);
  const [error, setError] = useState("");
  const [correo, setCorreo] = useState("");
  const [rol, setRol] = useState<RolCampana>("lider");
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [dias, setDias] = useState(7);
  const [ocupado, setOcupado] = useState(false);
  const [creada, setCreada] = useState<{ correo: string; rol: RolCampana; enlace: string } | null>(null);

  // Gerencia no invita administradores ni gerentes: eso lo hace un administrador (misma regla que la base).
  const rolesPermitidos = ROLES.filter((r) => sesion.rol === "administrador" || !exige2fa(r));
  const nombresZonas = (ids: string[]) => ids.map((id) => zonaDe(id)?.nombre ?? "zona fuera de su vista").join(", ") || "—";

  const cargar = useCallback(() => {
    fuente.equipo(sesion).then(setEquipo).catch((e: Error) => setError(e.message));
  }, [sesion]);
  useEffect(cargar, [cargar]);

  async function invitar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true); setError("");
    try {
      const codigo = await fuente.invitar(sesion, { correo, rol, territorioIds: conZonas(rol) ? elegidas : [], dias });
      setCreada({ correo: correo.trim().toLowerCase(), rol, enlace: enlaceInvitacion(codigo) });
      setCorreo(""); setElegidas([]);
      cargar();
    } catch (x) { setError((x as Error).message); } finally { setOcupado(false); }
  }

  async function anular(id: string) {
    setError("");
    try { await fuente.anularInvitacion(sesion, id); cargar(); } catch (x) { setError((x as Error).message); }
  }

  const textoWhatsApp = creada &&
    `Hola. Te invito al equipo de la campaña ${sesion.campana.candidato} en Ventaja Mando, como ${nombreRol[creada.rol].toLowerCase()}. ` +
    `Entra con tu correo ${creada.correo} desde este enlace (vence en ${dias} días): ${creada.enlace}`;

  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>Equipo</h1>
          <p className="tenue">Cada persona entra con su propio usuario, su rol y sus zonas. Solo puede crear su cuenta quien tenga una invitación vigente.</p>
        </div>
      </div>

      <div className="escenario" style={{ gridTemplateColumns: "minmax(0, 1fr) 380px" }}>
        <div className="pila">
          <section className="tarjeta pila" aria-label="Miembros del equipo">
            <h2>Quién está</h2>
            {!equipo ? <p className="tenue">Cargando…</p> : (
              <div className="tabla-envoltura">
                <table>
                  <thead><tr><th>Nombre</th><th>Rol</th><th>Zonas</th></tr></thead>
                  <tbody>
                    {equipo.miembros.map((m) => (
                      <tr key={m.id}><td>{m.nombre}{!m.activa && <span className="tenue"> (inactivo)</span>}</td><td>{nombreRol[m.rol]}</td>
                        <td className="tenue">{conZonas(m.rol) ? nombresZonas(m.territorioIds) : "Toda la campaña"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="tarjeta pila" aria-label="Invitaciones pendientes">
            <h2>Invitaciones pendientes</h2>
            {equipo && !equipo.invitaciones.length && <p className="tenue">No hay invitaciones esperando respuesta.</p>}
            {equipo?.invitaciones.map((i) => (
              <div key={i.id} className="fila entre">
                <span><strong>{i.correo}</strong> <span className="tenue">· {nombreRol[i.rol]}{conZonas(i.rol) && i.territorioIds.length ? ` · ${nombresZonas(i.territorioIds)}` : ""} · vence el {fecha(i.expira)}</span></span>
                <button className="btn btn-chico" onClick={() => anular(i.id)}>Anular</button>
              </div>
            ))}
          </section>
        </div>

        <aside className="pila">
          <form className="tarjeta pila" onSubmit={invitar} aria-label="Nueva invitación">
            <h2>Invitar a alguien</h2>
            <label className="campo">Correo de la persona
              <input type="email" required value={correo} onChange={(e) => setCorreo(e.target.value)} />
            </label>
            <label className="campo">Rol
              <select value={rol} onChange={(e) => setRol(e.target.value as RolCampana)}>
                {rolesPermitidos.map((r) => <option key={r} value={r}>{nombreRol[r]}</option>)}
              </select>
            </label>
            {conZonas(rol) && (
              <fieldset className="campo zonas-elegir">
                <legend>Zonas {rol === "testigo" ? "(opcional)" : "(al menos una)"}</legend>
                {zonas.map((z) => (
                  <label key={z.id} className="fila">
                    <input type="checkbox" checked={elegidas.includes(z.id)}
                      onChange={(e) => setElegidas(e.target.checked ? [...elegidas, z.id] : elegidas.filter((x) => x !== z.id))} />
                    {z.nombre}
                  </label>
                ))}
              </fieldset>
            )}
            <label className="campo">Vence en (días)
              <input type="number" min={1} max={30} value={dias} onChange={(e) => setDias(Number(e.target.value))} />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-primario" type="submit" disabled={ocupado}>{ocupado ? "Creando…" : "Crear invitación"}</button>
          </form>

          {creada && (
            <section className="tarjeta pila" aria-label="Invitación creada">
              <h2>Invitación lista</h2>
              <p className="tenue">Para {creada.correo}, como {nombreRol[creada.rol].toLowerCase()}. Puede mostrarle el QR o enviarle el enlace. El enlace solo funciona con ese correo.</p>
              <Qr texto={creada.enlace} etiqueta={`Código QR de la invitación para ${creada.correo}`} />
              <input className="enlace" readOnly value={creada.enlace} aria-label="Enlace de la invitación" onFocus={(e) => e.target.select()} />
              <div className="fila">
                <button className="btn btn-chico" type="button" onClick={() => navigator.clipboard?.writeText(creada.enlace)}>Copiar enlace</button>
                {/* Regla 1: WhatsApp se abre en el teléfono de quien invita y lo envía esa persona. */}
                <a className="btn btn-chico" href={enlaceWhatsAppManual("", textoWhatsApp!)} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
              </div>
              <p className="aviso">Por seguridad, el código solo se muestra ahora. Si lo pierde, cree la invitación otra vez: la anterior se anula.</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

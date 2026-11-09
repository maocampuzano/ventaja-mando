// Errores del panel (fase 8): si una pantalla falla, la persona ve un aviso y el error queda guardado en la base de la
// campaña, limpio de datos personales (nucleo/errores.ts). También se guardan los errores sueltos del navegador.
import { Component, useEffect, type ReactNode } from "react";
import { prepararError } from "@ventaja/nucleo";
import { fuente } from "./datos/index";
import type { Sesion } from "./datos/tipos";

export const VERSION_PANEL = import.meta.env.VITE_VERSION || "local";

export function registrar(sesion: Sesion, e: unknown) {
  void fuente.registrarError(sesion, prepararError(e, location.href, VERSION_PANEL, navigator.userAgent));
}

/** Escucha los errores sueltos y las promesas rechazadas sin atender mientras haya sesión. */
export function useRegistroDeErrores(sesion: Sesion) {
  useEffect(() => {
    const alError = (ev: ErrorEvent) => registrar(sesion, ev.error ?? ev.message);
    const alRechazo = (ev: PromiseRejectionEvent) => registrar(sesion, ev.reason);
    window.addEventListener("error", alError);
    window.addEventListener("unhandledrejection", alRechazo);
    return () => { window.removeEventListener("error", alError); window.removeEventListener("unhandledrejection", alRechazo); };
  }, [sesion]);
}

type Props = { sesion: Sesion; vista: string; children: ReactNode };

/** Si una pantalla falla, muestra un aviso en vez de dejar la página en blanco, y guarda el error. */
export class AtrapaErrores extends Component<Props, { fallo: boolean }> {
  state = { fallo: false };
  static getDerivedStateFromError() { return { fallo: true }; }
  componentDidCatch(e: unknown) { registrar(this.props.sesion, e); }
  componentDidUpdate(antes: Props) { if (antes.vista !== this.props.vista && this.state.fallo) this.setState({ fallo: false }); }
  render() {
    if (!this.state.fallo) return this.props.children;
    return (
      <div className="pagina">
        <div className="tarjeta pila" role="alert" style={{ maxWidth: 520 }}>
          <h1>Algo falló en esta pantalla</h1>
          <p>Ya quedó registrado para que el equipo técnico lo revise. Ningún dato se perdió por esto.</p>
          <div><button className="btn btn-primario" onClick={() => this.setState({ fallo: false })}>Volver a intentar</button></div>
        </div>
      </div>
    );
  }
}

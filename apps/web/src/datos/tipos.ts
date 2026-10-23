import type { RolCampana } from "@ventaja/nucleo";
import type { Lider, Puesto, Zona } from "../data";

export type Campana = { id: string; candidato: string; cargo: string; eleccion: string; metaVotos: number };

export type Sesion = {
  usuarioId: string;
  nombre: string;
  correo: string;
  rol: RolCampana;
  campana: Campana;
  territorioIds: string[];
};

/** Lo que el tablero necesita, ya recortado al alcance de quien inició sesión. */
export type DatosTablero = { campana: Campana; zonas: Zona[]; lideres: Lider[]; puestos: Puesto[] };

/** Resultado de un intento de inicio de sesión. */
export type Ingreso =
  | { estado: "ok"; sesion: Sesion }
  | { estado: "falta-2fa" } // la contraseña es correcta; falta el código de la app autenticadora
  | { estado: "error"; mensaje: string };

/**
 * Fuente de datos del panel. Hay dos: «demo» (la semilla ficticia, en el navegador) y «supabase» (el proyecto real,
 * donde la seguridad la pone la RLS de la base). La interfaz no sabe cuál está usando.
 */
export interface FuenteDatos {
  readonly modo: "demo" | "supabase";
  iniciarSesion(correo: string, clave: string): Promise<Ingreso>;
  verificar2fa(codigo: string): Promise<Ingreso>;
  sesionActual(): Promise<Sesion | null>;
  cerrarSesion(): Promise<void>;
  cargarTablero(sesion: Sesion): Promise<DatosTablero>;
}

import type { FilaLista, RolCampana } from "@ventaja/nucleo";
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

/** Lo que acompaña a cada persona importada en su autorización (regla 3). */
export type DatosAutorizacion = { finalidades: string[]; evidencia: string; archivo: string };
export type ResultadoImportacion = {
  creadas: number;
  yaExistian: number;
  rechazos: { numero: number; motivo: string }[];
  guardado: boolean; // false en modo demo: no se guarda nada
};

export type Miembro = { id: string; nombre: string; rol: RolCampana; territorioIds: string[]; activa: boolean };
export type InvitacionPendiente = { id: string; correo: string; rol: RolCampana; territorioIds: string[]; expira: string };
export type NuevaInvitacion = { correo: string; rol: RolCampana; territorioIds: string[]; dias: number };
/** Datos de quien acepta una invitación. Si ya tiene cuenta, `crearCuenta` es false y solo se inicia sesión. */
export type Aceptacion = { codigo: string; nombre: string; correo: string; clave: string; crearCuenta: boolean };

/** Resultado de un intento de inicio de sesión. */
export type Ingreso =
  | { estado: "ok"; sesion: Sesion }
  | { estado: "falta-2fa" } // la contraseña es correcta; falta el código de la app autenticadora
  | { estado: "inscribir-2fa"; qr: string; secreto: string } // primera vez: escanear el QR con la app autenticadora
  | { estado: "confirmar-correo" } // la cuenta se creó; falta abrir el enlace que Supabase envió al correo
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
  importarPersonas(sesion: Sesion, filas: FilaLista[], autorizacion: DatosAutorizacion,
    avance?: (hechas: number, total: number) => void): Promise<ResultadoImportacion>;
  equipo(sesion: Sesion): Promise<{ miembros: Miembro[]; invitaciones: InvitacionPendiente[] }>;
  /** Devuelve el código de la invitación: va en el enlace y en el QR, y en la base solo queda su hash. */
  invitar(sesion: Sesion, datos: NuevaInvitacion): Promise<string>;
  anularInvitacion(sesion: Sesion, id: string): Promise<void>;
  aceptarInvitacion(datos: Aceptacion): Promise<Ingreso>;
}

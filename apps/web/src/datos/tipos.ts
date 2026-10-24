import type { EsquemaFormulario, FilaLista, RolCampana, TipoSolicitud } from "@ventaja/nucleo";
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

export type ResumenCumplimiento = {
  personas: number; conAutorizacionVigente: number; autorizacionesRevocadas: number;
  porFinalidad: Record<string, number>; porCanal: Record<string, number>;
  solicitudesAbiertas: number; solicitudesVencidas: number; exportaciones30Dias: number; preferenciaPoliticaActiva: boolean;
};
export type EstadoSolicitud = "recibida" | "en_tramite" | "resuelta" | "rechazada";
/** Fechas en aaaa-mm-dd (hora de Colombia). */
export type Solicitud = {
  id: string; tipo: TipoSolicitud; estado: EstadoSolicitud; personaId?: string; personaNombre?: string;
  detalle?: string; recibida: string; vence: string; prorrogada: boolean; respuesta?: string;
};
export type NuevaSolicitud = { tipo: TipoSolicitud; personaId?: string; detalle: string; recibida: string };
export type PersonaEncontrada = { id: string; nombre: string; telefono?: string; zona?: string };
export type FilaExportada = { nombre: string; celular?: string; zona?: string; lider?: string; relacion: string; estado: string; autorizada_el: string };
export type Exportacion = { referencia: string; exportadoPor: string; exportadoEn: string; finalidad: string; filas: FilaExportada[] };

export type Formulario = { id: string; nombre: string; esquema: EsquemaFormulario; version: number; creado: string };

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
  // Datos y cumplimiento (solo la dirección; la base lo hace cumplir)
  resumenCumplimiento(sesion: Sesion): Promise<ResumenCumplimiento>;
  solicitudes(sesion: Sesion): Promise<Solicitud[]>;
  registrarSolicitud(sesion: Sesion, datos: NuevaSolicitud): Promise<void>;
  prorrogarSolicitud(sesion: Sesion, id: string): Promise<void>;
  cambiarEstadoSolicitud(sesion: Sesion, id: string, estado: EstadoSolicitud, respuesta?: string): Promise<void>;
  buscarPersonas(sesion: Sesion, texto: string): Promise<PersonaEncontrada[]>;
  revocarAutorizacionesDe(sesion: Sesion, personaId: string): Promise<number>;
  suprimirPersona(sesion: Sesion, personaId: string): Promise<void>;
  exportarPersonas(sesion: Sesion, finalidad: string): Promise<Exportacion>;
  // Formularios
  formularios(sesion: Sesion): Promise<Formulario[]>;
  /** Crea (sin id) o actualiza un formulario. La base sube la versión cuando cambian los campos. */
  guardarFormulario(sesion: Sesion, datos: { id?: string; nombre: string; esquema: EsquemaFormulario }): Promise<Formulario>;
}

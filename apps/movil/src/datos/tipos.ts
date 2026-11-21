import type { Transporte } from "@ventaja/nucleo";

export type RolMovil = "lider" | "testigo";

export type Sesion = {
  usuarioId: string;
  nombre: string;
  campanaId: string;
  campanaNombre: string;
  rol: RolMovil;
};

export type Zona = { id: string; nombre: string };

export type TareaMovil = { id: string; titulo: string; detalle: string; estado: "pendiente" | "en_curso" | "hecha" | "cancelada"; venceEn: string | null };

/** Solo las personas que el líder registró o tiene asignadas (lo decide la RLS). Sin cédula. */
export type PersonaMovil = {
  id: string; nombre: string; telefono: string | null; zonaId: string | null;
  estado: "sin_contactar" | "contactado" | "validado" | "comprometido" | "no_interesado";
  autorizacionVigente: boolean;
  /** Tiene una autorización vigente que incluye «contacto de la campaña» (la que permite escribirle). */
  autorizaContacto: boolean;
  /** Pidió no recibir más mensajes ni llamadas (por el enlace, por teléfono o al operador). */
  dadaDeBaja: boolean;
};

export type DatosLider = {
  liderId: string;
  zonas: Zona[];
  meta: number;
  tareas: TareaMovil[];
  personas: PersonaMovil[];
};

export type MesaTestigo = {
  puestoId: string; puestoNombre: string; mesa: number | null;
  estado: "asignado" | "confirmado" | "en_mesa" | "retirado";
  e14Recibido: boolean;
  novedades: { id: string; tipo: string; hora: string; estado: string }[];
};

export type DatosTestigo = { mesas: MesaTestigo[] };

export interface FuenteMovil {
  modo: "demo" | "supabase";
  sesionGuardada(): Promise<Sesion | null>;
  /**
   * Avisa si, después de abrir con la sesión guardada (sin señal), el servidor la rechaza. Devuelve cómo dejar de
   * escuchar. La demostración no lo necesita.
   */
  alRechazarSesion?(f: () => void): () => void;
  iniciarSesion(correo: string, clave: string): Promise<Sesion>;
  cerrarSesion(): Promise<void>;
  /** Trae del servidor lo que el usuario ve. Lanza error si no hay señal; la app usa entonces la copia local. */
  datosLider(s: Sesion): Promise<DatosLider>;
  datosTestigo(s: Sesion): Promise<DatosTestigo>;
  /** Envía la cola: cada operación con su identificador, de forma idempotente. */
  transporte(s: Sesion): Transporte;
  /** ¿Hay conexión de verdad con el servidor (no solo señal)? Responde en pocos segundos; sin conexión, false. */
  ping(s: Sesion): Promise<boolean>;
}

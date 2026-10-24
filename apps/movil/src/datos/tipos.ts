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
  iniciarSesion(correo: string, clave: string): Promise<Sesion>;
  cerrarSesion(): Promise<void>;
  /** Trae del servidor lo que el usuario ve. Lanza error si no hay señal; la app usa entonces la copia local. */
  datosLider(s: Sesion): Promise<DatosLider>;
  datosTestigo(s: Sesion): Promise<DatosTestigo>;
  /** Envía la cola: cada operación con su identificador, de forma idempotente. */
  transporte(s: Sesion): Transporte;
}

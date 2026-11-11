import type { ActaLeida, CanalMasivo, Confianzas, ErrorPanel, FilaLibro, FuenteProhibida, MedioPropaganda, TipoMovimiento, ResultadoLlamada, ResumenCola, SegmentoEnvio, CumplimientoPost, DatosAsesor, Jornada, MesaDiaE, NovedadDiaE, EsquemaFormulario, FilaLista, RespuestaAsesor, RolCampana, TipoSolicitud } from "@ventaja/nucleo";
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

/** Lote de planillas impresas para un líder. `generado` en ISO; se muestra en hora de Colombia. */
export type LotePlanilla = { id: string; numero: number; liderId: string; lider: string; hojas: number; generado: string };
export type NuevoLotePlanilla = { liderId: string; hojas: number; finalidades: string[]; texto: string };

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
  // Planillas imprimibles (dirección y coordinación; la base lo hace cumplir)
  lotesPlanilla(sesion: Sesion): Promise<LotePlanilla[]>;
  /** Registra el lote y devuelve su id (va en el QR de cada hoja) y su número en la campaña. */
  crearLotePlanilla(sesion: Sesion, datos: NuevoLotePlanilla): Promise<{ id: string; numero: number }>;
  // Asesor IA. En modo demo, o si la función del servidor no está publicada, responde el modelo simulado con los
  // datos del tablero (`datos`); en modo supabase con la función publicada, el servidor lee los datos con su RLS.
  preguntarAsesor(sesion: Sesion, pregunta: string, datos: DatosAsesor): Promise<RespuestaAsesorPanel>;
  // Lectura de planillas con revisión humana (regla 7)
  planillasPorRevisar(sesion: Sesion): Promise<PlanillaPorRevisar[]>;
  /** Dirección de la foto para verla (en modo supabase, un enlace firmado que vence pronto). null en el demo. */
  fotoPlanilla(sesion: Sesion, id: string): Promise<string | null>;
  leerPlanilla(sesion: Sesion, id: string): Promise<number>;
  filasPlanilla(sesion: Sesion, id: string): Promise<FilaParaRevisar[]>;
  vincularHoja(sesion: Sesion, id: string, loteImpreso: string, hoja: number): Promise<void>;
  aprobarPlanilla(sesion: Sesion, id: string, filas: FilaAprobada[]): Promise<ResultadoAprobacion>;
  // Día E (dirección, candidata y coordinación; la base lo hace cumplir). `simulacro` elige los datos del simulacro.
  tableroDiaE(sesion: Sesion, simulacro: boolean): Promise<MesaTablero[]>;
  simulacroActivo(sesion: Sesion): Promise<Simulacro | null>;
  iniciarSimulacro(sesion: Sesion): Promise<void>;
  terminarSimulacro(sesion: Sesion): Promise<ResumenSimulacro>;
  /** Cambia el estado de una novedad o le asigna responsable (`null` deja lo que había). */
  atenderNovedad(sesion: Sesion, id: string, estado: "abierta" | "atendida" | "cerrada" | null, responsableId?: string): Promise<void>;
  escalarNovedades(sesion: Sesion): Promise<number>;
  actaE14(sesion: Sesion, id: string): Promise<ActaParaRevisar>;
  /** Lee la foto del acta con IA y devuelve cuántas alertas aritméticas encontró. Igual la revisa una persona. */
  leerE14(sesion: Sesion, id: string): Promise<number>;
  /** Guarda la revisión de una persona (regla 7). `acta` null = descartar la foto (ilegible, de otra mesa…). */
  revisarE14(sesion: Sesion, id: string, acta: ActaLeida | null): Promise<void>;
  /** Avisa cuando algo cambia en el día E (tiempo real). Devuelve la función para dejar de escuchar. */
  suscribirDiaE(sesion: Sesion, alCambiar: () => void): () => void;
  /** Hora y jornada con que se pinta el semáforo. En el simulacro la jornada dura una hora desde que se inicia. */
  relojDiaE(sesion: Sesion, simulacro: Simulacro | null): { ahora: Date; jornada: Jornada };
  // Cumplimiento de los líderes contra el E-14 (agregado; dirección, candidata y coordinación)
  cumplimientoE14(sesion: Sesion): Promise<CumplimientoE14>;
  /** Cómo aparece el candidato en el E-14 y en los resultados históricos (solo la dirección). */
  configurarOpcionesE14(sesion: Sesion, opcionE14: string, opcionHistorica: string): Promise<void>;
  // Mensajes por SMS y correo (solo la dirección; la candidata ve los envíos). Nunca WhatsApp (regla 1).
  envios(sesion: Sesion): Promise<Envio[]>;
  /** Personas del segmento con autorización vigente para contacto, sin baja y con celular o correo. */
  contarDestinatarios(sesion: Sesion, canal: CanalMasivo, segmento: SegmentoEnvio): Promise<number>;
  crearEnvio(sesion: Sesion, datos: NuevoEnvio): Promise<string>;
  /** Fija los destinatarios y devuelve cuántos son. */
  aprobarEnvio(sesion: Sesion, id: string): Promise<number>;
  cancelarEnvio(sesion: Sesion, id: string): Promise<void>;
  /** Envía el siguiente lote. Sin proveedor, o fuera de horario, no envía nada y lo dice. */
  enviarLote(sesion: Sesion, id: string): Promise<ResultadoLoteEnvio>;
  /** Baja en un paso desde el enlace del mensaje (sin sesión). Devuelve el nombre de la campaña. */
  darseDeBaja(token: string): Promise<string>;
  // Telemarketing. La dirección arma y maneja las colas; el operador recibe una persona a la vez.
  colas(sesion: Sesion): Promise<ColaLlamadas[]>;
  crearCola(sesion: Sesion, datos: NuevaCola): Promise<{ id: string; personas: number }>;
  asignarOperadores(sesion: Sesion, colaId: string, operadores: string[]): Promise<void>;
  cambiarEstadoCola(sesion: Sesion, colaId: string, estado: EstadoCola): Promise<void>;
  misColas(sesion: Sesion): Promise<MiCola[]>;
  /** La llamada que el operador tiene en curso o la siguiente de la cola; null si no queda nadie por llamar. */
  siguienteLlamada(sesion: Sesion, colaId: string): Promise<LlamadaEnCurso | null>;
  registrarLlamada(sesion: Sesion, itemId: string, resultado: ResultadoLlamada): Promise<void>;
  // Finanzas (la dirección registra; la candidata, responsable legal, solo ve). Reglas de la Ley 1475 en la base.
  finanzas(sesion: Sesion): Promise<Finanzas>;
  configurarTope(sesion: Sesion, tope: number): Promise<void>;
  /** Busca o crea el tercero por su documento y devuelve su id. */
  registrarTercero(sesion: Sesion, datos: NuevoTercero): Promise<string>;
  registrarMovimiento(sesion: Sesion, datos: NuevoMovimiento): Promise<void>;
  anularMovimiento(sesion: Sesion, id: string): Promise<void>;
  /** El libro para el contador, con los documentos completos. Queda en la auditoría. */
  exportarLibro(sesion: Sesion): Promise<{ referencia: string; exportadoPor: string; exportadoEn: string; filas: FilaLibro[] }>;
  /** Enlace temporal para ver el soporte de un movimiento; null en el demo. */
  verSoporte(sesion: Sesion, id: string): Promise<string | null>;
  // Errores del panel y auditoría (fase 8)
  /** Guarda un error ya limpio de datos personales. Nunca lanza: si no se puede guardar, se pierde en silencio. */
  registrarError(sesion: Sesion, error: ErrorPanel): Promise<void>;
  erroresRecientes(sesion: Sesion): Promise<ErrorAgrupado[]>;
  auditoria(sesion: Sesion, filtro: FiltroAuditoria): Promise<FilaAuditoria[]>;
}

export type ErrorAgrupado = { mensaje: string; veces: number; personas: number; ultima: string; ruta: string; version: string; pila: string };
export type FiltroAuditoria = { accion?: string; desde?: string; hasta?: string; antes?: number };
export type FilaAuditoria = {
  id: number; en: string; usuario: string; accion: string; entidad: string; entidadId: string | null; detalle: Record<string, unknown>;
};

export type MovimientoPanel = {
  id: string; tipo: TipoMovimiento; codigo: number; fecha: string; valor: number; concepto: string; forma: "dinero" | "especie";
  terceroId: string | null; tercero: string | null; soporte: boolean;
};
export type TerceroPanel = { id: string; nombre: string; tipoPersona: "natural" | "juridica" };
export type Finanzas = { tope: number | null; movimientos: MovimientoPanel[]; terceros: TerceroPanel[] };
export type NuevoTercero = { tipoPersona: "natural" | "juridica"; nombre: string; documento: string };
export type NuevoMovimiento = {
  codigo: number; fecha: string; valor: number; concepto: string; forma: "dinero" | "especie";
  terceroId?: string | null; parentesco?: string; acta?: string; verificacion?: Partial<Record<FuenteProhibida, boolean>>;
  soporte?: File | null;
  /** Número de la factura o del recibo. */
  numeroSoporte?: string;
  /** Solo propaganda (208). */
  medio?: MedioPropaganda | null;
};

export type EstadoCola = "activa" | "pausada" | "cerrada";
export type ColaLlamadas = {
  id: string; nombre: string; guion: string | null; estado: EstadoCola; creado: string; operadores: string[]; resumen: ResumenCola;
};
export type NuevaCola = { nombre: string; guion: string; segmento: SegmentoEnvio };
export type MiCola = { id: string; nombre: string; estado: EstadoCola; porLlamar: number };
export type LlamadaEnCurso = { itemId: string; nombre: string; telefono: string; intentos: number; guion: string | null };

export type EstadoEnvio = "borrador" | "aprobado" | "enviando" | "terminado" | "cancelado";
export type ResumenEnvio = { total: number; pendientes: number; enviados: number; fallidos: number; omitidos: number };
export type Envio = {
  id: string; canal: CanalMasivo; nombre: string; asunto: string | null; cuerpo: string; segmento: SegmentoEnvio;
  estado: EstadoEnvio; creado: string; resumen: ResumenEnvio;
};
export type NuevoEnvio = { canal: CanalMasivo; nombre: string; asunto?: string; cuerpo: string; segmento: SegmentoEnvio };
/** `demostracion`: en el modo demo no sale ningún mensaje de verdad. */
export type ResultadoLoteEnvio = { enviados: number; fallidos: number; pendientes: number; demostracion?: boolean };

export type CumplimientoE14 = {
  opcionE14: string | null; opcionHistorica: string | null;
  /** Vacío mientras falte `opcionE14`. */
  lideres: { liderId: string; nombre: string; resultado: CumplimientoPost }[];
};

export type NovedadTablero = NovedadDiaE & { tipo: string; responsableId: string | null };
/** Una mesa del tablero del día E: estados y conteos, sin datos de personas. */
export type MesaTablero = Omit<MesaDiaE, "novedades"> & {
  puesto: string; votosHistoricos: number; llegadaEn: Date | null; actaId: string | null; novedades: NovedadTablero[];
};
/** `iniciado` en ISO. */
export type Simulacro = { id: string; iniciado: string };
export type ResumenSimulacro = { novedades: number; actas: number; testigos: number };
export type ActaParaRevisar = {
  id: string; puesto: string; mesa: number; estado: string;
  /** Enlace para ver la foto (firmado y temporal en el proyecto real); null si no hay foto que mostrar. */
  foto: string | null;
  /** Lo que leyó la IA, si la foto ya se leyó. Sin lectura, quien revisa digita los números desde la foto. */
  lectura: ActaLeida | null;
  subidaPorMi: boolean;
};

/** Foto de planilla subida por un líder, pendiente de leer o de revisar. */
export type PlanillaPorRevisar = {
  id: string; lider: string; estado: "pendiente" | "leido" | "en_revision"; loteNumero: number | null; hoja: number | null;
  filas: number; creada: string; error: string | null;
};
export type FilaParaRevisar = {
  filaId: string; renglon: number; nombre: string; cedula: string; celular: string; barrio: string; firma: boolean; confianza: Confianzas;
};
/** Lo que decide quien revisa, fila por fila (regla 7). */
export type FilaAprobada = { filaId: string; nombre: string; documento: string; telefono: string; firma: boolean; descartar: boolean };
export type ResultadoAprobacion = { creadas: number; yaExistian: number; sinFirma: number; descartadas: number; rechazos: { filaId: string; motivo: string }[] };

/** `aviso` explica por qué respondió el modelo simulado cuando se esperaba el real. */
export type RespuestaAsesorPanel = RespuestaAsesor & { aviso?: string };

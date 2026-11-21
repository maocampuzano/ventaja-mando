// Estado de la app: sesión, cola de sincronización (en SQLite) y la copia local de lo que el usuario ve.
// La cola se intenta enviar al abrir, cada 20 segundos y cada vez que vuelve la señal.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as Crypto from "expo-crypto";
import { ColaSincronizacion, ErrorDeRed, type EstadoOperacion, type Operacion, type TipoOperacion } from "@ventaja/nucleo";
import type { AlmacenLocal } from "./datos/almacenLocal";
import { borrarArchivo, limpiarFotosSueltas } from "./datos/archivos";
import { activarSegundoPlano } from "./segundoPlano";
import { depurarEnviada, fotosParaBorrar } from "./datos/depurar";
import type { DatosLider, DatosTestigo, FuenteMovil, Sesion } from "./datos/tipos";

type Conteo = Record<EstadoOperacion, number>;
/** Estado de la conexión con el servidor, para mostrarlo: conectado, sin conexión o enviando. */
export type Conexion = "conectado" | "sin_conexion" | "sincronizando";

type ContextoApp = {
  fuente: FuenteMovil;
  sesion: Sesion;
  conteo: Conteo;
  operaciones: Operacion[];
  enviando: boolean;
  conexion: Conexion;
  ultimaSincronizacion: number | null;
  datosLider: DatosLider | null;
  datosTestigo: DatosTestigo | null;
  /** Hora de la copia local que se está mostrando, si no se pudo traer del servidor. */
  copiaDe: number | null;
  agregar: (tipo: TipoOperacion, datos: unknown) => Promise<Operacion>;
  /** forzar: enviar ya, sin esperar el turno del reintento (volvió la señal o el usuario lo pidió). */
  sincronizar: (forzar?: boolean) => Promise<void>;
  recargar: () => Promise<void>;
  reintentar: (id: string, datos?: unknown) => Promise<void>;
  descartar: (id: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
};

const Ctx = createContext<ContextoApp | null>(null);

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp fuera de ProveedorApp");
  return c;
}

export function ProveedorApp({ fuente, sesion, local, alSalir, children }: {
  fuente: FuenteMovil; sesion: Sesion; local: AlmacenLocal; alSalir: () => void; children: ReactNode;
}) {
  const { cola: almacen, copia } = local;
  const cola = useMemo(() => {
    const base = fuente.transporte(sesion);
    // Al llegar al servidor, la foto de la firma o de la planilla se borra del teléfono (ya está en el bucket).
    const transporte = { ...base, async enviar(op: Operacion) {
      const r = await base.enviar(op);
      for (const f of fotosParaBorrar(op)) await borrarArchivo(f);
      return r;
    } };
    return new ColaSincronizacion(almacen, transporte, () => Crypto.randomUUID(), Date.now, depurarEnviada, sesion.usuarioId);
  }, [almacen, fuente, sesion]);
  const [conteo, setConteo] = useState<Conteo>({ pendiente: 0, enviando: 0, enviado: 0, revisado: 0, error: 0 });
  const [conexion, setConexion] = useState<Conexion>("conectado");
  const [operaciones, setOperaciones] = useState<Operacion[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [ultima, setUltima] = useState<number | null>(null);
  const [datosLider, setDatosLider] = useState<DatosLider | null>(null);
  const [datosTestigo, setDatosTestigo] = useState<DatosTestigo | null>(null);
  const [copiaDe, setCopiaDe] = useState<number | null>(null);
  const vivo = useRef(true);

  const refrescarCola = useCallback(async () => {
    const [c, ops] = await Promise.all([cola.conteo(), cola.operaciones()]);
    if (vivo.current) { setConteo(c); setOperaciones(ops); }
  }, [cola]);

  const clave = `${sesion.campanaId}:${sesion.usuarioId}:${sesion.rol}`;
  const recargar = useCallback(async () => {
    try {
      if (sesion.rol === "lider") {
        const d = await fuente.datosLider(sesion);
        await copia.escribir(clave, d);
        if (vivo.current) { setDatosLider(d); setCopiaDe(null); setConexion((c) => (c === "sincronizando" ? c : "conectado")); }
      } else {
        const d = await fuente.datosTestigo(sesion);
        await copia.escribir(clave, d);
        if (vivo.current) { setDatosTestigo(d); setCopiaDe(null); setConexion((c) => (c === "sincronizando" ? c : "conectado")); }
      }
    } catch (e) {
      // Si el servidor no responde, se dice aunque no haya nada por enviar (antes quedaba «Conectado» sin señal).
      if (e instanceof ErrorDeRed && vivo.current) setConexion("sin_conexion");
      const guardada = await copia.leer<DatosLider & DatosTestigo>(clave);
      if (guardada && vivo.current) {
        if (sesion.rol === "lider") setDatosLider(guardada.valor); else setDatosTestigo(guardada.valor);
        setCopiaDe(guardada.actualizadaEn);
      }
      if (!(e instanceof ErrorDeRed) && !guardada) throw e;
    }
  }, [fuente, sesion, copia, clave]);

  const sincronizar = useCallback(async (forzar = false) => {
    setEnviando(true);
    let avance: ReturnType<typeof setInterval> | undefined;
    try {
      const pendientes = (await cola.operaciones()).some((o) => o.estado === "pendiente" || o.estado === "enviando");
      // Solo si hay algo por enviar, la pantalla se actualiza seguido para que la barra avance foto por foto.
      if (pendientes) avance = setInterval(() => { refrescarCola().catch(() => undefined); }, 700);
      // Antes de enviar, se comprueba que el servidor responde de verdad (no basta con tener señal).
      if (pendientes && !(await fuente.ping(sesion))) {
        if (vivo.current) setConexion("sin_conexion");
        return;
      }
      if (pendientes && vivo.current) setConexion("sincronizando");
      const r = await cola.sincronizar({ forzar });
      // Sin nada por enviar, la cola no habla con el servidor: lo dice recargar(), que sí lo intenta.
      if (pendientes && vivo.current) setConexion(r.sinSenal ? "sin_conexion" : "conectado");
      if (!r.sinSenal) { setUltima(Date.now()); await recargar().catch(() => undefined); }
    } finally {
      if (avance) clearInterval(avance);
      await refrescarCola();
      if (vivo.current) setEnviando(false);
    }
  }, [cola, recargar, refrescarCola, fuente, sesion]);

  useEffect(() => {
    vivo.current = true;
    refrescarCola();
    recargar().catch(() => undefined);
    sincronizar();
    const intervalo = setInterval(() => sincronizar(), 20_000);
    const red = NetInfo.addEventListener((s) => {
      if (s.isConnected) sincronizar(true);
      else if (s.isConnected === false && vivo.current) setConexion("sin_conexion");
    });
    const estado = AppState.addEventListener("change", (s) => { if (s === "active") sincronizar(true); });
    // Lo revisado hace más de 30 días ya no hace falta en el teléfono.
    almacen.limpiarRevisadas(Date.now() - 30 * 86_400_000).catch(() => undefined);
    // Las fotos del E-14 se quedan en el teléfono hasta 7 días después de que el servidor confirmó que las recibió
    // (en una operación enviada, proximoIntento guarda ese momento). Al borrarla, la operación deja de apuntarle.
    // Además se borran las fotos sueltas (una firma repetida, un registro a medias) que nada usa hace más de un día.
    almacen.todas().then(async (ops) => {
      const ahora = Date.now();
      const enUso = new Set<string>();
      for (const o of ops) {
        const d = o.datos as { foto?: string; archivo?: string; evidencia?: string };
        const foto = d.foto;
        // Las enviadas antes de este cambio no tienen esa hora: se cuenta desde que se tomaron.
        const confirmada = o.proximoIntento || o.creadaEn;
        if (o.tipo === "e14" && (o.estado === "enviado" || o.estado === "revisado") && confirmada < ahora - 7 * 86_400_000
            && foto && /^file:/.test(foto)) {
          await borrarArchivo(foto);
          await almacen.guardar({ ...o, datos: { ...d, foto: "" } });
          continue;
        }
        for (const u of [d.foto, d.archivo, d.evidencia]) if (u) enUso.add(u);
      }
      await limpiarFotosSueltas(enUso, ahora - 86_400_000);
    }).catch(() => undefined);
    // En el teléfono, el envío sigue cada 20 minutos aunque la app esté cerrada (Android decide el momento exacto).
    if (Platform.OS !== "web") activarSegundoPlano().catch(() => undefined);
    return () => { vivo.current = false; clearInterval(intervalo); red(); estado.remove(); };
  }, [sincronizar, refrescarCola, recargar, almacen]);

  const valor: ContextoApp = {
    fuente, sesion, conteo, operaciones, enviando, conexion, ultimaSincronizacion: ultima, datosLider, datosTestigo, copiaDe,
    async agregar(tipo, datos) {
      const op = await cola.agregar(tipo, datos);
      await refrescarCola();
      sincronizar();
      return op;
    },
    sincronizar,
    recargar,
    async reintentar(id, datos) { await cola.reintentar(id, datos); await sincronizar(true); },
    async descartar(id) { await cola.descartar(id); await refrescarCola(); },
    async cerrarSesion() {
      await fuente.cerrarSesion();
      // Se borra lo de esta persona y la copia local. Lo que otra persona dejó sin enviar en el teléfono se queda,
      // para que lo envíe ella cuando vuelva a entrar.
      for (const o of await cola.operaciones()) await almacen.borrar(o.id);
      await copia.borrarCopias();
      alSalir();
    },
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

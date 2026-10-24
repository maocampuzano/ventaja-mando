// Estado de la app: sesión, cola de sincronización (en SQLite) y la copia local de lo que el usuario ve.
// La cola se intenta enviar al abrir, cada 20 segundos y cada vez que vuelve la señal.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as Crypto from "expo-crypto";
import { ColaSincronizacion, ErrorDeRed, type EstadoOperacion, type Operacion, type TipoOperacion } from "@ventaja/nucleo";
import type { AlmacenLocal } from "./datos/almacenLocal";
import { borrarArchivo } from "./datos/archivos";
import { depurarEnviada, fotosParaBorrar } from "./datos/depurar";
import type { DatosLider, DatosTestigo, FuenteMovil, Sesion } from "./datos/tipos";

type Conteo = Record<EstadoOperacion, number>;

type ContextoApp = {
  fuente: FuenteMovil;
  sesion: Sesion;
  conteo: Conteo;
  operaciones: Operacion[];
  enviando: boolean;
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
    return new ColaSincronizacion(almacen, transporte, () => Crypto.randomUUID(), Date.now, depurarEnviada);
  }, [almacen, fuente, sesion]);
  const [conteo, setConteo] = useState<Conteo>({ pendiente: 0, enviado: 0, revisado: 0, error: 0 });
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
        if (vivo.current) { setDatosLider(d); setCopiaDe(null); }
      } else {
        const d = await fuente.datosTestigo(sesion);
        await copia.escribir(clave, d);
        if (vivo.current) { setDatosTestigo(d); setCopiaDe(null); }
      }
    } catch (e) {
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
    try {
      const r = await cola.sincronizar({ forzar });
      if (!r.sinSenal) { setUltima(Date.now()); await recargar().catch(() => undefined); }
    } finally {
      await refrescarCola();
      if (vivo.current) setEnviando(false);
    }
  }, [cola, recargar, refrescarCola]);

  useEffect(() => {
    vivo.current = true;
    refrescarCola();
    recargar().catch(() => undefined);
    sincronizar();
    const intervalo = setInterval(() => sincronizar(), 20_000);
    const red = NetInfo.addEventListener((s) => { if (s.isConnected) sincronizar(true); });
    const estado = AppState.addEventListener("change", (s) => { if (s === "active") sincronizar(true); });
    // Lo revisado hace más de 30 días ya no hace falta en el teléfono.
    almacen.limpiarRevisadas(Date.now() - 30 * 86_400_000).catch(() => undefined);
    return () => { vivo.current = false; clearInterval(intervalo); red(); estado.remove(); };
  }, [sincronizar, refrescarCola, recargar, almacen]);

  const valor: ContextoApp = {
    fuente, sesion, conteo, operaciones, enviando, ultimaSincronizacion: ultima, datosLider, datosTestigo, copiaDe,
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
      await copia.borrarTodo();
      alSalir();
    },
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

import { useEffect, useMemo, useState } from "react";
import { nombreRol, type RolCampana } from "@ventaja/nucleo";
import { Icono, diasParaEleccion } from "./comunes";
import { fuente } from "./datos";
import { ContextoTablero, type Contexto } from "./datos/contexto";
import { sesionDemoPorRol } from "./datos/demo";
import { armarTablero } from "./datos/tablero";
import type { Sesion } from "./datos/tipos";
import { AceptarInvitacion } from "./AceptarInvitacion";
import { Equipo } from "./Equipo";
import { Formularios } from "./Formularios";
import { Importar } from "./Importar";
import { InicioSesion } from "./InicioSesion";
import { Lideres } from "./Lideres";
import { Mando } from "./Mando";
import { Datos } from "./Datos";
import { BandejaLider, DiaE, MiMesa, Planillas, Resumen } from "./Pantallas";
import type { Tarea } from "./Strategos";

type Vista = "resumen" | "mando" | "lideres" | "equipo" | "importar" | "formularios" | "planillas" | "diae" | "datos" | "bandeja" | "mimesa";

// Cada rol entra a su propio espacio (CLAUDE.md, «Diseño»): no hay un menú único con todo.
const vistasPorRol: Record<RolCampana, Vista[]> = {
  administrador: ["mando", "lideres", "equipo", "importar", "formularios", "planillas", "diae", "datos"],
  gerente: ["mando", "lideres", "equipo", "importar", "formularios", "planillas", "diae", "datos"],
  candidato: ["resumen", "mando", "diae"],
  coordinador: ["mando", "lideres", "importar", "planillas"],
  lider: ["bandeja"],
  testigo: ["mimesa"],
};

const nav: Record<Vista, { nombre: string; icono: Parameters<typeof Icono>[0]["n"] }> = {
  resumen: { nombre: "Resumen", icono: "resumen" },
  mando: { nombre: "Mando", icono: "mando" },
  lideres: { nombre: "Líderes", icono: "lideres" },
  equipo: { nombre: "Equipo", icono: "equipo" },
  importar: { nombre: "Importar", icono: "importar" },
  formularios: { nombre: "Formularios", icono: "formularios" },
  planillas: { nombre: "Planillas", icono: "planillas" },
  diae: { nombre: "Día E", icono: "diae" },
  datos: { nombre: "Datos", icono: "datos" },
  bandeja: { nombre: "Celular", icono: "movil" },
  mimesa: { nombre: "Mi mesa", icono: "movil" },
};

// Enlaces directos con un token simple: #lideres, o #gerente-lideres en la página publicada del modo demo.
function leerHash(): { rol?: string; vista?: string } {
  const partes = location.hash.replace("#", "").split(/[-/]/).filter(Boolean);
  if (partes.length >= 2) return { rol: partes[0], vista: partes[1] };
  return partes[0] && partes[0] in vistasPorRol ? { rol: partes[0] } : { vista: partes[0] };
}

export default function App() {
  const [sesion, setSesion] = useState<Sesion | null | undefined>(undefined);
  const [invitacion, setInvitacion] = useState(() => new URLSearchParams(location.search).get("invitacion"));
  const [aviso, setAviso] = useState("");
  const cerrarInvitacion = () => { setInvitacion(null); history.replaceState(null, "", location.pathname); };

  useEffect(() => {
    const { rol } = leerHash();
    const porEnlace = fuente.modo === "demo" && rol ? sesionDemoPorRol(rol) : null;
    if (porEnlace) { setSesion(porEnlace); return; }
    fuente.sesionActual().then(setSesion).catch(() => setSesion(null));
  }, []);

  if (sesion === undefined) return <main className="ingreso"><p className="tenue">Cargando…</p></main>;
  if (!sesion && invitacion) {
    return <AceptarInvitacion fuente={fuente} codigo={invitacion}
      alEntrar={(s) => { cerrarInvitacion(); setSesion(s); }}
      alNecesitar2fa={() => { cerrarInvitacion(); setAviso("Invitación aceptada. Su rol pide verificación en dos pasos: entre con su correo y contraseña para activarla."); }} />;
  }
  if (!sesion) return <InicioSesion fuente={fuente} alEntrar={setSesion} aviso={aviso} />;
  return <Panel sesion={sesion} alSalir={() => { fuente.cerrarSesion(); setSesion(null); history.replaceState(null, "", " "); }} />;
}

function Panel({ sesion, alSalir }: { sesion: Sesion; alSalir: () => void }) {
  const vistas = vistasPorRol[sesion.rol];
  const vistaInicial = (): Vista => {
    const v = leerHash().vista as Vista | undefined;
    return v && vistas.includes(v) ? v : vistas[0];
  };
  const [vista, setVista] = useState<Vista>(vistaInicial);
  const [datos, setDatos] = useState<Contexto | null>(null);
  const [error, setError] = useState("");
  const [aprobadas, setAprobadas] = useState<Tarea[]>(() => {
    try { return JSON.parse(sessionStorage.getItem("vm-aprobadas") ?? "[]"); } catch { return []; }
  });

  useEffect(() => {
    let vigente = true;
    fuente.cargarTablero(sesion)
      .then((d) => { if (vigente) setDatos({ ...armarTablero(d, sesion.rol), sesion, modo: fuente.modo }); })
      .catch((e: Error) => { if (vigente) setError(e.message); });
    return () => { vigente = false; };
  }, [sesion]);

  useEffect(() => {
    try { sessionStorage.setItem("vm-aprobadas", JSON.stringify(aprobadas)); } catch { /* sin almacenamiento */ }
  }, [aprobadas]);

  useEffect(() => {
    const f = () => setVista(vistaInicial());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  });

  const ir = (v: Vista) => {
    setVista(v);
    try { history.replaceState(null, "", `#${v}`); } catch { /* la página publicada no muestra la dirección */ }
  };
  const aprobar = (t: Tarea) => setAprobadas((a) => (a.some((x) => x.id === t.id) ? a : [...a, t]));

  const usuario = (
    <span className="chip">
      <span><strong>{sesion.nombre}</strong> <span className="tenue">{nombreRol[sesion.rol]}</span></span>
      <button className="btn btn-chico" onClick={alSalir}>Salir</button>
    </span>
  );

  const contenido = useMemo(() => {
    if (error) return <div className="pagina"><p className="error" role="alert">{error}</p></div>;
    if (!datos) return <div className="pagina"><p className="tenue">Cargando el tablero…</p></div>;
    // En el proyecto real, líder y testigo trabajan en la app del celular (fase 3), no en el panel.
    if (fuente.modo === "supabase" && (sesion.rol === "lider" || sesion.rol === "testigo")) {
      return <div className="pagina"><h1>Su espacio está en el celular</h1><p className="tenue">La app del líder y del testigo llega en la fase 3. Mientras tanto, su coordinador le asigna las tareas.</p></div>;
    }
    return null;
  }, [error, datos, sesion.rol]);

  const barraMando = datos && (
    <div className="barra">
      <span className="chip solo-escritorio"><strong>{datos.campana.candidato}</strong><span className="tenue">{datos.campana.cargo}</span></span>
      <span className="chip"><span className="cuenta">{diasParaEleccion(datos.campana.eleccion)}</span><span className="tenue">días para la elección</span></span>
      <span className="espacio" />
      {aprobadas.length > 0 && (
        <span className="chip"><span className="punto" style={{ background: "var(--verde)" }} />{aprobadas.length} {aprobadas.length === 1 ? "tarea aprobada" : "tareas aprobadas"} hoy</span>
      )}
      {usuario}
    </div>
  );

  return (
    <div className="app">
      <nav className="riel" aria-label="Secciones">
        <div className="marca" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="24" height="24"><path d="M8 9l8 15 8-15" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        {vistas.map((v) => (
          <button key={v} className="riel-btn" aria-current={vista === v ? "page" : undefined} onClick={() => ir(v)}>
            <Icono n={nav[v].icono} />
            {nav[v].nombre}
          </button>
        ))}
      </nav>
      <main className="lienzo">
        {contenido ?? (
          <ContextoTablero.Provider value={datos}>
            {vista !== "mando" && <div className="rol-flotante">{usuario}</div>}
            {vista === "mando" && <Mando barra={barraMando} aprobadas={aprobadas.map((t) => t.id)} alAprobar={aprobar} />}
            {vista === "resumen" && <Resumen aprobadas={aprobadas} />}
            {vista === "lideres" && <Lideres />}
            {vista === "equipo" && <Equipo />}
            {vista === "importar" && <Importar />}
            {vista === "formularios" && <Formularios />}
            {vista === "planillas" && <Planillas />}
            {vista === "diae" && <DiaE />}
            {vista === "datos" && <Datos />}
            {vista === "bandeja" && <BandejaLider />}
            {vista === "mimesa" && <MiMesa />}
          </ContextoTablero.Provider>
        )}
      </main>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Icono, diasParaEleccion } from "./comunes";
import { campana } from "./data";
import { Lideres } from "./Lideres";
import { Mando } from "./Mando";
import { BandejaLider, Datos, DiaE, MiMesa, Planillas, Resumen } from "./Pantallas";
import type { Tarea } from "./Strategos";

type Rol = "candidato" | "gerente" | "coordinador" | "lider" | "testigo";
type Vista = "resumen" | "mando" | "lideres" | "planillas" | "diae" | "datos" | "bandeja" | "mimesa";

const roles: { id: Rol; nombre: string; vistas: Vista[] }[] = [
  { id: "candidato", nombre: "Candidata", vistas: ["resumen", "mando", "diae"] },
  { id: "gerente", nombre: "Gerente", vistas: ["mando", "lideres", "planillas", "diae", "datos"] },
  { id: "coordinador", nombre: "Coordinador", vistas: ["mando", "lideres", "planillas"] },
  { id: "lider", nombre: "Líder", vistas: ["bandeja"] },
  { id: "testigo", nombre: "Testigo", vistas: ["mimesa"] },
];

const nav: Record<Vista, { nombre: string; icono: Parameters<typeof Icono>[0]["n"] }> = {
  resumen: { nombre: "Resumen", icono: "resumen" },
  mando: { nombre: "Mando", icono: "mando" },
  lideres: { nombre: "Líderes", icono: "lideres" },
  planillas: { nombre: "Planillas", icono: "planillas" },
  diae: { nombre: "Día E", icono: "diae" },
  datos: { nombre: "Datos", icono: "datos" },
  bandeja: { nombre: "Celular", icono: "movil" },
  mimesa: { nombre: "Mi mesa", icono: "movil" },
};

// Enlaces directos con un token simple (#gerente-lideres), que es lo que admite la página publicada.
function leerHash(): { rol: Rol; vista: Vista } {
  const [r, v] = location.hash.replace("#", "").split(/[-/]/);
  const rol = roles.find((x) => x.id === r) ?? roles[1];
  const vista = (rol.vistas as string[]).includes(v) ? (v as Vista) : rol.vistas[0];
  return { rol: rol.id, vista };
}

export default function App() {
  const [{ rol, vista }, setEstado] = useState(leerHash);
  const [aprobadas, setAprobadas] = useState<Tarea[]>(() => {
    try { return JSON.parse(sessionStorage.getItem("vm-aprobadas") ?? "[]"); } catch { return []; }
  });

  useEffect(() => {
    try { sessionStorage.setItem("vm-aprobadas", JSON.stringify(aprobadas)); } catch { /* sin almacenamiento */ }
  }, [aprobadas]);

  useEffect(() => {
    const f = () => setEstado(leerHash());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);

  const ir = (r: Rol, v?: Vista) => {
    const def = roles.find((x) => x.id === r)!;
    const vista = v ?? def.vistas[0];
    setEstado({ rol: r, vista });
    try { history.replaceState(null, "", `#${r}-${vista}`); } catch { /* la página publicada no muestra la dirección */ }
  };
  const rolActual = roles.find((x) => x.id === rol)!;
  const aprobar = (t: Tarea) => setAprobadas((a) => (a.some((x) => x.id === t.id) ? a : [...a, t]));

  const selectorRol = (
    <label className="chip">
      <span className="tenue solo-escritorio">Ver como</span>
      <select className="selector-rol" value={rol} onChange={(e) => ir(e.target.value as Rol)} aria-label="Ver la plataforma como">
        {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
      </select>
    </label>
  );

  const barraMando = (
    <div className="barra">
      <span className="chip solo-escritorio"><strong>{campana.candidato}</strong><span className="tenue">{campana.cargo}</span></span>
      <span className="chip"><span className="cuenta">{diasParaEleccion()}</span><span className="tenue">días para la elección</span></span>
      <span className="espacio" />
      {aprobadas.length > 0 && (
        <span className="chip"><span className="punto" style={{ background: "var(--verde)" }} />{aprobadas.length} {aprobadas.length === 1 ? "tarea aprobada" : "tareas aprobadas"} hoy</span>
      )}
      {selectorRol}
    </div>
  );

  return (
    <div className="app">
      <nav className="riel" aria-label="Secciones">
        <div className="marca" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="24" height="24"><path d="M8 9l8 15 8-15" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        {rolActual.vistas.map((v) => (
          <button key={v} className="riel-btn" aria-current={vista === v ? "page" : undefined} onClick={() => ir(rol, v)}>
            <Icono n={nav[v].icono} />
            {nav[v].nombre}
          </button>
        ))}
      </nav>
      <main className="lienzo">
        {vista !== "mando" && <div className="rol-flotante">{selectorRol}</div>}
        {vista === "mando" && <Mando barra={barraMando} aprobadas={aprobadas.map((t) => t.id)} alAprobar={aprobar} />}
        {vista === "resumen" && <Resumen aprobadas={aprobadas} />}
        {vista === "lideres" && <Lideres />}
        {vista === "planillas" && <Planillas />}
        {vista === "diae" && <DiaE />}
        {vista === "datos" && <Datos />}
        {vista === "bandeja" && <BandejaLider />}
        {vista === "mimesa" && <MiMesa />}
      </main>
    </div>
  );
}

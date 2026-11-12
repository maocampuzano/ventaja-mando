// La primera pantalla de quien dirige o coordina: qué hacer hoy, qué se salió de lo normal y cómo va la meta.
// Solo muestra conteos; cada pendiente lleva a la pantalla donde se resuelve.
import { useEffect, useMemo, useState } from "react";
import { miles, pct, resumenFinanzas } from "@ventaja/nucleo";
import { Barra, colorIndice, diasParaEleccion } from "./comunes";
import { useTablero } from "./datos/contexto";
import { armarHoy, saludo, type ExtrasHoy } from "./datos/hoy";
import { fuente } from "./datos/index";
import type { Tarea } from "./Asesor";

const colorAviso = { rojo: "var(--rojo)", ambar: "var(--ambar)", verde: "var(--verde)" };

export function Hoy({ aprobadas, ir }: { aprobadas: Tarea[]; ir: (vista: string) => void }) {
  const { sesion, campana, zonas, lideres, puestos, totales, meta, modo } = useTablero();
  const [extras, setExtras] = useState<ExtrasHoy>({});
  const direccion = sesion.rol === "administrador" || sesion.rol === "gerente";

  // Cada conteo se pide por separado: si uno falla, los demás igual aparecen. La base decide qué ve cada rol.
  useEffect(() => {
    let vigente = true;
    const poner = (x: ExtrasHoy) => { if (vigente) setExtras((e) => ({ ...e, ...x })); };
    const callar = () => { /* sin ese dato, la pantalla no muestra ese pendiente */ };
    fuente.planillasPorRevisar(sesion).then((p) => poner({ planillasPorRevisar: p.length })).catch(callar);
    if (direccion) {
      fuente.envios(sesion).then((e) => poner({
        enviosPorAprobar: e.filter((x) => x.estado === "borrador").length,
        enviosPorEnviar: e.filter((x) => x.estado === "aprobado").length,
      })).catch(callar);
      fuente.resumenCumplimiento(sesion).then((r) => poner({ solicitudesAbiertas: r.solicitudesAbiertas, solicitudesVencidas: r.solicitudesVencidas })).catch(callar);
      fuente.finanzas(sesion).then((f) => poner({ usoTope: resumenFinanzas(f.movimientos, f.tope).usoTope })).catch(callar);
    }
    return () => { vigente = false; };
  }, [sesion, direccion]);

  const { pendientes, avisos } = useMemo(() => armarHoy({ zonas, lideres, puestos }, extras), [zonas, lideres, puestos, extras]);
  const avance = meta.votos ? totales.validados / meta.votos : 0;
  const conMeta = zonas.filter((z) => z.meta > 0).map((z) => ({ id: z.id, nombre: z.nombre, avance: z.validados / z.meta }))
    .sort((a, b) => a.avance - b.avance);
  const zonasAMostrar = conMeta.length > 6 ? [...conMeta.slice(0, 3), ...conMeta.slice(-3)] : conMeta;
  const dias = diasParaEleccion(campana.eleccion);

  return (
    <div className="pagina">
      <div className="pagina-cabeza">
        <div>
          <h1>{saludo()}, {sesion.nombre.split(" ")[0]}</h1>
          <p className="tenue">Campaña de {campana.candidato} a la {campana.cargo}.{dias > 0 && ` Faltan ${miles(dias)} días para la elección.`}</p>
        </div>
        {modo === "demo" && <span className="sello">Datos ficticios</span>}
      </div>

      <div className="hoy">
        <div className="hoy-col">
          <section className="tarjeta" aria-labelledby="hoy-pendientes">
            <h2 id="hoy-pendientes">Para hoy</h2>
            {pendientes.length ? pendientes.map((p) => (
              <div key={p.id} className="pendiente">
                <div>
                  <strong>{p.titulo}</strong>{p.urgente && <span className="sello rojo" style={{ marginLeft: 8 }}>Urgente</span>}
                  <p className="tenue">{p.detalle}</p>
                </div>
                <button className={`btn btn-chico${p === pendientes[0] ? " btn-primario" : ""}`} onClick={() => ir(p.vista)}>{p.boton}</button>
              </div>
            )) : <p className="tenue" style={{ marginTop: 8 }}>No hay nada esperando por usted. Buen momento para preguntarle al asesor dónde actuar esta semana.</p>}
          </section>

          <section className="tarjeta pila" aria-labelledby="hoy-meta">
            <h2 id="hoy-meta">Cómo vamos frente a la meta</h2>
            <div className="tres-cifras">
              <div><div className="dato">{miles(totales.bruto)}</div><div className="tenue">registrados</div></div>
              <div><div className="dato">{miles(totales.validados)}</div><div className="tenue">validados, sin repetidos</div></div>
              <div><div className="dato">{miles(meta.votos)}</div><div className="tenue">{meta.texto === "Meta" ? "meta de votos" : "meta de sus zonas"}</div></div>
            </div>
            <Barra valor={avance} />
            <p className="tenue">Los validados son el {pct(avance)} de la meta. {miles(totales.comprometidos)} ya están comprometidos.</p>
          </section>

          <section className="tarjeta pila" aria-labelledby="hoy-territorio">
            <div className="fila entre">
              <h2 id="hoy-territorio">Su territorio</h2>
              <button className="btn btn-chico" onClick={() => ir("mando")}>Abrir el mapa</button>
            </div>
            {zonasAMostrar.length ? (
              <>
                <p className="tenue">{conMeta.length > 6 ? "Las tres zonas más atrasadas y las tres más adelantadas" : "Validados"} frente a la meta de cada zona.</p>
                {zonasAMostrar.map((z) => (
                  <div key={z.id} className="zona-fila">
                    <span>{z.nombre}</span><Barra valor={z.avance} color={colorIndice(z.avance)} /><span className="tenue" style={{ textAlign: "right" }}>{pct(z.avance)}</span>
                  </div>
                ))}
              </>
            ) : <p className="tenue">Todavía no hay zonas con meta. Se definen al crear la campaña.</p>}
          </section>
        </div>

        <div className="hoy-col">
          <section className="tarjeta" aria-labelledby="hoy-avisos">
            <h2 id="hoy-avisos">Avisos</h2>
            {avisos.length ? avisos.map((a) => (
              <div key={a.id} className="hoy-aviso"><span className="punto" style={{ background: colorAviso[a.nivel] }} /><span>{a.texto}</span></div>
            )) : <p className="tenue" style={{ marginTop: 8 }}>Nada fuera de lo normal.</p>}
          </section>

          <section className="tarjeta pila" aria-labelledby="hoy-asesor">
            <h2 id="hoy-asesor">Pregúntele al asesor</h2>
            <p className="tenue">El Asesor IA responde con las cifras de su campaña y dice de dónde salió cada dato. Nada se ejecuta sin su aprobación.</p>
            <div><button className="btn btn-primario" onClick={() => ir("mando")}>Abrir el Asesor IA</button></div>
          </section>

          <section className="tarjeta pila" aria-labelledby="hoy-decisiones">
            <h2 id="hoy-decisiones">Decisiones de hoy</h2>
            {aprobadas.length ? aprobadas.map((t) => (
              <div key={t.id} className="fila entre"><span>{t.titulo}</span><span className="sello verde">Aprobada</span></div>
            )) : <p className="tenue">Todavía no se han aprobado tareas hoy. Las que propone el Asesor IA aparecen aquí cuando alguien las aprueba.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

// Mapa propio en SVG: no depende de teselas ni servicios externos, así funciona sin conexión y en la página publicada.
import { useMemo } from "react";
import { puestos, recDe, zonas } from "./data";
import { porcentajeCobertura } from "./logic";

export type Capa = "accion" | "tierra" | "pauta" | "meta" | "testigos";

const colorAccion = { brigada: "#f0a73a", pauta: "#1f5bff", oportunidad: "#b46cff", mantener: "#3a465c" };

function mezcla(a: string, b: string, t: number) {
  const pa = a.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const c = pa.map((x, i) => Math.round(x + (pb[i] - x) * Math.max(0, Math.min(1, t))));
  return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function rampa(t: number) {
  return t < 0.5 ? mezcla("#2a3140", "#2c5ee0", t / 0.5) : mezcla("#2c5ee0", "#8fb0ff", (t - 0.5) / 0.5);
}
function semaforo(t: number) {
  return t < 0.35 ? mezcla("#e5534b", "#f0a73a", t / 0.35) : mezcla("#f0a73a", "#2eb872", (t - 0.35) / 0.35);
}

// Proyección equirectangular local: a 10° N, un grado de longitud mide cos(10°) de uno de latitud.
const K = Math.cos((10.33 * Math.PI) / 180);
const proy = ([lon, lat]: [number, number]): [number, number] => [lon * K * 10000, -lat * 10000];
const METROS_POR_GRADO_LAT = 110574;

export function Mapa({ capa, seleccion, alSeleccionar }: { capa: Capa; seleccion: string | null; alSeleccionar: (id: string) => void }) {
  const geo = useMemo(() => {
    const formas = zonas.map((z) => ({
      z,
      puntos: z.anillo.map(proy),
      centro: proy(z.centro),
    }));
    const xs = formas.flatMap((f) => f.puntos.map((p) => p[0]));
    const ys = formas.flatMap((f) => f.puntos.map((p) => p[1]));
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX, h = maxY - minY;
    // Margen asimétrico: deja libre el espacio que ocupan los paneles flotantes.
    const vb = { x: minX - w * 0.62, y: minY - h * 0.2, w: w * 2.28, h: h * 1.75 };
    const metro = 10000 / METROS_POR_GRADO_LAT; // unidades SVG por metro
    return { formas, vb, metro, minX, maxX, minY, maxY };
  }, []);

  const relleno = (id: string) => {
    const z = zonas.find((x) => x.id === id)!;
    const r = recDe(id);
    if (capa === "accion") return colorAccion[r.accion];
    if (capa === "tierra") return rampa(z.validados / z.potencial / 0.45);
    if (capa === "pauta") return rampa(r.digital);
    if (capa === "meta") return semaforo(z.comprometidos / z.meta / 0.6);
    return "#2a3140";
  };
  const opacidad = (id: string) => {
    if (capa === "testigos") return 0.35;
    if (capa === "accion" && recDe(id).accion === "mantener") return 0.45;
    return 0.85;
  };

  const { formas, vb, metro } = geo;
  const paso = 400 * metro; // cuadrícula cada 400 m
  const lineas: number[] = [];
  for (let x = Math.floor(vb.x / paso) * paso; x < vb.x + vb.w; x += paso) lineas.push(x);
  const lineasY: number[] = [];
  for (let y = Math.floor(vb.y / paso) * paso; y < vb.y + vb.h; y += paso) lineasY.push(y);
  const escala = 500 * metro;
  const fuente = vb.w / 95;

  return (
    <div className="mapa" role="region" aria-label="Mapa de zonas de Turbaco con datos ficticios">
      <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
        <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="var(--mapa-fondo)" />
        <g stroke="var(--mapa-reticula)" strokeWidth={vb.w / 1400}>
          {lineas.map((x) => <line key={`x${x}`} x1={x} x2={x} y1={vb.y} y2={vb.y + vb.h} />)}
          {lineasY.map((y) => <line key={`y${y}`} y1={y} y2={y} x1={vb.x} x2={vb.x + vb.w} />)}
        </g>

        {formas.map(({ z, puntos }) => {
          const sel = seleccion === z.id;
          return (
            <polygon
              key={z.id}
              points={puntos.map((p) => p.join(",")).join(" ")}
              fill={relleno(z.id)}
              fillOpacity={opacidad(z.id)}
              stroke={sel ? "#ffffff" : "var(--mapa-fondo)"}
              strokeWidth={sel ? vb.w / 380 : vb.w / 900}
              className="zona"
              tabIndex={0}
              role="button"
              aria-label={`Zona ${z.nombre}`}
              aria-pressed={sel}
              onClick={() => alSeleccionar(z.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alSeleccionar(z.id); } }}
            />
          );
        })}

        {formas.map(({ z, centro }) => (
          <text key={`t${z.id}`} x={centro[0]} y={centro[1]} textAnchor="middle" dominantBaseline="middle"
            fontSize={fuente} fill="var(--texto)" className="zona-nombre">{z.nombre}</text>
        ))}

        {capa === "testigos" && puestos.map((p) => {
          const [x, y] = proy(p.punto);
          const c = porcentajeCobertura(p.mesas);
          return (
            <g key={p.id}>
              <circle cx={x} cy={y} r={(6 + p.mesas.length * 0.5) * fuente * 0.11} fill={c >= 0.85 ? "#2eb872" : c >= 0.7 ? "#f0a73a" : "#e5534b"}
                stroke="var(--mapa-fondo)" strokeWidth={vb.w / 700} />
              <title>{`${p.nombre}: ${Math.round(c * 100)} % de mesas con testigo`}</title>
            </g>
          );
        })}

        <g transform={`translate(${geo.maxX + (geo.maxX - geo.minX) * 0.06}, ${geo.maxY + (geo.maxY - geo.minY) * 0.12})`}>
          <line x1={0} x2={escala} y1={0} y2={0} stroke="var(--tenue)" strokeWidth={vb.w / 600} />
          <line x1={0} x2={0} y1={-fuente * 0.35} y2={fuente * 0.35} stroke="var(--tenue)" strokeWidth={vb.w / 600} />
          <line x1={escala} x2={escala} y1={-fuente * 0.35} y2={fuente * 0.35} stroke="var(--tenue)" strokeWidth={vb.w / 600} />
          <text x={escala / 2} y={fuente * 1.3} textAnchor="middle" fontSize={fuente * 0.85} fill="var(--tenue)">500 m</text>
        </g>
        <text x={geo.minX} y={geo.minY - (geo.maxY - geo.minY) * 0.06} fontSize={fuente * 1.05} fill="var(--tenue)">Turbaco, Bolívar</text>
      </svg>
    </div>
  );
}

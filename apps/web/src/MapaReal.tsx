// Mapa con MapLibre y teselas de MapTiler. Se enciende solo con MAPTILER_KEY; si la clave falla o el navegador no
// puede dibujarlo (sin WebGL), avisa con alFallar y Mando vuelve al mapa SVG (Mapa.tsx), que no depende de nada externo.
import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MapaML } from "maplibre-gl";
import { useTablero } from "./datos/contexto";
import { estiloMapTiler, geojsonPuestos, geojsonZonas, type Capa } from "./mapaColores";

type ML = typeof import("maplibre-gl");
let cargando: Promise<ML> | null = null;

/** Carga MapLibre desde la carpeta vendor (una sola vez) con su hoja de estilos. */
function cargarMapLibre(): Promise<ML> {
  if (!cargando) {
    const base = `${import.meta.env.BASE_URL}${import.meta.env.VITE_RUTA_MAPLIBRE}`;
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = `${base}/maplibre-gl.css`;
    document.head.appendChild(css);
    cargando = import(/* @vite-ignore */ `${base}/maplibre-gl.mjs`).then((m: ML) => {
      m.setWorkerUrl(new URL(`${base}/maplibre-gl-worker.mjs`, location.href).href);
      return m;
    });
  }
  return cargando;
}

export function MapaReal({ clave, capa, seleccion, alSeleccionar, alFallar }: {
  clave: string; capa: Capa; seleccion: string | null; alSeleccionar: (id: string) => void; alFallar: () => void;
}) {
  const { zonas, puestos, recDe, campana } = useTablero();
  const div = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaML | null>(null);
  const listo = useRef(false);
  const ultimo = useRef({ capa, seleccion, alSeleccionar, alFallar });
  ultimo.current = { capa, seleccion, alSeleccionar, alFallar };

  // Crear el mapa una vez.
  useEffect(() => {
    let vivo = true;
    cargarMapLibre().then((ml) => {
      if (!vivo || !div.current) return;
      const lons = zonas.flatMap((z) => z.anillo.map((p) => p[0])), lats = zonas.flatMap((z) => z.anillo.map((p) => p[1]));
      const m = new ml.Map({
        container: div.current, style: estiloMapTiler(clave), attributionControl: { compact: true },
        bounds: lons.length ? [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]] : [[-79, -4.3], [-66.8, 12.6]],
        fitBoundsOptions: { padding: { top: 90, bottom: 140, left: 340, right: 420 } },
      });
      mapa.current = m;
      m.on("error", (e) => { if (!listo.current) { console.warn("El mapa real no cargó; se usa el mapa SVG.", e.error); ultimo.current.alFallar(); } });
      m.on("load", () => {
        const { capa: c, seleccion: s } = ultimo.current;
        m.addSource("zonas", { type: "geojson", data: geojsonZonas(zonas, c, recDe, s) });
        m.addSource("puestos", { type: "geojson", data: geojsonPuestos(puestos) });
        m.addLayer({ id: "zonas-relleno", type: "fill", source: "zonas", paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "opacidad"] } });
        m.addLayer({ id: "zonas-borde", type: "line", source: "zonas", paint: {
          "line-color": ["case", ["get", "sel"], "#ffffff", "#10161f"], "line-width": ["case", ["get", "sel"], 3, 1] } });
        m.addLayer({ id: "zonas-nombre", type: "symbol", source: "zonas", layout: { "text-field": ["get", "nombre"], "text-size": 12, "text-font": ["Noto Sans Regular"] },
          paint: { "text-color": "#e8ecf3", "text-halo-color": "#10161f", "text-halo-width": 1.2 } });
        m.addLayer({ id: "puestos", type: "circle", source: "puestos", layout: { visibility: c === "testigos" ? "visible" : "none" },
          paint: { "circle-color": ["get", "color"], "circle-radius": ["+", 5, ["*", 0.4, ["get", "mesas"]]], "circle-stroke-color": "#10161f", "circle-stroke-width": 1.5 } });
        m.on("click", "zonas-relleno", (e) => { const id = e.features?.[0]?.properties?.id; if (id) ultimo.current.alSeleccionar(String(id)); });
        m.on("mouseenter", "zonas-relleno", () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", "zonas-relleno", () => { m.getCanvas().style.cursor = ""; });
        listo.current = true;
      });
    }).catch((e) => { console.warn("MapLibre no cargó; se usa el mapa SVG.", e); ultimo.current.alFallar(); });
    return () => { vivo = false; mapa.current?.remove(); mapa.current = null; listo.current = false; };
  }, [clave, zonas, puestos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Repintar al cambiar de capa o de zona elegida.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo.current) return;
    (m.getSource("zonas") as GeoJSONSource | undefined)?.setData(geojsonZonas(zonas, capa, recDe, seleccion));
    m.setLayoutProperty("puestos", "visibility", capa === "testigos" ? "visible" : "none");
  }, [capa, seleccion, zonas, recDe]);

  // MapLibre le pone position: relative a su contenedor; por eso va dentro de .mapa (que ocupa toda la pantalla).
  return (
    <div className="mapa" role="region" aria-label={`Mapa de zonas: ${campana.cargo}`} data-mapa="maplibre">
      <div ref={div} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

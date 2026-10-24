import { describe, expect, it } from "vitest";
import { zonas, puestos } from "./data";
import { colorZona, estiloMapTiler, geojsonPuestos, geojsonZonas } from "./mapaColores";

const rec = () => ({ accion: "brigada" as const, digital: 0.8 });

describe("capas del mapa", () => {
  it("una zona sin histórico ni meta no inventa color", () => {
    const sinDatos = { ...zonas[0], potencial: 0, meta: 0 };
    expect(colorZona("tierra", sinDatos, rec())).toBe("#2a3140");
    expect(colorZona("meta", sinDatos, rec())).toBe("#2a3140");
    expect(colorZona("accion", sinDatos, rec())).toBe("#f0a73a");
  });

  it("las zonas salen como polígonos cerrados con su color y la selección marcada", () => {
    const g = geojsonZonas(zonas, "accion", rec, zonas[2].id);
    expect(g.features).toHaveLength(zonas.length);
    const anillo = g.features[0].geometry.coordinates[0];
    expect(anillo[0]).toEqual(anillo[anillo.length - 1]);
    expect(g.features[2].properties.sel).toBe(true);
    expect(g.features[0].properties.color).toBe("#f0a73a");
  });

  it("los puestos llevan su color de cobertura", () => {
    expect(geojsonPuestos(puestos).features[0].properties.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("la clave va codificada en la dirección del estilo", () => {
    expect(estiloMapTiler("a b")).toBe("https://api.maptiler.com/maps/dataviz-dark/style.json?key=a%20b");
  });
});

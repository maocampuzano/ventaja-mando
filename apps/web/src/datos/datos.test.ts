import { describe, expect, it } from "vitest";
import { datosDemo, sesionDemoPorRol } from "./demo";
import { elegirFuente } from "./index";
import { liderDesdeFila, zonaDesdeFila } from "./supabase";
import { armarTablero } from "./tablero";

describe("modo demo", () => {
  it("la coordinadora recibe solo sus tres zonas, sus líderes y sus puestos", () => {
    const d = datosDemo(sesionDemoPorRol("coordinador")!);
    expect(d.zonas.map((z) => z.id)).toEqual(["z1", "z2", "z3"]);
    expect(d.lideres.every((l) => ["z1", "z2", "z3"].includes(l.zonaId))).toBe(true);
    expect(d.puestos.every((p) => ["z1", "z2", "z3"].includes(p.zonaId))).toBe(true);
  });

  it("el líder y el testigo no reciben datos del tablero", () => {
    expect(datosDemo(sesionDemoPorRol("lider")!).zonas).toHaveLength(0);
    expect(datosDemo(sesionDemoPorRol("testigo")!).lideres).toHaveLength(0);
  });

  it("quien ve una parte de la campaña se mide contra la meta de sus zonas", () => {
    const s = sesionDemoPorRol("coordinador")!;
    const t = armarTablero(datosDemo(s), s.rol);
    expect(t.meta.votos).toBe(t.zonas.reduce((a, z) => a + z.meta, 0));
    const g = sesionDemoPorRol("gerente")!;
    expect(armarTablero(datosDemo(g), g.rol).meta.votos).toBe(g.campana.metaVotos);
  });

  it("sin URL o clave, el modo supabase cae al modo demo", () => {
    expect(elegirFuente({ modo: "supabase" }).modo).toBe("demo");
    expect(elegirFuente({}).modo).toBe("demo");
  });
});

describe("modo supabase: traducción de las filas del tablero", () => {
  it("toma el anillo exterior del polígono y convierte los números", () => {
    const z = zonaDesdeFila({
      territorio_id: "t1", nombre: "Centro",
      geojson: { type: "MultiPolygon", coordinates: [[[[-75.4, 10.3], [-75.39, 10.3], [-75.39, 10.31], [-75.4, 10.3]]]] },
      centro: { coordinates: [-75.395, 10.303] }, meta: null, potencial: 1200, bruto: 10, validados: 6, comprometidos: 2,
      lideres: 1, alcance: 300, clics: 12, gasto: "45000" as unknown as number,
    });
    expect(z.anillo).toHaveLength(4);
    expect(z.centro).toEqual([-75.395, 10.303]);
    expect(z.meta).toBe(0);
    expect(z.gasto).toBe(45000);
  });

  it("calcula el índice del líder con los componentes que trae la base", () => {
    const l = liderDesdeFila({
      lider_id: "l1", nombre: "Líder", territorio_ids: ["t1"], meta: 100, registrados: 50, validados: 40,
      duplicados_con_otros: 5, tareas_hechas: 3, tareas_asignadas: 4,
    });
    expect(l.zonaId).toBe("t1");
    expect(l.indice.componentes.calidad).toBeCloseTo(0.8);
    expect(l.indice.componentes.limpieza).toBeCloseTo(0.9);
  });
});

import { describe, expect, it } from "vitest";
import {
  HERRAMIENTAS_STRATEGOS, armarDatosStrategos, costoEstimadoUsd, ejecutarHerramienta, refsLideres, responderSimulado,
  type DatosStrategos, type TareaPropuesta,
} from "./strategos";

// Datos ficticios. Los nombres de los líderes NO entran a DatosStrategos: solo sirven para comprobar que no se filtran.
const NOMBRES = { a: "Yesenia Barrios", b: "Rafael Pérez", c: "Luz Marina Julio", d: "Edwin Cassiani" };
const refs = refsLideres(Object.keys(NOMBRES));
const z = (id: string, nombre: string, validados: number, alcance: number, potencial: number) => ({
  id, nombre, meta: 1000, potencial, bruto: validados * 2, validados, comprometidos: Math.round(validados / 2), lideres: 2, alcance, clics: alcance / 10, gasto: alcance * 3,
});
const datos: DatosStrategos = {
  campana: { candidato: "Laura Méndez", cargo: "Alcaldía de Turbaco", metaVotos: 4000, eleccion: "2027-10-31" },
  zonas: [
    z("z1", "Centro", 900, 1000, 500),       // tierra alta, digital alto
    z("z2", "La Ceiba", 100, 9000, 600),     // brigada: digital alto, tierra baja
    z("z3", "Villa Rosa", 950, 500, 400),    // pauta: tierra alta, digital bajo
    z("z4", "El Mirador", 80, 900, 9000),    // oportunidad
  ],
  lideres: [
    { ref: refs.get("a")!, zonaId: "z1", registrados: 200, validados: 180, duplicadosConOtros: 2, tareasHechas: 9, tareasAsignadas: 10, meta: 200 },
    { ref: refs.get("b")!, zonaId: "z2", registrados: 300, validados: 60, duplicadosConOtros: 90, tareasHechas: 1, tareasAsignadas: 10, meta: 300 },
    { ref: refs.get("c")!, zonaId: "z3", registrados: 100, validados: 50, duplicadosConOtros: 5, tareasHechas: 5, tareasAsignadas: 10, meta: 150 },
    { ref: refs.get("d")!, zonaId: "z4", registrados: 0, validados: 0, duplicadosConOtros: 0, tareasHechas: 0, tareasAsignadas: 0, meta: 100 },
  ],
};

const PROHIBIDAS = /^(nombre|nombres|telefono|celular|documento|cedula|correo|email|persona|personas|lider_id|usuario_id|direccion)$/i;
function clavesProhibidas(x: unknown, ruta = "$"): string[] {
  if (Array.isArray(x)) return x.flatMap((v, i) => clavesProhibidas(v, `${ruta}[${i}]`));
  if (x && typeof x === "object") {
    return Object.entries(x).flatMap(([k, v]) => [...(PROHIBIDAS.test(k) ? [`${ruta}.${k}`] : []), ...clavesProhibidas(v, `${ruta}.${k}`)]);
  }
  return [];
}

const ENTRADAS: Record<string, unknown[]> = {
  resumen_campana: [{}],
  zonas: [{ orden: "brecha", limite: 50 }, { orden: "validados", limite: 1 }, { orden: "inventado", limite: -3 }],
  indice_lideres: [{ orden: "mas_bajos", limite: 50 }, { orden: "mas_altos", limite: 2 }, {}],
  proponer_tarea: [{ tipo: "brigada", titulo: "Brigada", detalle: "Sábado", zonas: ["z2"], lideres: [refs.get("b")] }],
};

describe("regla 6: ninguna herramienta de Strategos devuelve filas de personas", () => {
  it("todas las herramientas definidas tienen casos de prueba", () => {
    expect(HERRAMIENTAS_STRATEGOS.map((h) => h.name).sort()).toEqual(Object.keys(ENTRADAS).sort());
  });

  for (const h of HERRAMIENTAS_STRATEGOS) {
    it(`«${h.name}» no trae campos de personas ni nombres de líderes`, () => {
      for (const entrada of ENTRADAS[h.name]) {
        const r = ejecutarHerramienta(h.name, entrada, datos, []);
        expect(clavesProhibidas(r.datos), JSON.stringify(entrada)).toEqual([]);
        const texto = JSON.stringify(r);
        for (const n of Object.values(NOMBRES)) expect(texto).not.toContain(n);
        expect(r.fuente.length).toBeGreaterThan(10); // toda respuesta dice de qué datos salió
      }
    });
  }

  it("las respuestas simuladas tampoco nombran a nadie", () => {
    for (const q of ["¿Dónde actúo esta semana?", "¿Qué líderes debo revisar?", "¿Cómo vamos frente a la meta?"]) {
      const r = JSON.stringify(responderSimulado(q, datos));
      for (const n of Object.values(NOMBRES)) expect(r).not.toContain(n);
    }
  });
});

describe("armar los datos desde el tablero", () => {
  it("no deja pasar nombres, teléfonos ni ids aunque vengan en la entrada", () => {
    const conDatos = [{ id: "uuid-1", nombre: "Yesenia Barrios", telefono: "+57 300 000 0001", zonaId: "z1", registrados: 1,
      validados: 1, duplicadosConOtros: 0, tareasHechas: 0, tareasAsignadas: 0, meta: 5 }];
    const d = armarDatosStrategos({ ...datos.campana, correo: "x@y.co" } as DatosStrategos["campana"],
      datos.zonas.map((zz) => ({ ...zz, telefono: "300" })), conDatos);
    const texto = JSON.stringify(d);
    expect(texto).not.toMatch(/Yesenia|\+57|uuid-1|telefono|correo/);
    expect(d.lideres[0].ref).toBe("L-01");
  });
});

describe("herramientas", () => {
  it("referencias de líder estables y sin datos de la base", () => {
    const a = refsLideres(["x3", "x1", "x2"]);
    const b = refsLideres(["x2", "x3", "x1", "x1"]);
    expect([...a.entries()]).toEqual([...b.entries()]);
    expect(a.get("x1")).toBe("L-01");
    expect(refsLideres(Array.from({ length: 120 }, (_, i) => `id${i}`)).get("id0")).toBe("L-001");
  });

  it("zonas: ordena, limita y recomienda", () => {
    const r = ejecutarHerramienta("zonas", { orden: "brecha", limite: 2 }, datos, []).datos as { id: string; accion: string }[];
    expect(r).toHaveLength(2);
    expect(r[0].id).toBe("z4");
    const todas = ejecutarHerramienta("zonas", { orden: "brecha", limite: 50 }, datos, []).datos as { id: string; accion: string }[];
    expect(Object.fromEntries(todas.map((x) => [x.id, x.accion]))).toMatchObject({ z2: "brigada", z3: "pauta", z4: "oportunidad" });
  });

  it("proponer_tarea valida zonas y referencias, y no pasa de cinco", () => {
    const p: TareaPropuesta[] = [];
    expect(ejecutarHerramienta("proponer_tarea", { tipo: "brigada", titulo: "x", detalle: "y", zonas: ["z99"], lideres: [] }, datos, p).datos)
      .toEqual({ error: "No existen en su alcance: z99." });
    expect(ejecutarHerramienta("proponer_tarea", { tipo: "otra", titulo: "x", detalle: "y", zonas: [], lideres: [] }, datos, p).datos)
      .toHaveProperty("error");
    for (let i = 0; i < 6; i++) ejecutarHerramienta("proponer_tarea", { tipo: "pauta", titulo: `t${i}`, detalle: "d", zonas: ["z3"], lideres: [] }, datos, p);
    expect(p).toHaveLength(5);
  });

  it("una herramienta que no existe responde con error, sin lanzar", () => {
    expect(ejecutarHerramienta("borrar_todo", {}, datos, []).datos).toEqual({ error: "No existe la herramienta «borrar_todo»." });
  });

  it("las definiciones son estrictas (sin propiedades extra)", () => {
    for (const h of HERRAMIENTAS_STRATEGOS) {
      expect(h.strict).toBe(true);
      expect(h.input_schema.additionalProperties).toBe(false);
    }
  });
});

describe("modelo simulado", () => {
  it("«¿dónde actúo?» propone brigada y llamadas, con fuentes", () => {
    const r = responderSimulado("¿Dónde actúo esta semana?", datos);
    expect(r.modelo).toBe("simulado");
    expect(r.tareas.map((t) => t.tipo)).toEqual(["brigada", "llamadas"]);
    expect(r.tareas[0].zonas).toEqual(["z2"]);
    expect(r.fuentes.length).toBeGreaterThan(0);
    expect(r.texto).toContain("La Ceiba");
  });

  it("«¿qué líderes revisar?» usa referencias y advierte que no prueba nada", () => {
    const r = responderSimulado("¿Qué líderes debo revisar?", datos);
    expect(r.tareas[0].tipo).toBe("revision_lideres");
    expect(r.tareas[0].lideres.every((l) => /^L-\d+$/.test(l))).toBe(true);
    expect(r.texto).toMatch(/no prueba/);
  });

  it("«¿cómo vamos?» presenta un escenario, no una certeza", () => {
    const r = responderSimulado("¿Cómo vamos frente a la meta?", datos);
    expect(r.texto).toMatch(/no una predicci[oó]n/);
    expect(r.tareas).toEqual([]);
  });

  it("sin datos en su alcance no inventa", () => {
    const vacio = { ...datos, zonas: [], lideres: [] };
    expect(responderSimulado("¿Qué líderes debo revisar?", vacio).texto).toMatch(/No hay líderes/);
    expect(responderSimulado("¿Dónde actúo?", vacio).tareas).toEqual([]);
  });
});

describe("costo", () => {
  it("Sonnet 5.5: $2 por millón de entrada y $10 de salida", () => {
    expect(costoEstimadoUsd("claude-sonnet-5-5", { entrada: 1_000_000, salida: 100_000, cacheLectura: 0 })).toBeCloseTo(3, 6);
    expect(costoEstimadoUsd("claude-sonnet-5-5", { entrada: 0, salida: 0, cacheLectura: 1_000_000, cacheEscritura: 1_000_000 })).toBeCloseTo(0.2 + 2.5, 6);
  });
});

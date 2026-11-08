import { afterEach, describe, expect, it } from "vitest";
import { campana } from "../data";
import { crearDiaEDemo } from "./demo-dia-e";
import { datosDemo, sesionDemoPorRol } from "./demo";

const como = (rol: string) => sesionDemoPorRol(rol)!;
let dia = crearDiaEDemo(datosDemo, campana.eleccion);
afterEach(async () => {
  if (await dia.simulacroActivo(como("gerente"))) await dia.terminarSimulacro(como("gerente"));
  dia = crearDiaEDemo(datosDemo, campana.eleccion);
});

describe("día E en modo demo", () => {
  it("cada rol ve lo suyo, como en la base", async () => {
    const todas = await dia.tableroDiaE(como("gerente"), false);
    const coord = await dia.tableroDiaE(como("coordinador"), false);
    expect(todas.length).toBeGreaterThan(coord.length);
    expect(coord.length).toBeGreaterThan(0);
    expect((await dia.tableroDiaE(como("candidato"), false)).length).toBe(todas.length);
    await expect(dia.tableroDiaE(como("lider"), false)).rejects.toThrow();
    await expect(dia.tableroDiaE(como("testigo"), false)).rejects.toThrow();
  });

  it("el tablero es el mismo en cada carga y no trae personas", async () => {
    const a = await dia.tableroDiaE(como("gerente"), false);
    expect(await dia.tableroDiaE(como("gerente"), false)).toEqual(a);
    const claves = new Set(a.flatMap((m) => Object.keys(m)));
    for (const prohibida of ["nombre", "documento", "telefono", "persona"]) expect(claves.has(prohibida)).toBe(false);
  });

  it("regla 7: un acta revisada no se vuelve a revisar y la candidata no revisa", async () => {
    const m = (await dia.tableroDiaE(como("gerente"), false)).find((x) => x.actaId)!;
    const acta = await dia.actaE14(como("gerente"), m.actaId!);
    await expect(dia.revisarE14(como("candidato"), m.actaId!, acta.lectura)).rejects.toThrow();
    await dia.revisarE14(como("gerente"), m.actaId!, acta.lectura);
    const despues = (await dia.tableroDiaE(como("gerente"), false)).find((x) => x.actaId === m.actaId)!;
    expect(despues.acta).toBe("revisada");
    await expect(dia.revisarE14(como("gerente"), m.actaId!, acta.lectura)).rejects.toThrow("ya fue revisada");
  });

  it("solo la dirección corre simulacros, uno a la vez, y lo simulado no toca lo real", async () => {
    await expect(dia.iniciarSimulacro(como("coordinador"))).rejects.toThrow();
    await dia.iniciarSimulacro(como("gerente"));
    await expect(dia.iniciarSimulacro(como("gerente"))).rejects.toThrow("Ya hay un simulacro");
    const sim = await dia.simulacroActivo(como("gerente"));
    expect(sim).not.toBeNull();
    const { ahora, jornada } = dia.relojDiaE(como("gerente"), sim);
    expect(ahora.getTime()).toBeLessThan(jornada.apertura.getTime()); // arranca antes de la apertura
    expect((await dia.tableroDiaE(como("gerente"), true)).every((m) => !m.acta)).toBe(true);
    expect((await dia.tableroDiaE(como("gerente"), false)).some((m) => m.acta)).toBe(true);
    await dia.terminarSimulacro(como("gerente"));
    expect(await dia.simulacroActivo(como("gerente"))).toBeNull();
  });

  it("atender una novedad la saca de las pendientes", async () => {
    const m = (await dia.tableroDiaE(como("gerente"), false)).find((x) => x.novedades.some((n) => n.estado === "abierta"));
    if (!m) return; // la semilla no dejó novedades abiertas a esta hora
    const n = m.novedades.find((x) => x.estado === "abierta")!;
    await expect(dia.atenderNovedad(como("candidato"), n.id, "cerrada")).rejects.toThrow();
    await dia.atenderNovedad(como("gerente"), n.id, "atendida");
    const otra = (await dia.tableroDiaE(como("gerente"), false)).flatMap((x) => x.novedades).find((x) => x.id === n.id)!;
    expect(otra.estado).toBe("atendida");
  });
});

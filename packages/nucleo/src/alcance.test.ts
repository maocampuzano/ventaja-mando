import { describe, expect, it } from "vitest";
import { exige2fa, territoriosPermitidos, territoriosVisibles, veTodaLaCampana } from "./alcance";

const arbol = [
  { id: "municipio" },
  { id: "comuna1", padreId: "municipio" },
  { id: "barrioA", padreId: "comuna1" },
  { id: "barrioB", padreId: "comuna1" },
  { id: "comuna2", padreId: "municipio" },
  { id: "barrioC", padreId: "comuna2" },
];

describe("alcance territorial", () => {
  it("un territorio asignado incluye todo lo que cuelga de él", () => {
    expect([...territoriosPermitidos(["comuna1"], arbol)].sort()).toEqual(["barrioA", "barrioB", "comuna1"]);
  });

  it("no sube al padre ni se pasa a la comuna vecina", () => {
    const s = territoriosPermitidos(["barrioA"], arbol);
    expect(s.has("comuna1")).toBe(false);
    expect(s.has("barrioC")).toBe(false);
  });

  it("tolera ciclos y asignaciones repetidas", () => {
    const conCiclo = [...arbol, { id: "municipio", padreId: "barrioC" }];
    expect(territoriosPermitidos(["comuna2", "comuna2"], conCiclo).size).toBe(6);
  });

  it("gerente y candidato ven toda la campaña; el coordinador, solo lo suyo", () => {
    expect(territoriosVisibles("gerente", [], arbol).size).toBe(6);
    expect(territoriosVisibles("candidato", [], arbol).size).toBe(6);
    expect([...territoriosVisibles("coordinador", ["comuna2"], arbol)].sort()).toEqual(["barrioC", "comuna2"]);
  });

  it("líder y testigo no ven el tablero territorial", () => {
    expect(territoriosVisibles("lider", ["comuna1"], arbol).size).toBe(0);
    expect(territoriosVisibles("testigo", ["comuna1"], arbol).size).toBe(0);
  });

  it("solo administradores y gerentes exigen dos factores", () => {
    expect(exige2fa("gerente")).toBe(true);
    expect(exige2fa("administrador")).toBe(true);
    expect(exige2fa("coordinador")).toBe(false);
    expect(veTodaLaCampana("coordinador")).toBe(false);
  });
});

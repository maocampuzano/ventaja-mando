import { describe, expect, it, vi } from "vitest";
import { primeroLaGuardada } from "./sesionRapida";

const tras = <T>(ms: number, v: T) => new Promise<T>((ok) => setTimeout(() => ok(v), ms));

describe("abrir sin esperar al servidor", () => {
  it("si el servidor responde rápido, usa su respuesta", async () => {
    const rechazo = vi.fn();
    expect(await primeroLaGuardada(tras(5, "nueva"), "guardada", rechazo, 50)).toBe("nueva");
    expect(rechazo).not.toHaveBeenCalled();
  });

  it("si el servidor tarda (sin señal), abre con la guardada sin esperar", async () => {
    const inicio = Date.now();
    const rechazo = vi.fn();
    expect(await primeroLaGuardada(tras(500, "guardada"), "guardada", rechazo, 30)).toBe("guardada");
    expect(Date.now() - inicio).toBeLessThan(300);
    await tras(550, null);
    expect(rechazo).not.toHaveBeenCalled();
  });

  it("si después el servidor rechaza la sesión, avisa para pedir entrar de nuevo", async () => {
    const rechazo = vi.fn();
    expect(await primeroLaGuardada(tras(100, null), "guardada", rechazo, 20)).toBe("guardada");
    await tras(120, null);
    expect(rechazo).toHaveBeenCalledOnce();
  });

  it("si el servidor rechaza rápido, no abre", async () => {
    expect(await primeroLaGuardada(Promise.resolve(null), "guardada", vi.fn(), 50)).toBeNull();
  });

  it("sin sesión guardada, espera al servidor como siempre", async () => {
    expect(await primeroLaGuardada(tras(80, "nueva"), null, vi.fn(), 10)).toBe("nueva");
  });
});

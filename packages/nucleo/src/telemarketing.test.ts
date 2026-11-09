import { describe, expect, it } from "vitest";
import { RESULTADOS_LLAMADA, avanceCola } from "./telemarketing";

describe("telemarketing", () => {
  it("regla 2: ningún resultado registra apoyo, intención de voto ni opinión política", () => {
    const texto = RESULTADOS_LLAMADA.map((r) => `${r.id} ${r.nombre} ${r.efecto}`).join(" ").toLowerCase();
    for (const prohibida of ["apoya", "apoyo", "vot", "simpatiza", "a favor", "en contra", "indecis"]) {
      expect(texto).not.toContain(prohibida);
    }
  });

  it("calcula el avance de la cola", () => {
    expect(avanceCola({ total: 10, hechas: 3, descartadas: 2 })).toBe(0.5);
    expect(avanceCola({ total: 0, hechas: 0, descartadas: 0 })).toBe(0);
  });
});

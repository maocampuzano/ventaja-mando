import { describe, expect, it } from "vitest";
import { diasHabilesRestantes, esDiaHabil, festivosColombia, pascua, semaforoPlazo, sumarDiasHabiles } from "./plazos";

describe("festivos de Colombia", () => {
  it("calcula la Pascua", () => {
    expect(pascua(2026)).toBe("2026-04-05");
    expect(pascua(2027)).toBe("2027-03-28");
    expect(pascua(2024)).toBe("2024-03-31");
  });

  it("los 18 festivos de 2026, con los trasladados al lunes", () => {
    expect([...festivosColombia(2026)].sort()).toEqual([
      "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03", "2026-05-01", "2026-05-18",
      "2026-06-08", "2026-06-15", "2026-06-29", "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-12",
      "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25",
    ]);
  });

  it("un festivo que ya cae en lunes no se corre", () => {
    expect(festivosColombia(2026).has("2026-10-12")).toBe(true); // 12 de octubre de 2026 es lunes
  });

  it("fines de semana y festivos no son hábiles", () => {
    expect(esDiaHabil("2026-10-24")).toBe(false); // sábado
    expect(esDiaHabil("2026-11-02")).toBe(false); // Todos los Santos, trasladado
    expect(esDiaHabil("2026-10-23")).toBe(true);
  });
});

describe("plazos en días hábiles", () => {
  it("el día de recibo no cuenta y se saltan fines de semana y festivos", () => {
    // Recibida el viernes 23/10/2026: 10 días hábiles sin contar el festivo del 2 de noviembre.
    expect(sumarDiasHabiles("2026-10-23", 10)).toBe("2026-11-09");
    expect(sumarDiasHabiles("2026-10-23", 15)).toBe("2026-11-17"); // salta también el 16 de noviembre
  });

  it("cuenta los días que faltan y los vencidos", () => {
    expect(diasHabilesRestantes("2026-10-23", "2026-10-30")).toBe(5);
    expect(diasHabilesRestantes("2026-11-09", "2026-11-09")).toBe(0);
    expect(diasHabilesRestantes("2026-11-10", "2026-11-09")).toBe(-1);
  });

  it("el semáforo avisa con tiempo", () => {
    expect(semaforoPlazo("2026-10-23", "2026-11-09")).toBe("verde");
    expect(semaforoPlazo("2026-11-02", "2026-11-09")).toBe("ambar");
    expect(semaforoPlazo("2026-11-05", "2026-11-09")).toBe("rojo");
    expect(semaforoPlazo("2026-11-10", "2026-11-09")).toBe("rojo");
  });
});

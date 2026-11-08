import { describe, expect, it } from "vitest";
import {
  debeEscalar, estadoMesa, jornadaBogota, mesasPorAtender, ordenarNovedades, resumenDiaE,
  type MesaDiaE, type NovedadDiaE,
} from "./diaE";

const j = jornadaBogota("2027-10-31");
const a = (hhmm: string) => new Date(`2027-10-31T${hhmm}:00-05:00`);
const mesa = (m: Partial<MesaDiaE> = {}): MesaDiaE =>
  ({ puestoId: "p1", mesa: 1, testigo: "en_mesa", acta: null, alertasActa: 0, novedades: [], ...m });
const nov = (n: Partial<NovedadDiaE> = {}): NovedadDiaE =>
  ({ id: "n1", prioridad: "media", estado: "abierta", hora: a("10:00"), ...n });

describe("jornada", () => {
  it("abre a las 8:00 y cierra a las 16:00 en hora de Bogotá", () => {
    expect(j.apertura.toISOString()).toBe("2027-10-31T13:00:00.000Z");
    expect(j.cierre.toISOString()).toBe("2027-10-31T21:00:00.000Z");
  });
});

describe("escalamiento de novedades", () => {
  it("escala según la prioridad: 15, 45 y 120 minutos", () => {
    expect(debeEscalar(nov({ prioridad: "alta" }), a("10:14"))).toBe(false);
    expect(debeEscalar(nov({ prioridad: "alta" }), a("10:15"))).toBe(true);
    expect(debeEscalar(nov({ prioridad: "media" }), a("10:44"))).toBe(false);
    expect(debeEscalar(nov({ prioridad: "media" }), a("10:45"))).toBe(true);
    expect(debeEscalar(nov({ prioridad: "baja" }), a("12:00"))).toBe(true);
  });

  it("no vuelve a escalar ni escala las atendidas o cerradas", () => {
    for (const estado of ["escalada", "atendida", "cerrada"] as const) {
      expect(debeEscalar(nov({ prioridad: "alta", estado }), a("15:00"))).toBe(false);
    }
  });

  it("ordena: escaladas, luego prioridad y luego la más antigua; deja fuera las cerradas", () => {
    const lista = [
      nov({ id: "baja", prioridad: "baja", hora: a("09:00") }),
      nov({ id: "alta-tarde", prioridad: "alta", hora: a("11:00") }),
      nov({ id: "alta-temprano", prioridad: "alta", hora: a("10:00") }),
      nov({ id: "escalada", prioridad: "baja", estado: "escalada" }),
      nov({ id: "cerrada", prioridad: "alta", estado: "cerrada" }),
    ];
    expect(ordenarNovedades(lista).map((n) => n.id)).toEqual(["escalada", "alta-temprano", "alta-tarde", "baja"]);
  });
});

describe("semáforo de la mesa", () => {
  it("antes del cierre: sin testigo es rojo y con testigo en la mesa es verde", () => {
    expect(estadoMesa(mesa({ testigo: null }), a("09:00"), j)).toEqual({ semaforo: "rojo", motivo: "Sin testigo" });
    expect(estadoMesa(mesa({ testigo: "retirado" }), a("09:00"), j).motivo).toBe("El testigo se retiró");
    expect(estadoMesa(mesa(), a("09:00"), j).semaforo).toBe("verde");
  });

  it("el testigo que no llega pasa a ámbar a los 30 minutos y a rojo a la hora", () => {
    const m = mesa({ testigo: "confirmado" });
    expect(estadoMesa(m, a("08:29"), j).semaforo).toBe("verde");
    expect(estadoMesa(m, a("08:30"), j).semaforo).toBe("ambar");
    expect(estadoMesa(m, a("09:00"), j).semaforo).toBe("rojo");
  });

  it("una novedad alta pone la mesa en rojo; una media, en ámbar hasta que se vence", () => {
    expect(estadoMesa(mesa({ novedades: [nov({ prioridad: "alta" })] }), a("10:01"), j).semaforo).toBe("rojo");
    expect(estadoMesa(mesa({ novedades: [nov()] }), a("10:01"), j)).toEqual({ semaforo: "ambar", motivo: "Novedad abierta" });
    expect(estadoMesa(mesa({ novedades: [nov()] }), a("10:50"), j)).toEqual({ semaforo: "rojo", motivo: "Novedad sin atender a tiempo" });
    expect(estadoMesa(mesa({ novedades: [nov({ estado: "atendida" })] }), a("10:50"), j).semaforo).toBe("verde");
  });

  it("después del cierre espera el E-14: ámbar a la hora y rojo a las dos horas", () => {
    expect(estadoMesa(mesa(), a("16:30"), j)).toEqual({ semaforo: "verde", motivo: "Esperando el E-14" });
    expect(estadoMesa(mesa(), a("17:00"), j)).toEqual({ semaforo: "ambar", motivo: "E-14 demorado" });
    expect(estadoMesa(mesa(), a("18:00"), j)).toEqual({ semaforo: "rojo", motivo: "E-14 sin llegar" });
    expect(estadoMesa(mesa({ testigo: null }), a("16:10"), j).motivo).toBe("Sin testigo y sin E-14");
  });

  it("el E-14 recibido queda en ámbar hasta que una persona lo revisa", () => {
    expect(estadoMesa(mesa({ acta: "recibida" }), a("17:00"), j).motivo).toBe("E-14 por revisar");
    expect(estadoMesa(mesa({ acta: "leida", alertasActa: 2 }), a("17:00"), j).motivo).toBe("E-14 con alertas por revisar");
    expect(estadoMesa(mesa({ acta: "revisada", alertasActa: 2 }), a("17:00"), j)).toEqual({ semaforo: "verde", motivo: "E-14 revisado" });
    expect(estadoMesa(mesa({ acta: "descartada" }), a("18:30"), j).motivo).toBe("E-14 sin llegar");
  });
});

describe("resumen y mesas por atender", () => {
  const mesas = [
    mesa({ mesa: 1 }),
    mesa({ mesa: 2, testigo: null }),
    mesa({ mesa: 3, testigo: "confirmado", novedades: [nov({ prioridad: "media" })] }),
    mesa({ mesa: 4, acta: "revisada" }),
  ];

  it("cuenta cobertura, actas, novedades y semáforo", () => {
    expect(resumenDiaE(mesas, a("10:10"), j)).toEqual({
      mesas: 4, conTestigo: 3, testigosEnMesa: 2, actasRecibidas: 1, actasRevisadas: 1,
      novedadesPendientes: 1, novedadesPorEscalar: 0, semaforo: { verde: 2, ambar: 0, rojo: 2 },
    });
  });

  it("pone primero las rojas y deja fuera las verdes", () => {
    const lista = mesasPorAtender(mesas, a("10:10"), j);
    expect(lista.map((m) => [m.mesa, m.semaforo])).toEqual([[2, "rojo"], [3, "rojo"]]);
  });
});

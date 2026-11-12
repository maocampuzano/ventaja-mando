import { describe, expect, it } from "vitest";
import type { Lider, Puesto, Zona } from "../data";
import { armarHoy, saludo } from "./hoy";

const zona = (nombre: string, validados: number, meta: number) => ({ id: nombre, nombre, validados, meta }) as Zona;
const lider = (registrados: number, duplicadosConOtros = 0) => ({ registrados, duplicadosConOtros }) as Lider;
const puesto = (nombre: string, conTestigo: number, sin: number) => ({
  nombre, mesas: [...Array(conTestigo).fill({ testigoId: "t" }), ...Array(sin).fill({})],
}) as unknown as Puesto;

describe("pantalla Hoy", () => {
  it("sin nada pendiente no inventa tareas ni avisos", () => {
    const r = armarHoy({ zonas: [zona("Centro", 80, 100)], lideres: [lider(5)], puestos: [puesto("Colegio", 3, 0)] }, {});
    expect(r).toEqual({ pendientes: [], avisos: [] });
  });

  it("arma los pendientes con su destino y pone primero las solicitudes vencidas", () => {
    const r = armarHoy(
      { zonas: [], lideres: [lider(0), lider(0), lider(4)], puestos: [puesto("Colegio A", 1, 2), puesto("Escuela B", 0, 5)] },
      { planillasPorRevisar: 1, enviosPorAprobar: 2, solicitudesAbiertas: 3, solicitudesVencidas: 1 },
    );
    expect(r.pendientes.map((p) => [p.id, p.vista])).toEqual([
      ["solicitudes-vencidas", "datos"], ["planillas", "planillas"], ["envios-aprobar", "mensajes"], ["testigos", "diae"], ["lideres-inactivos", "lideres"],
    ]);
    expect(r.pendientes[0].urgente).toBe(true);
    expect(r.pendientes[1].titulo).toBe("Revisar 1 planilla que subió un líder");
    expect(r.pendientes[3].titulo).toBe("Asignar testigos a 7 mesas sin cubrir");
    expect(r.pendientes[3].detalle).toBe("Donde más faltan: Escuela B y Colegio A.");
    expect(r.pendientes[4].titulo).toBe("Hablar con 2 líderes que no han registrado a nadie");
  });

  it("avisa del tope, de las zonas atrasadas y de los registros repetidos", () => {
    const r = armarHoy(
      { zonas: [zona("Villa Rosa", 10, 100), zona("Centro", 90, 100), zona("Sin meta", 0, 0)], lideres: [lider(3, 4)], puestos: [] },
      { usoTope: 0.96 },
    );
    expect(r.avisos).toEqual([
      { id: "tope", nivel: "rojo", texto: "Los gastos van en 96 % del tope del CNE." },
      { id: "zonas-atrasadas", nivel: "ambar", texto: "1 zona va por debajo del 25 % de su meta: Villa Rosa." },
      { id: "repetidos", nivel: "ambar", texto: "4 registros aparecen con más de un líder. No se cuentan dos veces en los validados." },
    ]);
    expect(armarHoy({ zonas: [], lideres: [], puestos: [] }, { usoTope: null }).avisos[0].id).toBe("sin-tope");
    expect(armarHoy({ zonas: [], lideres: [], puestos: [] }, { usoTope: 0.5 }).avisos).toEqual([]);
  });

  it("saluda según la hora de Colombia", () => {
    expect(saludo(new Date("2027-03-01T13:00:00Z"))).toBe("Buenos días"); // 8:00 a. m. en Bogotá
    expect(saludo(new Date("2027-03-01T20:00:00Z"))).toBe("Buenas tardes"); // 3:00 p. m.
    expect(saludo(new Date("2027-03-02T01:00:00Z"))).toBe("Buenas noches"); // 8:00 p. m.
  });
});

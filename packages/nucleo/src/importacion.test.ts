import { describe, expect, it } from "vitest";
import { leerCsv, leerFecha, prepararImportacion, reconocerColumnas, type OpcionesImportacion } from "./importacion";

const opciones: OpcionesImportacion = {
  zonas: [{ id: "z1", nombre: "Centro" }, { id: "z2", nombre: "La Ceiba" }],
  lideres: [{ id: "l1", nombre: "Yesenia Barrios" }],
  zonaObligatoria: false,
  hoy: "2026-10-23",
};
const ENC = ["Nombre completo", "Cédula", "Celular", "Barrio", "Líder", "Autoriza datos", "Fecha"];
const preparar = (filas: string[][], o: Partial<OpcionesImportacion> = {}) =>
  prepararImportacion(filas, reconocerColumnas(ENC), { ...opciones, ...o });

describe("reconocer columnas", () => {
  it("reconoce los encabezados más comunes, con o sin tildes", () => {
    expect(reconocerColumnas(ENC)).toEqual({ nombre: 0, documento: 1, telefono: 2, zona: 3, lider: 4, autoriza: 5, fecha_autorizacion: 6 });
  });
  it("no asigna la misma columna a dos campos", () => {
    const m = reconocerColumnas(["Fecha de autorización", "Fecha"]);
    expect(m.fecha_autorizacion).toBe(0);
  });
});

describe("leer archivos", () => {
  it("lee CSV con punto y coma, comillas y BOM", () => {
    expect(leerCsv('\uFEFFnombre;cc\r\n"Peña; Ana";123\r\n\r\n')).toEqual([["nombre", "cc"], ["Peña; Ana", "123"]]);
  });
  it("entiende fechas de Colombia, ISO y de Excel, y rechaza las imposibles", () => {
    expect(leerFecha("05/03/2026")).toBe("2026-03-05");
    expect(leerFecha("2026-03-05T00:00:00")).toBe("2026-03-05");
    expect(leerFecha("46086")).toBe("2026-03-05");
    expect(leerFecha("31/02/2026")).toBeNull();
    expect(leerFecha("mañana")).toBeNull();
  });
});

describe("validar filas", () => {
  it("una fila completa queda lista, con la cédula y el celular normalizados", () => {
    const r = preparar([["Ana Peña", "1.047.000.218", "+57 300 000 1234", "La Ceiba", "Yesenia Barrios", "Sí", "05/03/2026"]]);
    expect(r.rechazadas).toEqual([]);
    expect(r.listas[0]).toEqual({ numero: 2, nombre: "Ana Peña", documento: "1047000218", telefono: "3000001234", zonaId: "z2", liderId: "l1", fechaAutorizacion: "2026-03-05" });
  });

  it("sin autorización no entra (regla 3)", () => {
    const r = preparar([["Ana Peña", "", "", "", "", "No", ""], ["Luis Díaz", "", "", "", "", "", ""]]);
    expect(r.listas).toHaveLength(0);
    expect(r.rechazadas.map((x) => x.numero)).toEqual([2, 3]);
    expect(r.rechazadas[0].mensaje).toMatch(/sin autorización/);
  });

  it("explica por qué rechaza: cédula, fecha futura y zona desconocida", () => {
    const r = preparar([
      ["Ana Peña", "12ab", "", "", "", "si", ""],
      ["Luis Díaz", "", "", "", "", "si", "01/01/2030"],
      ["Rosa Julio", "", "", "Marte", "", "si", ""],
    ]);
    expect(r.rechazadas.map((x) => x.mensaje)).toEqual([
      "la cédula «12ab» no es válida",
      "la fecha de autorización es posterior a hoy",
      "la zona «Marte» no existe o no está en su territorio",
    ]);
  });

  it("un celular malo o un líder desconocido no rechazan la fila: avisan", () => {
    const r = preparar([["Ana Peña", "", "123", "", "Otro Líder", "x", ""]]);
    expect(r.listas).toHaveLength(1);
    expect(r.listas[0].telefono).toBeUndefined();
    expect(r.advertencias).toHaveLength(2);
  });

  it("si el coordinador no indica zona, la fila no entra", () => {
    const r = preparar([["Ana Peña", "", "", "", "", "si", ""]], { zonaObligatoria: true });
    expect(r.rechazadas[0].mensaje).toBe("falta la zona");
  });

  it("sin columna de autorización no se puede importar", () => {
    const r = prepararImportacion([["Ana"]], reconocerColumnas(["Nombre"]), opciones);
    expect(r.faltanColumnas).toEqual(["autoriza"]);
  });
});

describe("duplicados dentro del archivo", () => {
  it("la misma cédula queda una sola vez y se explica; el mismo celular solo se avisa", () => {
    const r = preparar([
      ["Ana Peña", "1047000218", "3000000001", "Centro", "", "si", ""],
      ["Ana M. Peña", "1.047.000.218", "", "Centro", "", "si", ""],
      ["Carlos Díaz", "", "3000000009", "Centro", "", "si", ""],
      ["Carlos Diaz", "", "300 000 0009", "Centro", "", "si", ""],
    ]);
    expect(r.listas.map((l) => l.numero)).toEqual([2, 4, 5]);
    expect(r.rechazadas).toEqual([{ numero: 3, mensaje: "misma cédula que la fila 2" }]);
    expect(r.duplicados).toEqual([{ a: "2", b: "3", puntaje: 0.75, razones: ["mismo documento", "mismo territorio"], accion: "rechazada" }]);
    expect(r.advertencias).toEqual([{ numero: 5, mensaje: "mismo celular que la fila 4: revisar si es la misma persona" }]);
  });

  it("5.000 filas se preparan en menos de 2 segundos", () => {
    const nombres = ["María", "José", "Luz", "Carlos", "Ana", "Andrés", "Leidy", "Jorge"];
    const apellidos = ["Peña", "Ortiz", "Gómez", "Díaz", "Ruiz", "Julio", "Herrera", "Tapia", "Puello", "Castro"];
    const filas = Array.from({ length: 5000 }, (_, i) => [
      `${nombres[i % 8]} ${apellidos[(i * 7) % 10]} ${apellidos[(i * 3) % 10]}`,
      String(1000000 + (i % 4900)), // 100 cédulas repetidas a propósito
      `300${String(1000000 + i).slice(-7)}`, i % 2 ? "Centro" : "La Ceiba", "", "si", "",
    ]);
    const t = performance.now();
    const r = preparar(filas);
    expect(performance.now() - t).toBeLessThan(2000);
    expect(r.listas.length + r.rechazadas.length).toBe(5000);
    expect(r.rechazadas.filter((x) => /misma cédula/.test(x.mensaje))).toHaveLength(100);
  });
});

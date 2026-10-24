import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { ColaSincronizacion, ErrorDeRed, type Transporte } from "@ventaja/nucleo";
import { AlmacenSQLite, CopiaLocal, prepararBase, type BaseSQLite } from "./almacenSqlite";
import { crearFuenteDemo } from "./demo";
import { esArchivoLocal, rutaFoto } from "./rutas";

/** La misma interfaz de expo-sqlite, sobre el SQLite que trae Node, en un archivo real. */
function baseDePrueba(archivo = ":memory:"): BaseSQLite & { db: DatabaseSync } {
  const db = new DatabaseSync(archivo);
  return {
    db,
    async execAsync(sql) { db.exec(sql); },
    async runAsync(sql, ...p) { return db.prepare(sql).run(...p); },
    async getAllAsync<T>(sql: string, ...p: (string | number | null)[]) { return db.prepare(sql).all(...p) as T[]; },
  };
}

describe("almacén SQLite de la cola", () => {
  it("sobrevive al cierre de la app: lo pendiente sigue ahí y se envía una sola vez", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const archivo = join(mkdtempSync(join(tmpdir(), "cola-")), "ventaja.db");

    const b1 = baseDePrueba(archivo);
    await prepararBase(b1);
    let n = 0;
    const servidor = new Map<string, unknown>();
    let senal = false;
    const t: Transporte = { async enviar(op) {
      if (!senal) throw new ErrorDeRed("sin señal");
      const ya = servidor.has(op.id); servidor.set(op.id, op.datos); return ya ? "ya_estaba" : "creada";
    } };
    const cola1 = new ColaSincronizacion(new AlmacenSQLite(b1), t, () => `id-${++n}`, () => 1_000);
    for (let i = 0; i < 10; i++) await cola1.agregar("persona", { nombre: `Persona Ficticia ${i}` });
    await cola1.agregar("planilla", { archivo: "file:///planilla-1.jpg" });
    await cola1.agregar("planilla", { archivo: "file:///planilla-2.jpg" });
    await cola1.sincronizar();
    b1.db.close(); // se cierra la app

    const b2 = baseDePrueba(archivo);
    await prepararBase(b2);
    senal = true;
    const cola2 = new ColaSincronizacion(new AlmacenSQLite(b2), t, () => "no-se-usa", () => 10_000_000);
    expect((await cola2.conteo()).pendiente).toBe(12);
    await cola2.sincronizar();
    await cola2.sincronizar();
    expect(servidor.size).toBe(12);
    expect(await cola2.conteo()).toEqual({ pendiente: 0, enviado: 12, revisado: 0, error: 0 });
    expect((await cola2.operaciones())[10].datos).toEqual({ archivo: "file:///planilla-1.jpg" });
  });

  it("guarda el motivo del error y lo borra al reintentar", async () => {
    const b = baseDePrueba();
    await prepararBase(b);
    const a = new AlmacenSQLite(b);
    await a.guardar({ id: "x", tipo: "persona", datos: { nombre: "" }, estado: "error", intentos: 1, creadaEn: 1, proximoIntento: 0, ultimoError: "Falta el nombre." });
    expect((await a.todas())[0].ultimoError).toBe("Falta el nombre.");
    await a.guardar({ id: "x", tipo: "persona", datos: { nombre: "Ana" }, estado: "pendiente", intentos: 1, creadaEn: 1, proximoIntento: 0 });
    expect((await a.todas())[0]).not.toHaveProperty("ultimoError");
    await a.borrar("x");
    expect(await a.todas()).toEqual([]);
  });

  it("la copia local guarda lo último que llegó y se borra entera al cerrar sesión", async () => {
    const b = baseDePrueba();
    await prepararBase(b);
    const c = new CopiaLocal(b);
    await c.escribir("lider", { meta: 187 }, 5);
    expect(await c.leer("lider")).toEqual({ valor: { meta: 187 }, actualizadaEn: 5 });
    await new AlmacenSQLite(b).guardar({ id: "y", tipo: "planilla", datos: {}, estado: "pendiente", intentos: 0, creadaEn: 1, proximoIntento: 0 });
    await c.borrarTodo();
    expect(await c.leer("lider")).toBeNull();
    expect(await new AlmacenSQLite(b).todas()).toEqual([]);
  });
});

describe("fotos", () => {
  it("cada foto va en la carpeta de su campaña y su usuario, con el identificador de la operación", () => {
    expect(rutaFoto("c", "u", "op-1")).toBe("c/u/op-1.jpg");
    expect(rutaFoto("c", "u", "op-1", "autorizacion")).toBe("c/u/op-1-autorizacion.jpg");
    expect(esArchivoLocal("file:///data/foto.jpg")).toBe(true);
    expect(esArchivoLocal("c/u/op-1.jpg")).toBe(false);
  });
});

describe("modo demo", () => {
  it("solo entra con las cuentas ficticias y sus datos no traen cédulas", async () => {
    const f = crearFuenteDemo();
    await expect(f.iniciarSesion("alguien@real.co", "x")).rejects.toThrow("lider@demo.co");
    const s = await f.iniciarSesion("lider@demo.co", "x");
    const d = await f.datosLider(s);
    expect(d.personas).toHaveLength(8);
    expect(JSON.stringify(d)).not.toMatch(/documento|cedula|cédula/i);
  });

  it("sin señal simulada, la lectura falla como sin red y la app usa su copia local", async () => {
    const f = crearFuenteDemo();
    const s = await f.iniciarSesion("testigo@demo.co", "x");
    f.servidor.sinSenal = true;
    await expect(f.datosTestigo(s)).rejects.toBeInstanceOf(ErrorDeRed);
  });
});

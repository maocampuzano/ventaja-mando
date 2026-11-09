import { describe, expect, it } from "vitest";
import { limpiarTexto, nombreAccion, prepararError } from "./errores";

describe("limpieza de errores", () => {
  it("quita celulares, cédulas, NIT y correos", () => {
    expect(limpiarTexto("El celular +57 300 000 9001 no es válido")).toBe("El celular ‹número› no es válido");
    expect(limpiarTexto("Cédula 1.047.000.218 repetida")).toBe("Cédula ‹número› repetida");
    expect(limpiarTexto("NIT 900000001-2")).toBe("NIT ‹número›");
    expect(limpiarTexto("Escriba a ana.ruiz@ejemplo.co")).toBe("Escriba a ‹correo›");
  });

  it("deja los números cortos (líneas, mesas, códigos)", () => {
    expect(limpiarTexto("Falló en la línea 42, columna 7, mesa 3, código 208")).toBe("Falló en la línea 42, columna 7, mesa 3, código 208");
  });

  it("quita claves y los parámetros de las direcciones", () => {
    expect(limpiarTexto("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc")).toBe("Bearer ‹clave›");
    expect(limpiarTexto("GET https://x.supabase.co/rest/v1/persona?telefono=eq.3000009001 falló")).toBe("GET https://x.supabase.co/rest/v1/persona falló");
  });

  it("prepara el error sin el token de la ruta y con largo máximo", () => {
    const e = prepararError(new TypeError("falla de prueba ".repeat(60)), "https://panel.co/#b/17.0123456789ab", "1.2.3", "Mozilla/5.0");
    expect(e.mensaje.length).toBe(500);
    expect(e.ruta).toBe("https://panel.co/");
    expect(prepararError("algo raro", "/", "v", "n").mensaje).toBe("Error: algo raro");
  });

  it("nombra las acciones de la auditoría", () => {
    expect(nombreAccion("exportar_personas")).toBe("Exportó personas");
    expect(nombreAccion("accion_nueva")).toBe("accion nueva");
  });
});

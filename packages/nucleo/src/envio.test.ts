import { describe, expect, it } from "vitest";
import { destinoSms, enlaceBaja, enviarLote, type Proveedor } from "./envio";

describe("envío por lotes", () => {
  it("normaliza celulares colombianos y rechaza lo demás", () => {
    expect(destinoSms("+57 300 000 9001")).toBe("+573000009001");
    expect(destinoSms("300-000-9001")).toBe("+573000009001");
    expect(destinoSms("6015551234")).toBeNull(); // fijo
    expect(destinoSms("300 000 900")).toBeNull();
    expect(destinoSms(null)).toBeNull();
  });

  it("arma el enlace de baja con la dirección del panel", () => {
    expect(enlaceBaja("https://panel.co/", "17.abc")).toBe("https://panel.co/#b/17.abc");
  });

  it("envía a cada persona con su nombre y su enlace, y sigue aunque una falle", async () => {
    const enviados: { destino: string; texto: string }[] = [];
    const proveedor: Proveedor = {
      nombre: "prueba", canal: "sms",
      async enviar(destino, texto) {
        if (destino.endsWith("9999")) throw new Error("Número bloqueado por el operador");
        enviados.push({ destino, texto });
        return { ref: `r-${enviados.length}` };
      },
    };
    const registro: unknown[][] = [];
    const r = await enviarLote(proveedor, [
      { destinatarioId: "d1", nombre: "ANA RUIZ", destino: "+57 300 000 0001", tokenBaja: "1.f1" },
      { destinatarioId: "d2", nombre: "Luis", destino: "123", tokenBaja: "2.f2" },
      { destinatarioId: "d3", nombre: "Eva", destino: "3000009999", tokenBaja: "3.f3" },
    ], { canal: "sms", plantilla: "Hola {nombre}.", campana: "C", urlPanel: "https://p.co" }, async (...a) => { registro.push(a); });

    expect(r).toEqual({ enviados: 1, fallidos: 2 });
    expect(enviados).toEqual([{ destino: "+573000000001", texto: "Hola Ana.\nC. Dejar de recibir: https://p.co/#b/1.f1" }]);
    expect(registro).toEqual([
      ["d1", true, "r-1", null],
      ["d2", false, null, "El celular no es válido."],
      ["d3", false, null, "Número bloqueado por el operador"],
    ]);
  });

  it("no mezcla canales", async () => {
    const correo: Proveedor = { nombre: "correo", canal: "email", enviar: async () => ({ ref: "x" }) };
    await expect(enviarLote(correo, [], { canal: "sms", plantilla: "x", campana: "C", urlPanel: "u" }, async () => {})).rejects.toThrow(/es de email/);
  });
});

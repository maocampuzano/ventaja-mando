import { test } from "node:test";
import assert from "node:assert/strict";
import { enlaceInvitacion, leerArgumentos } from "./crear-campana.mjs";

const base = ["--nombre", " Candidata Ficticia ", "--cargo", "Gobernación del Caquetá", "--dane", "18", "--eleccion", "31/10/2027", "--meta", "74.000", "--gerente", "g@ficticio.co"];

test("lee los argumentos en formato colombiano", () => {
  assert.deepEqual(leerArgumentos([...base, "--tope", "$ 450.000.000"]), {
    p_nombre: "Candidata Ficticia", p_cargo: "Gobernación del Caquetá", p_divipole: "18", p_eleccion: "2027-10-31",
    p_meta: 74000, p_correo_gerente: "g@ficticio.co", p_organizacion: null, p_tope: 450000000,
  });
});

test("explica qué falta o qué está mal", () => {
  assert.throws(() => leerArgumentos(base.slice(0, -2)), /Falta --gerente/);
  assert.throws(() => leerArgumentos(base.map((x) => (x === "31/10/2027" ? "2027-10-31" : x))), /dd\/mm\/aaaa/);
  assert.throws(() => leerArgumentos(base.map((x) => (x === "74.000" ? "muchos" : x))), /meta de votos/);
  assert.throws(() => leerArgumentos([...base, "--tope"]), /Falta el valor de --tope/);
});

test("arma el enlace de la invitación", () => {
  assert.equal(enlaceInvitacion("https://panel.co/", "a-b_c"), "https://panel.co/?invitacion=a-b_c");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { codigoPuesto, cruzarMunicipio, enColombia, normalizar, preparar } from "./preparar-datos-abiertos.mjs";

// Muestra mínima con la forma de las filas del DANE (los nombres y códigos son los oficiales).
const DANE = [
  { cod_dpto: "05", dpto: "ANTIOQUIA", cod_mpio: "05664", nom_mpio: "SAN PEDRO DE LOS MILAGROS", latitud: "6,459", longitud: "-75,556" },
  { cod_dpto: "05", dpto: "ANTIOQUIA", cod_mpio: "05665", nom_mpio: "SAN PEDRO DE URABÁ", latitud: "8,276", longitud: "-76,379" },
  { cod_dpto: "05", dpto: "ANTIOQUIA", cod_mpio: "05237", nom_mpio: "DONMATÍAS", latitud: "6,486", longitud: "-75,395" },
  { cod_dpto: "13", dpto: "BOLÍVAR", cod_mpio: "13001", nom_mpio: "CARTAGENA DE INDIAS", latitud: "10,391", longitud: "-75,479" },
  { cod_dpto: "13", dpto: "BOLÍVAR", cod_mpio: "13468", nom_mpio: "SANTA CRUZ DE MOMPOX", latitud: "9,240", longitud: "-74,426" },
  { cod_dpto: "13", dpto: "BOLÍVAR", cod_mpio: "13836", nom_mpio: "TURBACO", latitud: "10,332", longitud: "-75,411" },
  { cod_dpto: "54", dpto: "NORTE DE SANTANDER", cod_mpio: "54001", nom_mpio: "SAN JOSÉ DE CÚCUTA", latitud: "7,889", longitud: "-72,496" },
];

test("normaliza tildes, puntuación y espacios", () => {
  assert.equal(normalizar("  Bogotá,  D.C. "), "BOGOTA D C");
});

test("cruza por nombre exacto aunque la Registraduría no use tildes", () => {
  assert.equal(cruzarMunicipio(DANE, "BOLIVAR", "TURBACO").codigo, "13836");
});

test("entiende el departamento abreviado y el nombre corto del municipio", () => {
  const m = cruzarMunicipio(DANE, "NORTE DE SAN", "CUCUTA", [[7.89, -72.5]]);
  assert.equal(m.codigo, "54001");
  assert.equal(m.metodo, "palabras");
});

test("con dos candidatos decide por cercanía a la cabecera", () => {
  const m = cruzarMunicipio(DANE, "ANTIOQUIA", "SAN PEDRO", [[6.46, -75.55], [6.47, -75.56]]);
  assert.equal(m.codigo, "05664");
  assert.equal(m.metodo, "palabras y cercanía");
});

test("con dos candidatos y sin coordenadas no adivina", () => {
  assert.equal(cruzarMunicipio(DANE, "ANTIOQUIA", "SAN PEDRO", []), null);
});

test("un punto absurdo no arrastra la decisión (usa la mediana)", () => {
  const m = cruzarMunicipio(DANE, "ANTIOQUIA", "SAN PEDRO", [[6.46, -75.55], [6.47, -75.56], [8.27, -76.38]]);
  assert.equal(m.codigo, "05664");
});

test("cruza nombres pegados y los alias revisados", () => {
  assert.equal(cruzarMunicipio(DANE, "ANTIOQUIA", "DON MATIAS").codigo, "05237");
  assert.equal(cruzarMunicipio(DANE, "BOLIVAR", "MOMPOS").metodo, "alias revisado");
});

test("si el candidato queda muy lejos, no lo acepta", () => {
  assert.equal(cruzarMunicipio(DANE, "BOLIVAR", "CARTAGENA", [[4.6, -74.1]]), null);
});

test("las coordenadas fuera de Colombia se descartan", () => {
  assert.equal(enColombia(10965899, -74.8), false);
  assert.equal(enColombia(10.39, -75.48), true);
  assert.equal(enColombia(null, -75), false);
});

test("el código del puesto es estable y distingue puestos homónimos", () => {
  const a = { departamento: "BOGOTA D.C.", municipio: "BOGOTA. D.C.", comuna: "01 USAQUEN", puesto: "SAN JOSE", direccion: "CL 1" };
  const b = { ...a, comuna: "08 KENNEDY", direccion: "CL 2" };
  assert.equal(codigoPuesto("11001", a), codigoPuesto("11001", { ...a }));
  assert.notEqual(codigoPuesto("11001", a), codigoPuesto("11001", b));
  assert.match(codigoPuesto("11001", a), /^RNEC23-11001-[0-9a-f]{8}$/);
});

test("prepara los CSV en el formato de cargar-territorios y deja sin ubicación lo imposible", () => {
  const rnec = [
    { departamento: "BOLIVAR", municipio: "TURBACO", puesto: "Puesto, uno", comuna: "", direccion: "", latitud: "10.33", longitud: "-75.41" },
    { departamento: "BOLIVAR", municipio: "TURBACO", puesto: "Puesto dos", comuna: "", direccion: "", latitud: "10965899", longitud: "-75.41" },
    { departamento: "ANTIOQUIA", municipio: "SAN PEDRO", puesto: "Sin pistas", comuna: "", direccion: "", latitud: "", longitud: "" },
  ];
  const r = preparar(DANE, rnec);
  const filas = r.puestosCsv.trim().split("\n");
  assert.equal(filas[0], "codigo,nombre,cod_mpio,mesas,latitud,longitud");
  assert.equal(r.total.puestos, 2);
  assert.match(filas[1], /,"Puesto, uno",13836,,10.33,-75.41$/);
  assert.match(filas[2], /,Puesto dos,13836,,,$/);
  assert.equal(r.sinUbicacion.length, 1);
  assert.deepEqual(r.sinCruce, [{ dpto: "ANTIOQUIA", mpio: "SAN PEDRO", puestos: 1 }]);
  assert.match(r.municipiosCsv, /^cod_dpto,dpto,cod_mpio,mpio\n05,ANTIOQUIA,05664,SAN PEDRO DE LOS MILAGROS\n/);
});

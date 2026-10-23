// Importación de bases en Excel o CSV (fase 2): reconoce columnas, valida cada fila y explica los duplicados.
// Regla 3: ninguna fila entra sin una autorización registrada. La cédula solo se usa aquí para comparar
// filas del mismo archivo; en la base se guarda cifrada y con HMAC (supabase/migrations/…_importacion.sql).
import { buscarDuplicados, normaliza, normalizaTelefono, type Coincidencia } from "./duplicados";

export type CampoImportacion = "nombre" | "documento" | "telefono" | "zona" | "lider" | "autoriza" | "fecha_autorizacion";

export const camposImportacion: { campo: CampoImportacion; nombre: string; ayuda: string; sinonimos: string[] }[] = [
  { campo: "nombre", nombre: "Nombre", ayuda: "Obligatorio.", sinonimos: ["nombre", "nombres", "nombre completo", "nombres y apellidos", "simpatizante", "persona"] },
  { campo: "documento", nombre: "Cédula", ayuda: "Opcional. Solo números.", sinonimos: ["cedula", "cc", "documento", "numero de documento", "no documento", "identificacion", "doc"] },
  { campo: "telefono", nombre: "Celular", ayuda: "Opcional. 10 dígitos.", sinonimos: ["celular", "telefono", "tel", "movil", "whatsapp", "numero celular", "cel"] },
  { campo: "zona", nombre: "Zona", ayuda: "Zona de la campaña donde trabaja la persona.", sinonimos: ["zona", "barrio", "sector", "territorio", "comuna", "vereda"] },
  { campo: "lider", nombre: "Líder", ayuda: "Opcional. Nombre del líder a cargo.", sinonimos: ["lider", "referido por", "responsable", "lider a cargo", "coordinador"] },
  { campo: "autoriza", nombre: "Autoriza datos", ayuda: "Obligatorio: «Sí» si la persona firmó la autorización.", sinonimos: ["autoriza", "autorizacion", "autoriza datos", "acepta", "consentimiento", "habeas data", "firma autorizacion"] },
  { campo: "fecha_autorizacion", nombre: "Fecha de autorización", ayuda: "Opcional. dd/mm/aaaa.", sinonimos: ["fecha autorizacion", "fecha de autorizacion", "fecha firma", "fecha"] },
];

export type MapaColumnas = Partial<Record<CampoImportacion, number>>;

const limpiar = (s: string) => normaliza(s).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Adivina qué columna es cada campo. La persona puede corregirlo antes de importar. */
export function reconocerColumnas(encabezados: readonly string[]): MapaColumnas {
  const mapa: MapaColumnas = {};
  const usadas = new Set<number>();
  // Primero las coincidencias exactas, después las que contienen el sinónimo.
  for (const exacta of [true, false]) {
    for (const c of camposImportacion) {
      if (mapa[c.campo] !== undefined) continue;
      const i = encabezados.findIndex((h, j) => {
        if (usadas.has(j)) return false;
        const e = limpiar(h);
        return c.sinonimos.some((s) => (exacta ? e === s : e.includes(s)));
      });
      if (i >= 0) { mapa[c.campo] = i; usadas.add(i); }
    }
  }
  return mapa;
}

/** Lee un CSV (coma o punto y coma, comillas dobles, BOM). Devuelve filas de celdas. */
export function leerCsv(texto: string): string[][] {
  const primera = texto.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primera.match(/;/g) ?? []).length > (primera.match(/,/g) ?? []).length ? ";" : ",";
  const filas: string[][] = [];
  let fila: string[] = [], campo = "", comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      if (fila.some((x) => x.trim() !== "")) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some((x) => x.trim() !== "")) filas.push(fila);
  if (filas[0]?.[0]) filas[0][0] = filas[0][0].replace(/^\uFEFF/, "");
  return filas;
}

const SI = new Set(["si", "s", "x", "1", "true", "verdadero", "autoriza", "acepta", "ok"]);

/** dd/mm/aaaa, d/m/aa, aaaa-mm-dd o número de serie de Excel. Devuelve aaaa-mm-dd o null. */
export function leerFecha(v: string): string | null {
  const s = v.trim();
  let a: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (r) { a = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))) {
    d = +r[1]; m = +r[2]; a = +r[3] < 100 ? 2000 + +r[3] : +r[3];
  } else if (/^\d{5}(\.\d+)?$/.test(s)) {
    const f = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000);
    a = f.getUTCFullYear(); m = f.getUTCMonth() + 1; d = f.getUTCDate();
  } else return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export type Referencia = { id: string; nombre: string };
export type OpcionesImportacion = {
  zonas: readonly Referencia[];
  lideres: readonly Referencia[];
  /** Quien no ve toda la campaña (coordinador) tiene que asignar una zona suya a cada persona. */
  zonaObligatoria: boolean;
  /** aaaa-mm-dd; una autorización no puede tener fecha posterior. */
  hoy: string;
};

export type FilaLista = {
  numero: number; // número de fila en el archivo (la 1 es el encabezado)
  nombre: string;
  documento?: string;
  telefono?: string;
  zonaId?: string;
  liderId?: string;
  fechaAutorizacion?: string;
};
export type Observacion = { numero: number; mensaje: string };

export type Importacion = {
  listas: FilaLista[];
  rechazadas: Observacion[];
  advertencias: Observacion[];
  /** Posibles duplicados dentro del archivo, con sus razones. `a` y `b` son números de fila. */
  duplicados: (Coincidencia & { accion: "rechazada" | "revisar" })[];
  faltanColumnas: CampoImportacion[];
};

const buscarPorNombre = (lista: readonly Referencia[]) => {
  const m = new Map(lista.map((r) => [limpiar(r.nombre), r.id]));
  return (v: string) => m.get(limpiar(v));
};

/**
 * Valida todas las filas (sin el encabezado) y arma el reporte. Rechaza: sin nombre, sin autorización, cédula
 * imposible, fecha inválida o futura, zona desconocida o fuera del territorio, y la misma cédula repetida en el archivo.
 */
export function prepararImportacion(filas: readonly (readonly string[])[], mapa: MapaColumnas, o: OpcionesImportacion): Importacion {
  const faltan = (["nombre", "autoriza"] as const).filter((c) => mapa[c] === undefined) as CampoImportacion[];
  if (o.zonaObligatoria && mapa.zona === undefined) faltan.push("zona");
  if (faltan.length) return { listas: [], rechazadas: [], advertencias: [], duplicados: [], faltanColumnas: faltan };

  const celda = (f: readonly string[], c: CampoImportacion) => (mapa[c] === undefined ? "" : String(f[mapa[c]!] ?? "").trim());
  const zonaDe = buscarPorNombre(o.zonas);
  const liderDe = buscarPorNombre(o.lideres);
  const listas: FilaLista[] = [], rechazadas: Observacion[] = [], advertencias: Observacion[] = [];

  filas.forEach((f, i) => {
    const numero = i + 2;
    const motivos: string[] = [];
    const nombre = celda(f, "nombre").replace(/\s+/g, " ");
    if (nombre.length < 3) motivos.push("falta el nombre");
    if (!SI.has(limpiar(celda(f, "autoriza")))) motivos.push("sin autorización de datos: no se puede guardar (Ley 1581)");

    const docCrudo = celda(f, "documento");
    const documento = docCrudo.replace(/[.\s-]/g, "");
    if (docCrudo && !/^\d{5,11}$/.test(documento)) motivos.push(`la cédula «${docCrudo}» no es válida`);

    let telefono: string | undefined = normalizaTelefono(celda(f, "telefono"));
    if (telefono && !/^(3\d{9}|60\d{8})$/.test(telefono)) {
      advertencias.push({ numero, mensaje: `el celular «${celda(f, "telefono")}» no es válido: se importa sin teléfono` });
      telefono = undefined;
    }

    const textoFecha = celda(f, "fecha_autorizacion");
    const fecha = textoFecha ? leerFecha(textoFecha) : undefined;
    if (textoFecha && !fecha) motivos.push(`la fecha de autorización «${textoFecha}» no se entiende (use dd/mm/aaaa)`);
    else if (fecha && fecha > o.hoy) motivos.push("la fecha de autorización es posterior a hoy");

    const textoZona = celda(f, "zona");
    const zonaId = textoZona ? zonaDe(textoZona) : undefined;
    if (textoZona && !zonaId) motivos.push(`la zona «${textoZona}» no existe o no está en su territorio`);
    else if (!textoZona && o.zonaObligatoria) motivos.push("falta la zona");

    const textoLider = celda(f, "lider");
    const liderId = textoLider ? liderDe(textoLider) : undefined;
    if (textoLider && !liderId) advertencias.push({ numero, mensaje: `no se encontró al líder «${textoLider}»: se importa sin líder` });

    if (motivos.length) { rechazadas.push({ numero, mensaje: motivos.join("; ") }); return; }
    listas.push({ numero, nombre, documento: documento || undefined, telefono, zonaId, liderId, fechaAutorizacion: fecha ?? undefined });
  });

  // Duplicados dentro del archivo. La cédula repetida se rechaza (queda la primera); lo demás se marca para revisar.
  const coincidencias = buscarDuplicados(listas.map((l) => ({
    id: String(l.numero), documentoHash: l.documento, nombre: l.nombre, telefono: l.telefono, territorioId: l.zonaId ?? "",
  })));
  const fuera = new Set<number>();
  const duplicados = coincidencias.map((c) => {
    const [a, b] = [Number(c.a), Number(c.b)].sort((x, y) => x - y);
    const mismaCedula = c.razones.includes("mismo documento");
    if (mismaCedula) fuera.add(b);
    return { ...c, a: String(a), b: String(b), accion: mismaCedula ? "rechazada" as const : "revisar" as const };
  }).sort((x, y) => Number(x.b) - Number(y.b));
  // El mismo celular con un nombre distinto no llega al umbral (puede ser un celular de la familia). Igual se avisa,
  // salvo que el par ya esté en la lista de posibles duplicados.
  const yaMarcados = new Set(duplicados.map((d) => `${d.a}-${d.b}`));
  const porCelular = new Map<string, number>();
  for (const l of listas) {
    if (!l.telefono || fuera.has(l.numero)) continue;
    const primera = porCelular.get(l.telefono);
    if (primera === undefined) porCelular.set(l.telefono, l.numero);
    else if (!yaMarcados.has(`${primera}-${l.numero}`)) advertencias.push({ numero: l.numero, mensaje: `mismo celular que la fila ${primera}: revisar si es la misma persona` });
  }
  advertencias.sort((x, y) => x.numero - y.numero);
  for (const n of [...fuera].sort((x, y) => x - y)) {
    const par = duplicados.find((d) => d.b === String(n) && d.accion === "rechazada")!;
    rechazadas.push({ numero: n, mensaje: `misma cédula que la fila ${par.a}` });
  }
  rechazadas.sort((x, y) => x.numero - y.numero);
  return { listas: listas.filter((l) => !fuera.has(l.numero)), rechazadas, advertencias, duplicados, faltanColumnas: [] };
}

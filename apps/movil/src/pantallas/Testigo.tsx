// Espacio del testigo el día E: su mesa, la apertura, la foto del E-14 y las novedades. Sin señal, todo queda en
// cola. El E-14 lo revisa una persona de la campaña antes de consolidarse (regla 7); la app no lo lee.
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { DatosE14Movil, DatosNovedadMovil, Operacion } from "@ventaja/nucleo";
import { Aviso, Barra, Boton, Campo, Pildora, Subtitulo, Tarjeta, Tenue, Texto, Titulo } from "../componentes";
import { useApp, type Conexion } from "../contexto";
import { borrarArchivo, guardarFoto, huellaFoto } from "../datos/archivos";
import type { MesaTestigo } from "../datos/tipos";
import { color, espacio, radio } from "../tema";
import { tomarFoto } from "./Lider";

const TIPOS = [
  "Fila larga, votantes se están yendo",
  "Testigo no admitido por el jurado",
  "Falta material de la mesa",
  "Posible compra de votos",
  "Alteración del orden público",
  "Otra",
] as const;
const PRIORIDAD: Record<(typeof TIPOS)[number], "alta" | "media"> = {
  "Fila larga, votantes se están yendo": "media", "Testigo no admitido por el jurado": "alta", "Falta material de la mesa": "media",
  "Posible compra de votos": "alta", "Alteración del orden público": "alta", "Otra": "media",
};

const hora = (iso: string | number) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", timeStyle: "short" }).format(new Date(iso));

export function Testigo() {
  const { datosTestigo, sesion } = useApp();
  const mesas = datosTestigo?.mesas ?? [];
  return (
    <ScrollView contentContainerStyle={{ padding: espacio.l, gap: espacio.l, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
      <View style={{ gap: espacio.xs }}>
        <Titulo>Hola, {sesion.nombre.split(" ")[0]}</Titulo>
        <Tenue>{datosTestigo ? (mesas.length ? "Su mesa de hoy" : "Todavía no tiene mesa asignada. Su coordinador se la asigna.") : "Cargando su mesa…"}</Tenue>
      </View>
      <ProgresoE14 />
      {mesas.map((m) => <Mesa key={`${m.puestoId}-${m.mesa}`} m={m} />)}
    </ScrollView>
  );
}

function Mesa({ m }: { m: MesaTestigo }) {
  const { sesion, operaciones, agregar } = useApp();
  const de = (o: { datos: unknown }) => {
    const d = o.datos as { puesto?: string; mesa?: number | null };
    return d.puesto === m.puestoId && (m.mesa === null || d.mesa === m.mesa);
  };
  const novedadesLocales = operaciones.filter((o) => o.tipo === "novedad" && de(o) && o.estado !== "revisado");
  const aperturaLocal = novedadesLocales.some((o) => (o.datos as DatosNovedadMovil).tipo === "apertura");
  const e14Locales = operaciones.filter((o) => o.tipo === "e14" && de(o));
  const [error, setError] = useState("");
  const abierta = m.estado === "en_mesa" || aperturaLocal;
  const [tipo, setTipo] = useState<(typeof TIPOS)[number] | null>(null);
  const [descripcion, setDescripcion] = useState("");

  async function reportarApertura() {
    await agregar("novedad", {
      campana: sesion.campanaId, puesto: m.puestoId, mesa: m.mesa, tipo: "apertura", descripcion: "Mesa instalada", prioridad: "baja",
    } satisfies DatosNovedadMovil);
  }

  /**
   * Guarda cada foto en la cola con su huella. Si es la misma imagen que ya está en el teléfono, no la repite y borra
   * la copia que se acababa de hacer. Devuelve cuántas se repitieron.
   */
  async function guardarE14(uris: string[]): Promise<number> {
    if (m.mesa === null) return 0;
    const yaEstan = new Set(operaciones.filter((o) => o.tipo === "e14").map((o) => (o.datos as DatosE14Movil).hash).filter(Boolean));
    let repetidas = 0;
    for (const uri of uris) {
      const hash = await huellaFoto(uri);
      if (hash && yaEstan.has(hash)) { repetidas++; await borrarArchivo(uri); continue; }
      if (hash) yaEstan.add(hash);
      await agregar("e14", { campana: sesion.campanaId, puesto: m.puestoId, mesa: m.mesa, foto: uri, hash } satisfies DatosE14Movil);
    }
    return repetidas;
  }

  /** Arma un solo aviso con todo lo que no entró (formato no aceptado o foto repetida). */
  function avisar(rechazadas: number, repetidas: number) {
    const partes: string[] = [];
    if (rechazadas) partes.push(rechazadas === 1 ? "1 foto no se guardó: solo se aceptan JPG o PNG." : `${rechazadas} fotos no se guardaron: solo se aceptan JPG o PNG.`);
    if (repetidas) partes.push(repetidas === 1 ? "Esa foto ya estaba guardada: no se repite." : `${repetidas} fotos ya estaban guardadas: no se repiten.`);
    setError(partes.join(" "));
  }

  async function tomarE14() {
    setError("");
    const uri = await tomarFoto();
    if (uri) avisar(0, await guardarE14([uri]));
  }

  async function elegirE14() {
    setError("");
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 10, quality: 1, exif: false });
    if (r.canceled) return;
    const uris: string[] = [];
    let rechazadas = 0;
    for (const a of r.assets) {
      if (a.mimeType && !/^image\/(jpeg|png)$/.test(a.mimeType)) { rechazadas++; continue; }
      uris.push(await guardarFoto(a.uri));
    }
    avisar(rechazadas, await guardarE14(uris));
  }

  async function reportar() {
    if (!tipo) return;
    await agregar("novedad", {
      campana: sesion.campanaId, puesto: m.puestoId, mesa: m.mesa, tipo, descripcion: descripcion.trim() || null,
      prioridad: PRIORIDAD[tipo],
    } satisfies DatosNovedadMovil);
    setTipo(null); setDescripcion("");
  }

  return (
    <>
      <Tarjeta>
        <Subtitulo>{m.puestoNombre}</Subtitulo>
        <Text style={{ color: color.texto, fontSize: 30, fontWeight: "700" }}>{m.mesa === null ? "Todo el puesto" : `Mesa ${m.mesa}`}</Text>
        <Pildora texto={abierta ? "En la mesa" : "Por llegar"} tono={abierta ? "verde" : "ambar"} />
      </Tarjeta>

      <Tarjeta>
        <Subtitulo>1. Apertura</Subtitulo>
        {abierta
          ? <Tenue>Reportó que la mesa está instalada. Gracias.</Tenue>
          : <>
              <Tenue>Cuando la mesa esté instalada y usted esté en su puesto, avise aquí.</Tenue>
              <Boton titulo="Ya estoy en la mesa" alPresionar={reportarApertura} />
            </>}
      </Tarjeta>

      <Tarjeta>
        <Subtitulo>2. Fotos del E-14</Subtitulo>
        <Tenue>Al terminar el escrutinio: foto de frente, con todo el formulario visible y legible. Si el E-14 tiene varias hojas, tome una foto por hoja. Sin señal quedan guardadas en el teléfono y se envían solas.</Tenue>
        {m.e14Recibido && !e14Locales.length && <Pildora texto="Recibido" tono="verde" />}
        {e14Locales.map((o, i) => (
          <View key={o.id} style={s.fotoFila}>
            {(o.datos as DatosE14Movil).foto
              ? <Image source={{ uri: (o.datos as DatosE14Movil).foto }} style={s.miniatura} accessibilityLabel={`Foto ${i + 1} del E-14`} />
              : <View style={s.miniatura} accessibilityLabel={`Foto ${i + 1} del E-14 (ya no está en el teléfono)`} />}
            <Texto style={{ flex: 1 }}>Foto {i + 1}</Texto>
            <EstadoFoto op={o} />
          </View>
        ))}
        {error ? <Aviso>{error}</Aviso> : null}
        <View style={{ flexDirection: "row", gap: espacio.s }}>
          <View style={{ flex: 1 }}><Boton titulo="Tomar foto" alPresionar={tomarE14} deshabilitado={m.mesa === null} /></View>
          <View style={{ flex: 1 }}><Boton titulo="Elegir de la galería" tipo="secundario" alPresionar={elegirE14} deshabilitado={m.mesa === null} /></View>
        </View>
        <Tenue>La campaña revisa cada E-14 antes de sumarlo. Es un conteo interno, no el resultado oficial.</Tenue>
      </Tarjeta>

      <Tarjeta>
        <Subtitulo>3. Reportar una novedad</Subtitulo>
        <View style={{ gap: espacio.s }}>
          {TIPOS.map((t) => (
            <Pressable key={t} onPress={() => setTipo(t)} accessibilityRole="radio" accessibilityState={{ selected: tipo === t }}
              style={[s.opcion, tipo === t && { borderColor: color.acento, backgroundColor: color.acentoSuave }]}>
              <Text style={{ color: color.texto, fontSize: 15, flex: 1 }}>{t}</Text>
              {PRIORIDAD[t] === "alta" && <Pildora texto="Urgente" tono="rojo" />}
            </Pressable>
          ))}
        </View>
        {tipo && (
          <>
            <Campo etiqueta="¿Qué pasó? (opcional)" value={descripcion} onChangeText={setDescripcion} multiline maxLength={500}
              style={{ minHeight: 90, textAlignVertical: "top", paddingTop: espacio.m, borderRadius: radio.m, borderWidth: 1, borderColor: color.linea, backgroundColor: color.grafito, color: color.texto, paddingHorizontal: espacio.m, fontSize: 16 }} />
            {tipo === "Posible compra de votos" && (
              <Aviso tono="rojo">No confronte a nadie. Reporte lo que vio; la campaña lo escala al abogado y a las autoridades.</Aviso>
            )}
            <Boton titulo="Enviar novedad" alPresionar={reportar} />
          </>
        )}
      </Tarjeta>

      {(novedadesLocales.length > 0 || m.novedades.length > 0) && (
        <Tarjeta>
          <Subtitulo>Mis novedades</Subtitulo>
          {novedadesLocales.filter((o) => o.estado !== "enviado").map((o) => (
            <View key={o.id} style={s.fila}>
              <Texto style={{ flex: 1 }}>{(o.datos as DatosNovedadMovil).tipo === "apertura" ? "Apertura" : (o.datos as DatosNovedadMovil).tipo}</Texto>
              <Pildora texto={o.estado === "error" ? "Con problema" : "Por enviar"} tono={o.estado === "error" ? "rojo" : "ambar"} />
            </View>
          ))}
          {m.novedades.map((n) => (
            <View key={n.id} style={s.fila}>
              <Texto style={{ flex: 1 }}>{n.tipo === "apertura" ? "Apertura" : n.tipo} · {hora(n.hora)}</Texto>
              <Pildora texto={n.estado === "abierta" ? "Recibida" : n.estado === "escalada" ? "Escalada" : "Atendida"}
                tono={n.estado === "abierta" ? "acento" : n.estado === "escalada" ? "ambar" : "verde"} />
            </View>
          ))}
        </Tarjeta>
      )}
    </>
  );
}

const s = StyleSheet.create({
  foto: { width: "100%", aspectRatio: 3 / 4, borderRadius: radio.m, backgroundColor: color.panel2 },
  fotoFila: { flexDirection: "row", alignItems: "center", gap: espacio.m, paddingVertical: espacio.xs },
  miniatura: { width: 48, height: 64, borderRadius: radio.s, backgroundColor: color.panel2 },
  opcion: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espacio.s, minHeight: 48,
    paddingHorizontal: espacio.m, borderRadius: radio.m, borderWidth: 1, borderColor: color.linea,
  },
  fila: { flexDirection: "row", alignItems: "center", gap: espacio.s, paddingVertical: espacio.s, borderBottomWidth: 1, borderBottomColor: color.linea },
});

function EstadoFoto({ op }: { op: Operacion }) {
  const e = op.estado;
  return <Pildora texto={e === "pendiente" ? "Pendiente" : e === "enviando" ? "Enviando" : e === "error" ? "Error" : "Enviada"}
    tono={e === "pendiente" ? "ambar" : e === "enviando" ? "acento" : e === "error" ? "rojo" : "verde"} />;
}

const TEXTO_CONEXION: Record<Conexion, { texto: string; tono: "verde" | "rojo" | "acento" }> = {
  conectado: { texto: "Conectado", tono: "verde" }, sin_conexion: { texto: "Sin conexión", tono: "rojo" }, sincronizando: { texto: "Sincronizando", tono: "acento" },
};

/** Cuántas fotos del E-14 hay, cuántas llegaron y cuántas faltan, con la barra y el estado de la conexión. */
function ProgresoE14() {
  const { operaciones, conexion, enviando, sincronizar } = useApp();
  const fotos = operaciones.filter((o) => o.tipo === "e14");
  if (!fotos.length) return null;
  const enviadas = fotos.filter((o) => o.estado === "enviado" || o.estado === "revisado").length;
  const conError = fotos.filter((o) => o.estado === "error").length;
  const pendientes = fotos.length - enviadas - conError;
  const avance = enviadas / fotos.length;
  const c = TEXTO_CONEXION[enviando && conexion !== "sin_conexion" ? "sincronizando" : conexion];
  return (
    <Tarjeta>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Subtitulo>Envío de los E-14</Subtitulo>
        <Pildora texto={c.texto} tono={c.tono} />
      </View>
      <Text style={{ color: color.texto, fontSize: 30, fontWeight: "700" }} accessibilityLabel={`Avance ${Math.round(avance * 100)} por ciento`}>{Math.round(avance * 100)} %</Text>
      <Barra valor={avance} />
      <View style={{ flexDirection: "row", gap: espacio.l }}>
        <Tenue>{fotos.length} en total</Tenue>
        <Tenue>{enviadas} enviadas</Tenue>
        <Tenue>{pendientes} pendientes</Tenue>
        {conError ? <Text style={{ color: color.rojo }}>{conError} con error</Text> : null}
      </View>
      {pendientes > 0 && <Boton titulo="Enviar ahora" tipo="secundario" ocupado={enviando} alPresionar={() => sincronizar(true)} />}
      {pendientes > 0 && <Tenue>Si no hay señal, el teléfono lo vuelve a intentar solo, también cada 20 minutos con la app cerrada.</Tenue>}
    </Tarjeta>
  );
}

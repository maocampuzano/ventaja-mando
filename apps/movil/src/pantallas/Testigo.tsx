// Espacio del testigo el día E: su mesa, la apertura, la foto del E-14 y las novedades. Sin señal, todo queda en
// cola. El E-14 lo revisa una persona de la campaña antes de consolidarse (regla 7); la app no lo lee.
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { DatosE14Movil, DatosNovedadMovil } from "@ventaja/nucleo";
import { Aviso, Boton, Campo, Pildora, Subtitulo, Tarjeta, Tenue, Texto, Titulo } from "../componentes";
import { useApp } from "../contexto";
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
  const e14Local = operaciones.find((o) => o.tipo === "e14" && de(o));
  const abierta = m.estado === "en_mesa" || aperturaLocal;
  const [tipo, setTipo] = useState<(typeof TIPOS)[number] | null>(null);
  const [descripcion, setDescripcion] = useState("");

  async function reportarApertura() {
    await agregar("novedad", {
      campana: sesion.campanaId, puesto: m.puestoId, mesa: m.mesa, tipo: "apertura", descripcion: "Mesa instalada", prioridad: "baja",
    } satisfies DatosNovedadMovil);
  }

  async function subirE14() {
    if (m.mesa === null) return;
    const uri = await tomarFoto();
    if (uri) await agregar("e14", { campana: sesion.campanaId, puesto: m.puestoId, mesa: m.mesa, foto: uri } satisfies DatosE14Movil);
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
        <Subtitulo>2. Foto del E-14</Subtitulo>
        {m.e14Recibido || e14Local ? (
          <>
            {e14Local && <Image source={{ uri: (e14Local.datos as DatosE14Movil).foto }} style={s.foto} accessibilityLabel="Foto del E-14" />}
            <Pildora texto={e14Local?.estado === "pendiente" ? "Por enviar" : e14Local?.estado === "error" ? "Con problema" : "Recibido"}
              tono={e14Local?.estado === "pendiente" ? "ambar" : e14Local?.estado === "error" ? "rojo" : "verde"} />
            <Tenue>La campaña revisa cada E-14 antes de sumarlo. Es un conteo interno, no el resultado oficial.</Tenue>
          </>
        ) : (
          <>
            <Tenue>Al terminar el escrutinio de la mesa: foto de frente, con todo el formulario visible y legible.</Tenue>
            <Boton titulo="Tomar foto del E-14" alPresionar={subirE14} deshabilitado={m.mesa === null} />
          </>
        )}
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
  opcion: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espacio.s, minHeight: 48,
    paddingHorizontal: espacio.m, borderRadius: radio.m, borderWidth: 1, borderColor: color.linea,
  },
  fila: { flexDirection: "row", alignItems: "center", gap: espacio.s, paddingVertical: espacio.s, borderBottomWidth: 1, borderBottomColor: color.linea },
});

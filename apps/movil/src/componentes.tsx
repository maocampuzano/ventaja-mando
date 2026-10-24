import type { ReactNode } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { color, espacio, radio } from "./tema";

export function Titulo({ children }: { children: ReactNode }) {
  return <Text style={e.titulo} accessibilityRole="header">{children}</Text>;
}
export function Subtitulo({ children }: { children: ReactNode }) {
  return <Text style={e.subtitulo} accessibilityRole="header">{children}</Text>;
}
export function Tenue({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[e.tenue, style]}>{children}</Text>;
}
export function Texto({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[e.texto, style]}>{children}</Text>;
}

export function Tarjeta({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[e.tarjeta, style]}>{children}</View>;
}

type TipoBoton = "principal" | "secundario" | "peligro";
export function Boton({ titulo, alPresionar, tipo = "principal", ocupado, deshabilitado, etiqueta }: {
  titulo: string; alPresionar: () => void; tipo?: TipoBoton; ocupado?: boolean; deshabilitado?: boolean; etiqueta?: string;
}) {
  const apagado = deshabilitado || ocupado;
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={etiqueta ?? titulo} accessibilityState={{ disabled: !!apagado, busy: !!ocupado }}
      onPress={apagado ? undefined : alPresionar}
      style={({ pressed }) => [e.boton, e[tipo], apagado && e.apagado, pressed && !apagado && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}
    >
      {ocupado ? <ActivityIndicator color={color.texto} /> : <Text style={[e.botonTexto, tipo === "secundario" && { color: color.texto }]}>{titulo}</Text>}
    </Pressable>
  );
}

export function Campo({ etiqueta, ayuda, ...props }: TextInputProps & { etiqueta: string; ayuda?: string }) {
  return (
    <View style={{ gap: espacio.xs }}>
      <Text style={e.etiqueta}>{etiqueta}</Text>
      <TextInput
        accessibilityLabel={etiqueta} placeholderTextColor={color.tenue}
        style={e.campo} {...props}
      />
      {ayuda ? <Text style={e.tenueChico}>{ayuda}</Text> : null}
    </View>
  );
}

/** Casilla de verificación grande, fácil de tocar en la calle. */
export function Casilla({ marcada, alCambiar, children }: { marcada: boolean; alCambiar: (v: boolean) => void; children: ReactNode }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: marcada }} onPress={() => alCambiar(!marcada)} style={e.casillaFila}>
      <View style={[e.casilla, marcada && { backgroundColor: color.acento, borderColor: color.acento }]}>
        {marcada ? <Text style={{ color: "#fff", fontWeight: "700" }}>✓</Text> : null}
      </View>
      <View style={{ flex: 1 }}>{typeof children === "string" ? <Text style={e.texto}>{children}</Text> : children}</View>
    </Pressable>
  );
}

export function Pildora({ texto, tono = "tenue" }: { texto: string; tono?: "verde" | "ambar" | "rojo" | "acento" | "tenue" }) {
  const c = tono === "tenue" ? color.tenue : color[tono];
  return <Text style={[e.pildora, { color: c, borderColor: c }]}>{texto}</Text>;
}

export function Barra({ valor }: { valor: number }) {
  const v = Math.max(0, Math.min(1, valor));
  return (
    <View style={e.barra} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}>
      <View style={[e.barraLlena, { width: `${v * 100}%`, backgroundColor: v >= 0.8 ? color.verde : v >= 0.5 ? color.ambar : color.rojo }]} />
    </View>
  );
}

export function Aviso({ children, tono = "ambar" }: { children: ReactNode; tono?: "ambar" | "rojo" | "acento" }) {
  return <View style={[e.aviso, { borderLeftColor: color[tono] }]}><Text style={e.texto}>{children}</Text></View>;
}

/** Pregunta antes de algo que no se deshace. En la vista web (demo) usa la ventana del navegador. */
export function confirmar(titulo: string, mensaje: string, accion: string, alConfirmar: () => void) {
  if (Platform.OS === "web") {
    if (globalThis.confirm?.(`${titulo}\n\n${mensaje}`)) alConfirmar();
    return;
  }
  Alert.alert(titulo, mensaje, [{ text: "Cancelar", style: "cancel" }, { text: accion, style: "destructive", onPress: alConfirmar }]);
}

export const e = StyleSheet.create({
  titulo: { color: color.texto, fontSize: 24, fontWeight: "700", letterSpacing: -0.2 },
  subtitulo: { color: color.texto, fontSize: 17, fontWeight: "650" as "600" },
  texto: { color: color.texto, fontSize: 15, lineHeight: 21 },
  tenue: { color: color.tenue, fontSize: 14, lineHeight: 20 },
  tenueChico: { color: color.tenue, fontSize: 12 },
  etiqueta: { color: color.tenue, fontSize: 13, fontWeight: "600" },
  tarjeta: { backgroundColor: color.panel, borderRadius: radio.l, borderWidth: 1, borderColor: color.linea, padding: espacio.l, gap: espacio.s },
  boton: { minHeight: 52, borderRadius: radio.m, alignItems: "center", justifyContent: "center", paddingHorizontal: espacio.l },
  principal: { backgroundColor: color.acento },
  secundario: { backgroundColor: color.panel2, borderWidth: 1, borderColor: color.linea },
  peligro: { backgroundColor: color.rojo },
  apagado: { opacity: 0.45 },
  botonTexto: { color: "#fff", fontSize: 16, fontWeight: "600" },
  campo: {
    minHeight: 52, borderRadius: radio.m, borderWidth: 1, borderColor: color.linea, backgroundColor: color.grafito,
    color: color.texto, paddingHorizontal: espacio.m, fontSize: 16,
  },
  casillaFila: { flexDirection: "row", gap: espacio.m, alignItems: "flex-start", paddingVertical: espacio.s, minHeight: 44 },
  casilla: { width: 28, height: 28, borderRadius: radio.s, borderWidth: 2, borderColor: color.tenue, alignItems: "center", justifyContent: "center" },
  pildora: { flexShrink: 0, fontSize: 12, fontWeight: "600", borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden", alignSelf: "flex-start" },
  barra: { height: 10, borderRadius: 5, backgroundColor: color.panel2, overflow: "hidden" },
  barraLlena: { height: "100%", borderRadius: 5 },
  aviso: { backgroundColor: color.panel2, borderLeftWidth: 4, borderRadius: radio.s, padding: espacio.m },
});

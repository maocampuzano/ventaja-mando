// Lo que está en el teléfono y todavía no llegó, lo que llegó y lo que ya revisó una persona.
// Los rechazos se muestran con su motivo: el líder los corrige o los descarta. Nada se pierde sin que él lo decida.
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Operacion } from "@ventaja/nucleo";
import { Boton, confirmar, Pildora, Subtitulo, Tarjeta, Tenue, Texto } from "../componentes";
import { useApp } from "../contexto";
import { color, espacio } from "../tema";

const NOMBRE: Record<Operacion["tipo"], string> = {
  persona: "Registro", planilla: "Planilla", respuesta: "Respuesta", novedad: "Novedad", e14: "E-14", tarea: "Tarea",
};

function resumen(op: Operacion) {
  const d = op.datos as { nombre?: string; tipo?: string; mesa?: number; estado?: string };
  if (op.tipo === "persona") return d.nombre ?? "";
  if (op.tipo === "novedad") return d.tipo ?? "";
  if (op.tipo === "e14") return `Mesa ${d.mesa ?? ""}`;
  if (op.tipo === "tarea") return d.estado === "hecha" ? "Marcada como hecha" : "En curso";
  return "Foto";
}

const hora = (ms: number) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", timeStyle: "short" }).format(ms);

/** Franja de arriba: siempre visible, dice si hay algo esperando señal. Al tocarla abre el detalle. */
export function FranjaSincronizacion({ alAbrir }: { alAbrir: () => void }) {
  const { conteo, enviando, copiaDe } = useApp();
  const tono = conteo.error ? color.rojo : conteo.pendiente ? color.ambar : color.verde;
  const texto = conteo.error
    ? `${conteo.error} con problema: toque para revisar`
    : conteo.pendiente
      ? `${conteo.pendiente} esperando señal para enviarse`
      : enviando ? "Enviando…" : "Todo enviado";
  return (
    <Pressable onPress={alAbrir} accessibilityRole="button" accessibilityLabel={`Sincronización: ${texto}`} style={[s.franja, { borderColor: tono }]}>
      <View style={[s.punto, { backgroundColor: tono }]} />
      <Text style={s.franjaTexto} numberOfLines={1}>{texto}</Text>
      {copiaDe ? <Text style={s.franjaTenue}>Sin señal · datos de las {hora(copiaDe)}</Text> : null}
    </Pressable>
  );
}

export function Sincronizacion({ alCerrar, alCorregir }: { alCerrar: () => void; alCorregir: (op: Operacion) => void }) {
  const { operaciones, conteo, sincronizar, enviando, descartar, ultimaSincronizacion } = useApp();
  const conError = operaciones.filter((o) => o.estado === "error");
  const pendientes = operaciones.filter((o) => o.estado === "pendiente");
  const recientes = operaciones.filter((o) => o.estado === "enviado" || o.estado === "revisado").slice(-30).reverse();

  function confirmarDescartar(op: Operacion) {
    confirmar("¿Descartar este registro?", "Se borra del teléfono y no se envía. No se puede deshacer.", "Descartar", () => descartar(op.id));
  }

  return (
    <ScrollView contentContainerStyle={{ padding: espacio.l, gap: espacio.l }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Subtitulo>Envíos</Subtitulo>
        <Pressable onPress={alCerrar} accessibilityRole="button" hitSlop={12}><Text style={{ color: color.acento, fontSize: 16 }}>Cerrar</Text></Pressable>
      </View>
      <Tenue>
        {conteo.pendiente} por enviar · {conteo.enviado} enviados · {conteo.revisado} revisados
        {ultimaSincronizacion ? ` · última vez a las ${hora(ultimaSincronizacion)}` : ""}
      </Tenue>
      <Boton titulo="Enviar ahora" alPresionar={() => sincronizar(true)} ocupado={enviando} tipo="secundario" />

      {conError.length > 0 && (
        <View style={{ gap: espacio.s }}>
          <Subtitulo>Con problema</Subtitulo>
          {conError.map((op) => (
            <Tarjeta key={op.id} style={{ borderColor: color.rojo }}>
              <Texto>{NOMBRE[op.tipo]}: {resumen(op)}</Texto>
              <Text style={{ color: color.rojo }}>{op.ultimoError}</Text>
              <View style={{ flexDirection: "row", gap: espacio.s }}>
                {op.tipo === "persona" && <View style={{ flex: 1 }}><Boton titulo="Corregir" alPresionar={() => alCorregir(op)} /></View>}
                <View style={{ flex: 1 }}><Boton titulo="Descartar" tipo="secundario" alPresionar={() => confirmarDescartar(op)} /></View>
              </View>
            </Tarjeta>
          ))}
        </View>
      )}

      {pendientes.length > 0 && (
        <View style={{ gap: espacio.s }}>
          <Subtitulo>Esperando señal</Subtitulo>
          {pendientes.map((op) => (
            <View key={op.id} style={s.fila}>
              <Texto style={{ flex: 1 }}>{NOMBRE[op.tipo]}: {resumen(op)}</Texto>
              <Pildora texto="Pendiente" tono="ambar" />
            </View>
          ))}
        </View>
      )}

      {recientes.length > 0 && (
        <View style={{ gap: espacio.s }}>
          <Subtitulo>Recientes</Subtitulo>
          {recientes.map((op) => (
            <View key={op.id} style={s.fila}>
              <Texto style={{ flex: 1 }}>{NOMBRE[op.tipo]}: {resumen(op)}</Texto>
              <Pildora texto={op.estado === "revisado" ? "Revisado" : "Enviado"} tono={op.estado === "revisado" ? "verde" : "acento"} />
            </View>
          ))}
        </View>
      )}
      {!operaciones.length && <Tenue>Todavía no ha registrado nada desde este teléfono.</Tenue>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  franja: {
    flexDirection: "row", alignItems: "center", gap: espacio.s, marginHorizontal: espacio.l, marginTop: espacio.s,
    paddingHorizontal: espacio.m, paddingVertical: espacio.s, borderRadius: 999, borderWidth: 1, backgroundColor: color.panel,
  },
  punto: { width: 8, height: 8, borderRadius: 4 },
  franjaTexto: { color: color.texto, fontSize: 13, fontWeight: "600", flexShrink: 1 },
  franjaTenue: { color: color.tenue, fontSize: 12, marginLeft: "auto" },
  fila: { flexDirection: "row", alignItems: "center", gap: espacio.s, paddingVertical: espacio.s, borderBottomWidth: 1, borderBottomColor: color.linea },
});

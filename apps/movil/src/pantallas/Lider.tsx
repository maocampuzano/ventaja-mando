// Espacio del líder: lo que tiene que hacer hoy, registrar a alguien, escanear una planilla y su gente.
// Todo funciona sin señal: lo nuevo queda en la cola y se envía solo cuando vuelve.
import { useMemo, useState } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  enlaceWhatsAppManual, FINALIDADES, miles, TEXTO_AUTORIZACION_ES_BORRADOR, textoAutorizacion,
  type DatosPersonaMovil, type DatosTareaMovil, type Operacion,
} from "@ventaja/nucleo";
import { Aviso, Barra, Boton, Campo, Casilla, Pildora, Subtitulo, Tarjeta, Tenue, Texto, Titulo } from "../componentes";
import { useApp } from "../contexto";
import type { PersonaMovil, TareaMovil } from "../datos/tipos";
import { formularioVacio, validarRegistro, type FormularioRegistro } from "../registro";
import { color, espacio, radio } from "../tema";

export type PestanaLider = "hoy" | "registrar" | "planilla" | "gente";

/** Toma una foto con la cámara. En la vista web del demo abre el selector de archivos. */
export async function tomarFoto(): Promise<string | null> {
  const permiso = await ImagePicker.requestCameraPermissionsAsync();
  if (!permiso.granted) return null;
  const r = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false, exif: false });
  return r.canceled ? null : r.assets[0]?.uri ?? null;
}

export function Lider({ pestana, irA, corrigiendo, alTerminarCorreccion }: {
  pestana: PestanaLider; irA: (p: PestanaLider) => void; corrigiendo: Operacion | null; alTerminarCorreccion: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={{ padding: espacio.l, gap: espacio.l, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      {pestana === "hoy" && <Hoy irA={irA} />}
      {pestana === "registrar" && <Registrar key={corrigiendo?.id ?? "nuevo"} corrigiendo={corrigiendo} alTerminar={() => { alTerminarCorreccion(); irA("gente"); }} />}
      {pestana === "planilla" && <Planilla />}
      {pestana === "gente" && <MiGente />}
    </ScrollView>
  );
}

function Hoy({ irA }: { irA: (p: PestanaLider) => void }) {
  const { sesion, datosLider, operaciones, agregar } = useApp();
  // El estado que el líder marcó en el teléfono manda sobre el último que llegó del servidor.
  const marcadas = useMemo(() => {
    const m = new Map<string, DatosTareaMovil["estado"]>();
    for (const op of operaciones) if (op.tipo === "tarea") { const d = op.datos as DatosTareaMovil; m.set(d.tarea, d.estado); }
    return m;
  }, [operaciones]);
  const tareas = (datosLider?.tareas ?? []).map((t): TareaMovil => ({ ...t, estado: marcadas.get(t.id) ?? t.estado }));
  const faltan = tareas.filter((t) => t.estado !== "hecha").length;

  return (
    <>
      <View style={{ gap: espacio.xs }}>
        <Titulo>Hola, {sesion.nombre.split(" ")[0]}</Titulo>
        <Tenue>{datosLider ? (faltan ? `${faltan} ${faltan === 1 ? "tarea" : "tareas"} para hoy` : "No tiene tareas pendientes") : "Cargando sus tareas…"}</Tenue>
      </View>
      {tareas.map((t) => {
        const hecha = t.estado === "hecha";
        return (
          <Pressable key={t.id} accessibilityRole="checkbox" accessibilityState={{ checked: hecha }}
            onPress={() => !hecha && agregar("tarea", { tarea: t.id, estado: "hecha" } satisfies DatosTareaMovil)}
            style={({ pressed }) => [s.tarea, hecha && { opacity: 0.55 }, pressed && { backgroundColor: color.panel2 }]}>
            <View style={[s.check, hecha && { backgroundColor: color.verde, borderColor: color.verde }]}>
              {hecha ? <Text style={{ color: "#fff", fontWeight: "700" }}>✓</Text> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.tareaTitulo, hecha && { textDecorationLine: "line-through" }]}>{t.titulo}</Text>
              <Tenue>{t.detalle}</Tenue>
            </View>
          </Pressable>
        );
      })}
      <View style={{ flexDirection: "row", gap: espacio.s }}>
        <View style={{ flex: 1 }}><Boton titulo="Registrar persona" alPresionar={() => irA("registrar")} /></View>
        <View style={{ flex: 1 }}><Boton titulo="Escanear planilla" tipo="secundario" alPresionar={() => irA("planilla")} /></View>
      </View>
      {datosLider && <Meta />}
    </>
  );
}

function Meta() {
  const { datosLider, operaciones } = useApp();
  if (!datosLider) return null;
  const validados = datosLider.personas.filter((p) => p.estado === "validado" || p.estado === "comprometido").length;
  const porEnviar = operaciones.filter((o) => o.tipo === "persona" && o.estado === "pendiente").length;
  const sinValidar = datosLider.personas.length - validados;
  return (
    <Tarjeta>
      <Subtitulo>Mi meta</Subtitulo>
      <Text style={{ color: color.texto, fontSize: 34, fontWeight: "700" }}>
        {miles(validados)}<Text style={{ color: color.tenue, fontSize: 18 }}> / {miles(datosLider.meta)}</Text>
      </Text>
      <Barra valor={datosLider.meta ? validados / datosLider.meta : 0} />
      <Tenue>
        Solo cuentan los validados por su coordinador. {miles(sinValidar)} esperando validación
        {porEnviar ? ` y ${miles(porEnviar)} por enviar desde este teléfono` : ""}.
      </Tenue>
    </Tarjeta>
  );
}

function Registrar({ corrigiendo, alTerminar }: { corrigiendo: Operacion | null; alTerminar: () => void }) {
  const { sesion, datosLider, agregar, reintentar } = useApp();
  const zonas = datosLider?.zonas ?? [];
  const inicial = (): FormularioRegistro => {
    if (!corrigiendo) return formularioVacio(zonas.length === 1 ? zonas[0].id : null);
    const d = corrigiendo.datos as DatosPersonaMovil;
    const esFoto = /^(file|content|ph|blob|data):/.test(d.evidencia);
    return {
      nombre: d.nombre, telefono: d.telefono ?? "", documento: d.documento ?? "", zonaId: d.zona ?? null,
      finalidades: d.finalidades as FormularioRegistro["finalidades"], fotoFirma: esFoto ? d.evidencia : null, aceptoEnPantalla: !esFoto,
    };
  };
  const [f, setF] = useState<FormularioRegistro>(inicial);
  const [errores, setErrores] = useState<string[]>([]);
  const [guardada, setGuardada] = useState<string | null>(null);
  const cambiar = (c: Partial<FormularioRegistro>) => { setF((x) => ({ ...x, ...c })); setErrores([]); setGuardada(null); };
  const texto = textoAutorizacion(sesion.campanaNombre, f.finalidades.length ? f.finalidades : FINALIDADES.map((x) => x.id));

  async function guardar() {
    const r = validarRegistro(f, { campanaId: sesion.campanaId, lider: sesion.nombre, ahora: new Date() });
    if (!r.datos) { setErrores(r.errores); return; }
    if (corrigiendo) { await reintentar(corrigiendo.id, r.datos); alTerminar(); return; }
    await agregar("persona", r.datos);
    setGuardada(r.datos.nombre);
    setF(formularioVacio(f.zonaId));
  }

  return (
    <>
      <View style={{ gap: espacio.xs }}>
        <Titulo>{corrigiendo ? "Corregir registro" : "Registrar persona"}</Titulo>
        <Tenue>No pregunte por quién va a votar. Solo los datos de contacto y la autorización.</Tenue>
      </View>
      <Campo etiqueta="Nombre completo" value={f.nombre} onChangeText={(v) => cambiar({ nombre: v })} autoCapitalize="words" autoComplete="off" />
      <Campo etiqueta="Celular (opcional)" value={f.telefono} onChangeText={(v) => cambiar({ telefono: v })} keyboardType="phone-pad" />
      <Campo etiqueta="Cédula (opcional)" value={f.documento} onChangeText={(v) => cambiar({ documento: v })} keyboardType="number-pad"
        ayuda="Solo si la persona quiere darla. Se guarda cifrada." />
      {zonas.length > 1 && (
        <View style={{ gap: espacio.xs }}>
          <Text style={s.etiqueta}>Zona</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espacio.s }}>
            {zonas.map((z) => (
              <Pressable key={z.id} onPress={() => cambiar({ zonaId: z.id })} accessibilityRole="radio" accessibilityState={{ selected: f.zonaId === z.id }}
                style={[s.chip, f.zonaId === z.id && { backgroundColor: color.acentoSuave, borderColor: color.acento }]}>
                <Text style={{ color: color.texto }}>{z.nombre}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <Tarjeta>
        <Subtitulo>Autorización de datos</Subtitulo>
        {TEXTO_AUTORIZACION_ES_BORRADOR && <Pildora texto="Texto en revisión jurídica" tono="ambar" />}
        <Tenue>Léale o muéstrele este texto a la persona:</Tenue>
        <Texto>{texto}</Texto>
        <Text style={s.etiqueta}>La persona autoriza:</Text>
        {FINALIDADES.map((x) => (
          <Casilla key={x.id} marcada={f.finalidades.includes(x.id)}
            alCambiar={(v) => cambiar({ finalidades: v ? [...f.finalidades, x.id] : f.finalidades.filter((y) => y !== x.id) })}>
            {x.nombre}
          </Casilla>
        ))}
        <Text style={s.etiqueta}>Prueba de la autorización</Text>
        {f.fotoFirma ? (
          <View style={{ gap: espacio.s }}>
            <Image source={{ uri: f.fotoFirma }} style={s.foto} accessibilityLabel="Foto del formato firmado" />
            <Boton titulo="Quitar la foto" tipo="secundario" alPresionar={() => cambiar({ fotoFirma: null })} />
          </View>
        ) : (
          <>
            <Boton titulo="Foto del formato firmado" tipo="secundario"
              alPresionar={async () => { const u = await tomarFoto(); if (u) cambiar({ fotoFirma: u, aceptoEnPantalla: false }); }} />
            <Casilla marcada={f.aceptoEnPantalla} alCambiar={(v) => cambiar({ aceptoEnPantalla: v })}>
              La persona leyó el texto en mi pantalla y aceptó
            </Casilla>
          </>
        )}
      </Tarjeta>

      {errores.length > 0 && <Aviso tono="rojo">{errores.join("\n")}</Aviso>}
      {guardada && <Aviso tono="acento">{guardada} quedó guardada en el teléfono. Se envía sola cuando haya señal.</Aviso>}
      <Boton titulo={corrigiendo ? "Guardar corrección" : "Guardar registro"} alPresionar={guardar} />
    </>
  );
}

function Planilla() {
  const { sesion, agregar, operaciones } = useApp();
  const [ultima, setUltima] = useState<string | null>(null);
  const enviadas = operaciones.filter((o) => o.tipo === "planilla");

  async function escanear() {
    const uri = await tomarFoto();
    if (!uri) return;
    await agregar("planilla", { campana: sesion.campanaId, archivo: uri });
    setUltima(uri);
  }

  return (
    <>
      <View style={{ gap: espacio.xs }}>
        <Titulo>Escanear planilla</Titulo>
        <Tenue>Tome la foto de frente, con buena luz y la hoja completa. Una foto por hoja.</Tenue>
      </View>
      <Aviso>
        Cada fila la lee la campaña y la revisa una persona antes de entrar a la base. Solo cuentan las filas con la firma de autorización.
      </Aviso>
      {ultima && <Image source={{ uri: ultima }} style={s.foto} accessibilityLabel="Última planilla" />}
      <Boton titulo={ultima ? "Escanear otra hoja" : "Tomar foto de la planilla"} alPresionar={escanear} />
      {enviadas.length > 0 && (
        <Tarjeta>
          <Subtitulo>Mis planillas</Subtitulo>
          {enviadas.slice().reverse().map((op, i) => (
            <View key={op.id} style={s.fila}>
              <Texto style={{ flex: 1 }}>Hoja {enviadas.length - i}</Texto>
              <Pildora texto={op.estado === "pendiente" ? "Por enviar" : op.estado === "error" ? "Con problema" : op.estado === "revisado" ? "Revisada" : "En revisión"}
                tono={op.estado === "pendiente" ? "ambar" : op.estado === "error" ? "rojo" : op.estado === "revisado" ? "verde" : "acento"} />
            </View>
          ))}
        </Tarjeta>
      )}
    </>
  );
}

const ETIQUETA_ESTADO: Record<PersonaMovil["estado"], [string, "verde" | "ambar" | "rojo" | "acento" | "tenue"]> = {
  sin_contactar: ["Sin contactar", "tenue"], contactado: ["Contactado", "acento"], validado: ["Validado", "verde"],
  comprometido: ["Comprometido", "verde"], no_interesado: ["No interesado", "rojo"],
};

function MiGente() {
  const { sesion, datosLider, operaciones } = useApp();
  const porEnviar = operaciones.filter((o) => o.tipo === "persona" && o.estado !== "enviado" && o.estado !== "revisado");
  const personas = datosLider?.personas ?? [];

  function escribir(p: PersonaMovil) {
    const texto = `Hola, ${p.nombre.split(" ")[0]}. Le escribe ${sesion.nombre.split(" ")[0]}, de ${sesion.campanaNombre}.`;
    // El WhatsApp del líder se abre con el texto listo y lo envía él (regla 1). La app no envía nada.
    Linking.openURL(enlaceWhatsAppManual(`57${p.telefono}`, texto));
  }

  return (
    <>
      <View style={{ gap: espacio.xs }}>
        <Titulo>Mi gente</Titulo>
        <Tenue>{miles(personas.length)} registradas por usted{porEnviar.length ? ` y ${porEnviar.length} en este teléfono` : ""}.</Tenue>
      </View>
      {porEnviar.map((op) => (
        <View key={op.id} style={s.persona}>
          <View style={{ flex: 1, gap: 2 }}>
            <Texto>{(op.datos as DatosPersonaMovil).nombre}</Texto>
            <Pildora texto={op.estado === "error" ? "Con problema" : "Por enviar"} tono={op.estado === "error" ? "rojo" : "ambar"} />
          </View>
        </View>
      ))}
      {personas.map((p) => {
        const [et, tono] = ETIQUETA_ESTADO[p.estado];
        const puedeEscribir = !!p.telefono && p.autorizacionVigente;
        return (
          <View key={p.id} style={s.persona}>
            <View style={{ flex: 1, gap: 4 }}>
              <Texto>{p.nombre}</Texto>
              <Pildora texto={et} tono={tono} />
              {!p.autorizacionVigente && <Tenue>Retiró su autorización: no se le puede contactar.</Tenue>}
            </View>
            {puedeEscribir && (
              <Pressable onPress={() => escribir(p)} accessibilityRole="link" accessibilityLabel={`Escribir por WhatsApp a ${p.nombre}`}
                style={({ pressed }) => [s.whatsapp, pressed && { opacity: 0.8 }]}>
                <Text style={{ color: "#fff", fontWeight: "600" }}>WhatsApp</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      {!personas.length && !porEnviar.length && <Tenue>Todavía no ha registrado a nadie.</Tenue>}
    </>
  );
}

const s = StyleSheet.create({
  tarea: {
    flexDirection: "row", gap: espacio.m, alignItems: "flex-start", padding: espacio.l, borderRadius: radio.l,
    backgroundColor: color.panel, borderWidth: 1, borderColor: color.linea,
  },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: color.tenue, alignItems: "center", justifyContent: "center", marginTop: 1 },
  tareaTitulo: { color: color.texto, fontSize: 16, fontWeight: "600" },
  etiqueta: { color: color.tenue, fontSize: 13, fontWeight: "600" },
  chip: { borderWidth: 1, borderColor: color.linea, borderRadius: 999, paddingHorizontal: espacio.m, paddingVertical: espacio.s, minHeight: 40, justifyContent: "center" },
  foto: { width: "100%", aspectRatio: 3 / 4, borderRadius: radio.m, backgroundColor: color.panel2 },
  fila: { flexDirection: "row", alignItems: "center", gap: espacio.s, paddingVertical: espacio.s, borderBottomWidth: 1, borderBottomColor: color.linea },
  persona: {
    flexDirection: "row", alignItems: "center", gap: espacio.m, padding: espacio.m, borderRadius: radio.m,
    backgroundColor: color.panel, borderWidth: 1, borderColor: color.linea,
  },
  whatsapp: { backgroundColor: "#1f8f4e", borderRadius: radio.m, paddingHorizontal: espacio.m, minHeight: 44, justifyContent: "center" },
});

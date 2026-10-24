// App del líder y del testigo. Cada rol entra a su propio espacio; no hay un menú con todo.
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import type { Operacion } from "@ventaja/nucleo";
import { confirmar, Tenue } from "./componentes";
import { ProveedorApp, useApp } from "./contexto";
import { abrirAlmacen } from "./datos/abrirBase";
import type { AlmacenLocal } from "./datos/almacenLocal";
import { crearFuenteDemo } from "./datos/demo";
import { crearFuenteSupabase } from "./datos/supabase";
import type { FuenteMovil, Sesion } from "./datos/tipos";
import { InicioSesion } from "./pantallas/InicioSesion";
import { Lider, type PestanaLider } from "./pantallas/Lider";
import { FranjaSincronizacion, Sincronizacion } from "./pantallas/Sincronizacion";
import { Testigo } from "./pantallas/Testigo";
import { color, espacio } from "./tema";

type Extra = { modoDatos?: string; supabaseUrl?: string; supabasePublishableKey?: string };

function crearFuente(): FuenteMovil {
  const x = (Constants.expoConfig?.extra ?? {}) as Extra;
  if (x.modoDatos === "supabase" && x.supabaseUrl && x.supabasePublishableKey) return crearFuenteSupabase(x.supabaseUrl, x.supabasePublishableKey);
  return crearFuenteDemo();
}

export default function App() {
  const fuente = useMemo(crearFuente, []);
  const [local, setLocal] = useState<AlmacenLocal | null>(null);
  const [sesion, setSesion] = useState<Sesion | null | undefined>(undefined);

  useEffect(() => {
    abrirAlmacen().then(setLocal);
    fuente.sesionGuardada().then(setSesion).catch(() => setSesion(null));
  }, [fuente]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1, backgroundColor: color.grafito }} edges={["top", "left", "right"]}>
        {!local || sesion === undefined ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={color.acento} /></View>
        ) : !sesion ? (
          <InicioSesion fuente={fuente} alEntrar={setSesion} />
        ) : (
          <ProveedorApp key={sesion.usuarioId} fuente={fuente} sesion={sesion} local={local} alSalir={() => setSesion(null)}>
            <Espacio />
          </ProveedorApp>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const PESTANAS_LIDER: { id: PestanaLider; nombre: string }[] = [
  { id: "hoy", nombre: "Hoy" }, { id: "registrar", nombre: "Registrar" }, { id: "planilla", nombre: "Planilla" }, { id: "gente", nombre: "Mi gente" },
];

function Espacio() {
  const { sesion, fuente, conteo, cerrarSesion } = useApp();
  const [pestana, setPestana] = useState<PestanaLider>("hoy");
  const [verEnvios, setVerEnvios] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState<Operacion | null>(null);

  function salir() {
    const sinEnviar = conteo.pendiente + conteo.error;
    confirmar(
      "¿Cerrar sesión?",
      sinEnviar
        ? `Tiene ${sinEnviar} registros sin enviar en este teléfono. Si cierra sesión ahora, se pierden.`
        : "Se borra del teléfono la información de la campaña.",
      "Cerrar sesión",
      cerrarSesion,
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={s.cabeza}>
        <View style={{ flex: 1 }}>
          <Text style={s.marca}>VENTAJA MANDO</Text>
          <Tenue>{sesion.campanaNombre} · {sesion.rol === "lider" ? "Líder" : "Testigo"}</Tenue>
        </View>
        <Pressable onPress={salir} accessibilityRole="button" hitSlop={12}><Text style={{ color: color.tenue }}>Salir</Text></Pressable>
      </View>
      <FranjaSincronizacion alAbrir={() => setVerEnvios(true)} />
      {fuente.modo === "demo" && "servidor" in fuente && <SimuladorSenal fuente={fuente as ReturnType<typeof crearFuenteDemo>} />}

      <View style={{ flex: 1 }}>
        {sesion.rol === "lider"
          ? <Lider pestana={pestana} irA={setPestana} corrigiendo={corrigiendo} alTerminarCorreccion={() => setCorrigiendo(null)} />
          : <Testigo />}
      </View>

      {sesion.rol === "lider" && (
        <SafeAreaView edges={["bottom"]} style={s.barra}>
          {PESTANAS_LIDER.map((p) => (
            <Pressable key={p.id} onPress={() => { setPestana(p.id); if (p.id !== "registrar") setCorrigiendo(null); }}
              accessibilityRole="tab" accessibilityState={{ selected: pestana === p.id }} style={s.pestana}>
              <View style={[s.indicador, pestana === p.id && { backgroundColor: color.acento }]} />
              <Text style={[s.pestanaTexto, pestana === p.id && { color: color.texto }]}>{p.nombre}</Text>
            </Pressable>
          ))}
        </SafeAreaView>
      )}

      <Modal visible={verEnvios} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setVerEnvios(false)}>
        <View style={{ flex: 1, backgroundColor: color.grafito }}>
          <Sincronizacion alCerrar={() => setVerEnvios(false)}
            alCorregir={(op) => { setCorrigiendo(op); setPestana("registrar"); setVerEnvios(false); }} />
        </View>
      </Modal>
    </View>
  );
}

/** Solo en el modo demo: corta el «servidor» para ver cómo se comporta la app sin señal. */
function SimuladorSenal({ fuente }: { fuente: ReturnType<typeof crearFuenteDemo> }) {
  const { sincronizar } = useApp();
  const [sinSenal, setSinSenal] = useState(fuente.servidor.sinSenal);
  return (
    <View style={s.simulador}>
      <Text style={{ color: color.tenue, fontSize: 13, flex: 1 }}>Demo: simular sin señal</Text>
      <Switch value={sinSenal} accessibilityLabel="Simular sin señal" trackColor={{ true: color.ambar, false: color.linea }}
        onValueChange={(v) => { fuente.servidor.sinSenal = v; setSinSenal(v); if (!v) sincronizar(true); }} />
    </View>
  );
}

const s = StyleSheet.create({
  cabeza: { flexDirection: "row", alignItems: "center", paddingHorizontal: espacio.l, paddingTop: espacio.s, gap: espacio.m },
  marca: { color: color.acento, fontSize: 12, fontWeight: "700", letterSpacing: 1.2 },
  simulador: { flexDirection: "row", alignItems: "center", paddingHorizontal: espacio.l + 4, paddingTop: espacio.xs },
  barra: { flexDirection: "row", borderTopWidth: 1, borderTopColor: color.linea, backgroundColor: color.panel },
  pestana: { flex: 1, alignItems: "center", paddingTop: espacio.s, paddingBottom: espacio.s, minHeight: 56, gap: 6 },
  indicador: { width: 24, height: 3, borderRadius: 2, backgroundColor: "transparent" },
  pestanaTexto: { color: color.tenue, fontSize: 13, fontWeight: "600" },
});

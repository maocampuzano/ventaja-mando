// Si algo falla al abrir la app, en vez de cerrarse sin decir nada muestra qué pasó, para poder corregirlo.
// Nada de lo que muestra son datos de personas: solo el mensaje técnico del error.
import { Component, useEffect, useState, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";

type Oyente = (e: Error) => void;
const oyentes = new Set<Oyente>();
let ultimo: Error | null = null;

/** Captura los errores que tumbarían la app (también los del arranque) y los guarda para mostrarlos. */
export function capturarFallas() {
  const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler(): (e: unknown, f?: boolean) => void; setGlobalHandler(h: (e: unknown, f?: boolean) => void): void } };
  const eu = g.ErrorUtils;
  if (!eu) return;
  const anterior = eu.getGlobalHandler();
  eu.setGlobalHandler((e, fatal) => {
    if (!fatal) return anterior(e, fatal);
    avisarFalla(e);
  });
}

export function avisarFalla(e: unknown) {
  ultimo = e instanceof Error ? e : new Error(String(e));
  console.error(ultimo);
  oyentes.forEach((o) => o(ultimo!));
}

export function PantallaFalla({ error }: { error: Error }) {
  const detalle = (error.stack ?? "").split("\n").slice(0, 8).join("\n");
  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#141922" }} contentContainerStyle={{ padding: 24, paddingTop: 64, gap: 16 }}>
      <Text style={{ color: "#F2F4F8", fontSize: 22, fontWeight: "700" }}>Comando no pudo abrir</Text>
      <Text style={{ color: "#AEB6C4", fontSize: 15, lineHeight: 21 }}>
        Tome una captura de esta pantalla y envíela al equipo de soporte. Lo que tenía guardado en el teléfono no se borró.
      </Text>
      <View style={{ backgroundColor: "#1E2430", borderRadius: 12, padding: 16 }}>
        <Text selectable style={{ color: "#FF8A80", fontSize: 14, fontWeight: "600" }}>{error.name}: {error.message}</Text>
        {detalle ? <Text selectable style={{ color: "#AEB6C4", fontSize: 11, marginTop: 8 }}>{detalle}</Text> : null}
      </View>
    </ScrollView>
  );
}

class Barrera extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error(error); }
  render() { return this.state.error ? <PantallaFalla error={this.state.error} /> : this.props.children; }
}

/** Envuelve la app: si un error la tumbaría, muestra la pantalla de falla. */
export function ConFallas({ children }: { children: ReactNode }) {
  const [error, setError] = useState<Error | null>(ultimo);
  useEffect(() => { oyentes.add(setError); return () => { oyentes.delete(setError); }; }, []);
  if (error) return <PantallaFalla error={error} />;
  return <Barrera>{children}</Barrera>;
}

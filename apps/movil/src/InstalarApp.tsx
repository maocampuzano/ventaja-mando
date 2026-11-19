// Solo en el navegador: invita a instalar la web del líder en la pantalla de inicio del celular, para que se abra
// como una aplicación (pedido de Giovanni del 18/11/2026). En Android usa el aviso del navegador; en iPhone explica
// los dos toques. No aparece si ya está instalada o si la persona la cerró.
import { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Boton, Tenue } from "./componentes";
import { color, espacio, radio } from "./tema";

type AvisoInstalar = Event & { prompt: () => Promise<void> };
const LLAVE = "comando-instalar-cerrado";

function yaInstalada() {
  if (Platform.OS !== "web" || typeof window === "undefined") return true;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function InstalarApp() {
  const [aviso, setAviso] = useState<AvisoInstalar | null>(null);
  const [cerrado, setCerrado] = useState(() => {
    try { return yaInstalada() || localStorage.getItem(LLAVE) === "1"; } catch { return yaInstalada(); }
  });
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const f = (e: Event) => { e.preventDefault(); setAviso(e as AvisoInstalar); };
    window.addEventListener("beforeinstallprompt", f);
    return () => window.removeEventListener("beforeinstallprompt", f);
  }, []);
  if (cerrado) return null;
  const esIphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const cerrar = () => { setCerrado(true); try { localStorage.setItem(LLAVE, "1"); } catch { /* sin almacenamiento */ } };

  return (
    <View accessibilityLabel="Instalar Comando" style={{ margin: espacio.m, marginBottom: 0, padding: espacio.m, borderRadius: radio.m, backgroundColor: color.panel, borderWidth: 1, borderColor: color.linea, gap: 8 }}>
      <Text style={{ color: color.texto, fontWeight: "700" }}>Póngalo en la pantalla de inicio</Text>
      {aviso ? (
        <>
          <Tenue>Así se abre con un toque, como una aplicación, y funciona sin señal.</Tenue>
          <Boton titulo="Instalar Comando" alPresionar={async () => { await aviso.prompt(); cerrar(); }} />
        </>
      ) : esIphone ? (
        <Tenue>En Safari, toque el botón Compartir (el cuadrado con la flecha hacia arriba) y luego «Agregar a pantalla de inicio».</Tenue>
      ) : (
        <Tenue>En Chrome, abra el menú (los tres puntos) y toque «Instalar aplicación» o «Agregar a la pantalla principal».</Tenue>
      )}
      <Pressable onPress={cerrar} accessibilityRole="button"><Text style={{ color: color.tenue }}>Ahora no</Text></Pressable>
    </View>
  );
}

import type { ExpoConfig } from "expo/config";

// Igual que en la web: solo la URL y la clave publicable llegan a la app, y solo en modo «supabase».
// La clave secreta de Supabase nunca se incluye. En modo demo la app trabaja con datos ficticios en el teléfono.
const supabase = process.env.MODO_DATOS === "supabase";
const url = supabase ? (process.env.SUPABASE_URL ?? "").replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/$/, "") : "";

const config: ExpoConfig = {
  name: "Ventaja Mando",
  slug: "ventaja-mando",
  scheme: "ventajamando",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  backgroundColor: "#141922",
  // Identificadores de tienda provisionales: se confirman al crear la cuenta de Expo (V2).
  ios: { bundleIdentifier: "co.xyzcreatia.ventajamando", supportsTablet: false },
  android: { package: "co.xyzcreatia.ventajamando" },
  plugins: [
    "expo-sqlite",
    ["expo-image-picker", {
      cameraPermission: "Ventaja Mando usa la cámara para tomar la foto de las planillas, del E-14 y de la autorización firmada.",
      photosPermission: false,
    }],
  ],
  extra: {
    modoDatos: supabase ? "supabase" : "demo",
    supabaseUrl: url,
    supabasePublishableKey: supabase ? process.env.SUPABASE_PUBLISHABLE_KEY ?? "" : "",
  },
};

export default config;

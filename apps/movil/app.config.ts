import type { ExpoConfig } from "expo/config";

// Igual que en la web: solo la URL y la clave publicable llegan a la app, y solo en modo «supabase».
// La clave secreta de Supabase nunca se incluye. En modo demo la app trabaja con datos ficticios en el teléfono.
const supabase = process.env.MODO_DATOS === "supabase";
const url = supabase ? (process.env.SUPABASE_URL ?? "").replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/$/, "") : "";

const config: ExpoConfig = {
  name: "Comando",
  slug: "ventaja-mando",
  scheme: "ventajamando",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  backgroundColor: "#141922",
  icon: "./assets/icon.png",
  // Identificadores de tienda provisionales: se confirman cuando se publique en las tiendas.
  ios: { bundleIdentifier: "co.xyzcreatia.ventajamando", supportsTablet: false },
  android: {
    package: "co.xyzcreatia.ventajamando",
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#1F5BFF" },
    // Solo la cámara. La galería usa el selector de fotos de Android, que no pide permiso; el micrófono no se usa.
    permissions: ["android.permission.CAMERA"],
    blockedPermissions: ["android.permission.RECORD_AUDIO"],
  },
  web: { favicon: "./assets/favicon.png" },
  plugins: [
    "expo-sqlite",
    "expo-background-task",
    // El optimizador de Android (R8) borraba el constructor de la base interna de WorkManager (Room), que usa el envío
    // en segundo plano, y la app se cerraba al abrir. Estas reglas lo conservan.
    ["expo-build-properties", {
      android: {
        extraProguardRules: [
          "-keep class * extends androidx.room.RoomDatabase { <init>(); }",
          "-keep class androidx.work.impl.** { *; }",
        ].join("\n"),
      },
    }],
    ["expo-image-picker", {
      cameraPermission: "Comando usa la cámara para tomar la foto de las planillas, del E-14 y de la autorización firmada.",
      photosPermission: "Comando abre su galería solo cuando usted elige una foto del E-14 o de una planilla.",
      microphonePermission: false,
    }],
  ],
  // Proyecto de Expo donde se compila la APK (EAS Build). No es una clave: solo identifica el proyecto.
  owner: "maocampuzano17",
  extra: {
    eas: { projectId: "d7c731af-6984-4fe9-9f1c-d559a17528eb" },
    modoDatos: supabase ? "supabase" : "demo",
    supabaseUrl: url,
    supabasePublishableKey: supabase ? process.env.SUPABASE_PUBLISHABLE_KEY ?? "" : "",
  },
};

export default config;

import { createElement, type ComponentType } from "react";
import { Platform } from "react-native";
import { registerRootComponent } from "expo";
import { capturarFallas, ConFallas, PantallaFalla } from "./src/FallaArranque";

// Primero se instala el capturador de fallas: si algo se rompe al cargar la app, se ve el motivo en pantalla.
capturarFallas();
// Se carga con require (no import) para que un error al cargar quede dentro del try y se muestre.
/* eslint-disable @typescript-eslint/no-require-imports */
try {
  // Define la tarea de envío en segundo plano al arrancar (también cuando Android despierta la app sin pantalla).
  require("./src/segundoPlano");
  const App = (require("./src/App") as { default: ComponentType }).default;
  registerRootComponent(() => createElement(ConFallas, null, createElement(App)));
} catch (e) {
  /* eslint-enable @typescript-eslint/no-require-imports */
  const error = e instanceof Error ? e : new Error(String(e));
  registerRootComponent(() => createElement(PantallaFalla, { error }));
}

// En el navegador, la web del líder se guarda para abrir sin señal (public/sw.js). Solo en producción.
if (Platform.OS === "web" && typeof navigator !== "undefined" && "serviceWorker" in navigator && !__DEV__) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => undefined); });
}

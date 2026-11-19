import { Platform } from "react-native";
import { registerRootComponent } from "expo";
import App from "./src/App";

registerRootComponent(App);

// En el navegador, la web del líder se guarda para abrir sin señal (public/sw.js). Solo en producción.
if (Platform.OS === "web" && typeof navigator !== "undefined" && "serviceWorker" in navigator && !__DEV__) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => undefined); });
}

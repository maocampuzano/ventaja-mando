import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Aviso, Boton, Campo, Tenue, Titulo } from "../componentes";
import type { FuenteMovil, Sesion } from "../datos/tipos";
import { color, espacio } from "../tema";

export function InicioSesion({ fuente, alEntrar }: { fuente: FuenteMovil; alEntrar: (s: Sesion) => void }) {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function entrar() {
    setError(null);
    setOcupado(true);
    try { alEntrar(await fuente.iniciarSesion(correo, clave)); }
    catch (e) { setError((e as Error).message); }
    finally { setOcupado(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: color.grafito }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: espacio.xl, gap: espacio.l }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: espacio.xs }}>
          <Tenue>VENTAJA MANDO</Tenue>
          <Titulo>Entrar</Titulo>
          <Tenue>Para líderes y testigos. Después de entrar la primera vez, la app funciona sin señal.</Tenue>
        </View>
        {fuente.modo === "demo" && (
          <Aviso tono="acento">Modo demo, con datos ficticios. Entre con lider@demo.co o testigo@demo.co y cualquier contraseña.</Aviso>
        )}
        <Campo etiqueta="Correo" value={correo} onChangeText={setCorreo} autoCapitalize="none" autoComplete="email"
          keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" />
        <Campo etiqueta="Contraseña" value={clave} onChangeText={setClave} secureTextEntry autoComplete="password"
          textContentType="password" returnKeyType="go" onSubmitEditing={entrar} />
        {error && <Aviso tono="rojo">{error}</Aviso>}
        <Boton titulo="Entrar" alPresionar={entrar} ocupado={ocupado} deshabilitado={!correo.trim() || !clave} />
        <Tenue style={{ textAlign: "center" }}>¿No tiene cuenta? Pídale a su coordinador la invitación por correo.</Tenue>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

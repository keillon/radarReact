import React, { useEffect, useState } from "react";
import { ActivityIndicator, LogBox, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

LogBox.ignoreLogs([
  "new NativeEventEmitter",
  "addListener",
  "removeListeners",
  "AnimatedCoordinatesArray could not obtain AnimatedWithChildren",
  "AnimatedShape could not obtain AnimatedWithChildren",
]);

function Fallback() {
  return (
    <View style={styles.fallback}>
      <ActivityIndicator size="large" color="#3b82f6" />
    </View>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <View style={styles.fallback}>
      <Text style={styles.errorText}>Erro ao carregar tela</Text>
      <Text style={styles.errorSubtext}>{message}</Text>
    </View>
  );
}

export default function App() {
  const [showEditor, setShowEditor] = useState(false);
  const [HomeComponent, setHomeComponent] = useState<React.ComponentType<any> | null>(null);
  const [EditorComponent, setEditorComponent] = useState<React.ComponentType<any> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Carregar telas só após o mount para evitar "Requiring unknown module 'undefined'" no startup
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const homeMod = require("./screens/Home");
        const homeDefault = homeMod?.default;
        if (!cancelled && homeDefault) setHomeComponent(() => homeDefault);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) setLoadError(msg);
      }
      try {
        const editorMod = require("./screens/RadarEditorScreen");
        const editorDefault = editorMod?.default;
        if (!cancelled && editorDefault) setEditorComponent(() => editorDefault);
      } catch (_) {
        // Editor opcional; não sobrescreve erro da Home
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loadError) {
    return (
      <SafeAreaProvider>
        <ErrorScreen message={loadError} />
      </SafeAreaProvider>
    );
  }

  if (!HomeComponent) {
    return (
      <SafeAreaProvider>
        <Fallback />
      </SafeAreaProvider>
    );
  }

  const Editor = EditorComponent;
  return (
    <SafeAreaProvider>
      {showEditor && Editor ? (
        <Editor onClose={() => setShowEditor(false)} />
      ) : (
        <HomeComponent onOpenEditor={() => setShowEditor(true)} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  errorText: { fontSize: 18, fontWeight: "600", marginBottom: 8 },
  errorSubtext: { fontSize: 14, color: "#666", textAlign: "center" },
});

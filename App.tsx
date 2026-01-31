import React, { Suspense, useState } from "react";
import { ActivityIndicator, LogBox, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

function lazyScreen(loader: () => { default: React.ComponentType<any> }) {
  return React.lazy(() => {
    try {
      const m = loader();
      if (m && m.default) return Promise.resolve(m);
      return Promise.resolve({ default: () => <Text>Módulo sem default</Text> });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return Promise.resolve({
        default: () => (
          <View style={styles.fallback}>
            <Text style={styles.errorText}>Erro ao carregar tela</Text>
            <Text style={styles.errorSubtext}>{msg}</Text>
          </View>
        ),
      });
    }
  });
}

const Home = lazyScreen(() => require("./screens/Home"));
const RadarEditorScreen = lazyScreen(() => require("./screens/RadarEditorScreen"));

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

export default function App() {
  const [showEditor, setShowEditor] = useState(false);

  return (
    <SafeAreaProvider>
      <Suspense fallback={<Fallback />}>
        {showEditor ? (
          <RadarEditorScreen onClose={() => setShowEditor(false)} />
        ) : (
          <Home onOpenEditor={() => setShowEditor(true)} />
        )}
      </Suspense>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  errorText: { fontSize: 18, fontWeight: "600", marginBottom: 8 },
  errorSubtext: { fontSize: 14, color: "#666", textAlign: "center" },
});

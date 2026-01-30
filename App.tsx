import React, { useState } from "react";
import { LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Home from "./screens/Home";
import RadarEditorScreen from "./screens/RadarEditorScreen";

// Suprimir warnings conhecidos que não afetam o funcionamento
LogBox.ignoreLogs([
  "new NativeEventEmitter",
  "addListener",
  "removeListeners",
  "AnimatedCoordinatesArray could not obtain AnimatedWithChildren",
  "AnimatedShape could not obtain AnimatedWithChildren",
]);

export default function App() {
  const [showEditor, setShowEditor] = useState(false);

  return (
    <SafeAreaProvider>
      {showEditor ? (
        <RadarEditorScreen onClose={() => setShowEditor(false)} />
      ) : (
        <Home onOpenEditor={() => setShowEditor(true)} />
      )}
    </SafeAreaProvider>
  );
}

import React from "react";
import { LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Home from "./screens/Home";

// Suprimir warnings conhecidos que não afetam o funcionamento
LogBox.ignoreLogs([
  "new NativeEventEmitter",
  "AnimatedCoordinatesArray could not obtain AnimatedWithChildren",
  "AnimatedShape could not obtain AnimatedWithChildren",
]);

export default function App() {
  return (
    <SafeAreaProvider>
      <Home />
    </SafeAreaProvider>
  );
}

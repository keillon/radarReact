import React, { useEffect, useState } from "react";
import { ActivityIndicator, LogBox, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SettingsProvider } from "./context/SettingsContext";

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

function AuthScreens() {
  const { loading } = useAuth();
  const [screen, setScreen] = useState<"login" | "register">("login");
  const [LoginComp, setLoginComp] = useState<React.ComponentType<any> | null>(null);
  const [RegisterComp, setRegisterComp] = useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    try {
      setLoginComp(() => require("./screens/LoginScreen").default);
      setRegisterComp(() => require("./screens/RegisterScreen").default);
    } catch {}
  }, []);

  if (!LoginComp || !RegisterComp) return <Fallback />;
  if (loading) return <Fallback />;

  const Login = LoginComp;
  const Register = RegisterComp;

  return screen === "login" ? (
    <Login
      onGoToRegister={() => setScreen("register")}
    />
  ) : (
    <Register
      onGoToLogin={() => setScreen("login")}
    />
  );
}

function MainContent() {
  const { user, loading } = useAuth();
  const [authChecked, setAuthChecked] = useState(false);
  const [HomeComponent, setHomeComponent] = useState<React.ComponentType<any> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      setAuthChecked(true);
    } else if (user) {
      setAuthChecked(true);
    }
  }, [loading, user]);

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

  if (!authChecked || loading) {
    return (
      <SafeAreaProvider>
        <Fallback />
      </SafeAreaProvider>
    );
  }

  if (!user) {
    return (
      <SafeAreaProvider>
        <AuthScreens />
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

  const Home = HomeComponent;
  return (
    <SafeAreaProvider>
      <Home />
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <MainContent />
      </SettingsProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  errorText: { fontSize: 18, fontWeight: "600", marginBottom: 8 },
  errorSubtext: { fontSize: 14, color: "#666", textAlign: "center" },
});

import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  LogBox,
  Platform,
  PermissionsAndroid,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { IAPProvider } from "./context/IAPContext";
import { SettingsProvider } from "./context/SettingsContext";
import { colors } from "./utils/theme";

LogBox.ignoreLogs([
  "new NativeEventEmitter",
  "addListener",
  "removeListeners",
  "AnimatedCoordinatesArray could not obtain AnimatedWithChildren",
  "AnimatedShape could not obtain AnimatedWithChildren",
]);

/** Tela de carregamento personalizada: logo + animação (enquanto carrega mapa/Home). */
function LoadingScreen() {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 800,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ])
    );
    const fade = Animated.loop(
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0.9,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0.4,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    fade.start();
    return () => {
      pulse.stop();
      fade.stop();
    };
  }, [pulseAnim, fadeAnim]);

  return (
    <View style={styles.loadingScreen}>
      <View style={styles.loadingLogoWrap}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Image
            source={require("./assets/images/logo.png")}
            resizeMode="contain"
            style={styles.loadingLogo}
          />
        </Animated.View>
      </View>
      <Animated.Text style={[styles.loadingText, { opacity: fadeAnim }]}>
        Carregando...
      </Animated.Text>
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

  if (!LoginComp || !RegisterComp) return <LoadingScreen />;
  if (loading) return <LoadingScreen />;

  const Login = LoginComp;
  const Register = RegisterComp;

  return screen === "login" ? (
    <Login key="login" onGoToRegister={() => setScreen("register")} />
  ) : (
    <Register key="register" onGoToLogin={() => setScreen("login")} />
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

  // Pré-carrega Home e Map assim que o app abre (no login já deixa tudo pronto para ao entrar estar montado).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const homeMod = require("./screens/Home");
        const homeDefault = homeMod?.default;
        if (!cancelled && homeDefault) setHomeComponent(() => homeDefault);
        if (!cancelled) {
          try {
            require("./components/Map");
          } catch {
            // Map pode falhar se dependências nativas não estiverem prontas; Home ainda usa lazy.
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) setLoadError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
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
        <LoadingScreen />
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
        <LoadingScreen />
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

/** Solicita permissão de localização assim que o app abre (antes do login). */
function useRequestLocationOnStartup() {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    (async () => {
      try {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
      } catch {}
    })();
  }, []);
}

export default function App() {
  useRequestLocationOnStartup();

  return (
    <AuthProvider>
      <SettingsProvider>
        <IAPProvider>
          <MainContent />
        </IAPProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
    padding: 24,
  },
  loadingLogoWrap: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: "rgba(255, 193, 7, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  loadingLogo: {
    width: 80,
    height: 80,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  fallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    backgroundColor: colors.background,
  },
  errorText: { fontSize: 18, fontWeight: "600", marginBottom: 8, color: colors.text },
  errorSubtext: { fontSize: 14, color: colors.textSecondary, textAlign: "center" },
});

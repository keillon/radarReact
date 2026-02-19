import React, { useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useAuth } from "../context/AuthContext";
import { colors } from "../utils/theme";

interface RegisterScreenProps {
  onGoToLogin: () => void;
}

export default function RegisterScreen({ onGoToLogin }: RegisterScreenProps) {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleRegister = async () => {
    const e = email.trim();
    const p = password;
    const cp = confirmPassword;
    if (!e || !p) {
      setError("Preencha email e senha");
      return;
    }
    if (p.length < 6) {
      setError("Senha deve ter no mínimo 6 caracteres");
      return;
    }
    if (p !== cp) {
      setError("As senhas não coincidem");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await register(e, p, name.trim() || undefined);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Image
                source={require("../assets/images/logo.png")}
                resizeMode="contain"
                style={styles.logo}
              />
            </View>
            <Text style={styles.title}>Criar conta</Text>
            <Text style={styles.subtitle}>Cadastre-se no RadarZone</Text>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Nome (opcional)"
            placeholderTextColor={colors.textTertiary}
            value={name}
            onChangeText={(t) => {
              setName(t);
              setError("");
            }}
            autoCapitalize="words"
          />

          <TextInput
            style={styles.input}
            placeholder="E-mail"
            placeholderTextColor={colors.textTertiary}
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError("");
            }}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />

          <View style={styles.inputRow}>
            <TextInput
              style={styles.inputWithIcon}
              placeholder="Senha (mín. 6 caracteres)"
              placeholderTextColor={colors.textTertiary}
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError("");
              }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowPassword(!showPassword)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.inputWithIcon}
              placeholder="Confirmar senha"
              placeholderTextColor={colors.textTertiary}
              value={confirmPassword}
              onChangeText={(t) => {
                setConfirmPassword(t);
                setError("");
              }}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.btnPrimaryText}>Cadastrar</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.link}
            onPress={onGoToLogin}
            activeOpacity={0.7}
          >
            <Text style={styles.linkText}>
              Já tem conta? <Text style={styles.linkBold}>Entrar</Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    paddingVertical: 40,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.backgroundCard,
    borderRadius: 24,
    padding: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  header: {
    alignItems: "center",
    marginBottom: 28,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "rgba(255, 193, 7, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  logo: {
    width: 75,
    height: 75,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textTertiary,
  },
  input: {
    backgroundColor: colors.backgroundCardSecondary,
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    backgroundColor: colors.backgroundCardSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "transparent",
  },
  inputWithIcon: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: colors.text,
  },
  eyeIcon: {
    padding: 12,
  },
  error: {
    color: colors.error,
    fontSize: 14,
    marginBottom: 12,
    textAlign: "center",
  },
  btn: {
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  btnPrimary: {
    backgroundColor: colors.primary,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  btnPrimaryText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "600",
  },
  link: {
    marginTop: 24,
    alignItems: "center",
  },
  linkText: {
    color: colors.textTertiary,
    fontSize: 15,
  },
  linkBold: {
    color: colors.primary,
    fontWeight: "600",
  },
});

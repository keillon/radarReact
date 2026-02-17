import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";

type MenuScreen = "menu" | "profile" | "accountSettings";

interface MenuItemProps {
  icon: string;
  label: string;
  onPress?: () => void;
  right?: React.ReactNode;
}

function MenuItem({
  icon,
  label,
  onPress,
  right,
}: MenuItemProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[styles.menuItem, { transform: [{ scale: scaleAnim }] }]}>
        <Ionicons name={icon as any} size={24} color="#64748b" />
        <Text style={styles.menuItemLabel}>{label}</Text>
        {right}
      </Animated.View>
    </Pressable>
  );
}

interface MenuModalProps {
  visible: boolean;
  onClose: () => void;
}

function MenuModal({ visible, onClose }: MenuModalProps) {
  const slideAnim = useRef(new Animated.Value(-300)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const { user, logout, updateProfile, changePassword } = useAuth();
  const {
    soundEnabled,
    setSoundEnabled,
    volume,
    setVolume,
    mapVoiceEnabled,
    setMapVoiceEnabled,
  } = useSettings();

  const [screen, setScreen] = useState<MenuScreen>("menu");
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setProfileName(user?.name || "");
      setProfileEmail(user?.email || "");
      setScreen("menu");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [visible, user?.name, user?.email]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -300,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, backdropAnim]);

  const handleLogout = async () => {
    Alert.alert("Sair", "Deseja realmente sair da sua conta?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: async () => {
        onClose();
        await logout();
      }},
    ]);
  };

  const handleSaveProfile = async () => {
    const name = profileName.trim() || undefined;
    const email = profileEmail.trim().toLowerCase();
    if (!email) {
      Alert.alert("Erro", "Email é obrigatório");
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ name: name || undefined, email });
      Alert.alert("Sucesso", "Perfil atualizado com sucesso");
      setScreen("menu");
    } catch (e) {
      Alert.alert("Erro", e instanceof Error ? e.message : "Erro ao atualizar perfil");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Erro", "Preencha todos os campos");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("Erro", "A nova senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Erro", "A nova senha e a confirmação não coincidem");
      return;
    }
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      Alert.alert("Sucesso", "Senha alterada com sucesso");
      setScreen("menu");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      Alert.alert("Erro", e instanceof Error ? e.message : "Erro ao alterar senha");
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    Keyboard.dismiss();
    setScreen("menu");
  };

  const backdropOpacity = backdropAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  };

  const renderHeader = (title: string, showBack = false) => (
    <View style={styles.screenHeader}>
      {showBack && (
        <TouchableOpacity onPress={goBack} style={styles.backButton} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
      )}
      <Text style={styles.screenTitle}>{title}</Text>
    </View>
  );

  const renderMenuContent = () => (
    <>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.userName}>{user?.name || "Usuário"}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
      </View>

      <ScrollView style={styles.menuScroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Som</Text>
        <MenuItem
          icon="volume-high"
          label="Som ativado"
          right={
            <Switch
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              trackColor={{ false: "#334155", true: "#3b82f6" }}
              thumbColor="#fff"
            />
          }
        />
        <MenuItem
          icon="volume-medium"
          label="Volume"
          right={
            <View style={styles.volumeRow}>
              <TouchableOpacity
                onPress={() => setVolume(Math.max(0, volume - 0.1))}
                style={styles.volumeBtn}
              >
                <Ionicons name="remove" size={20} color="#94a3b8" />
              </TouchableOpacity>
              <Text style={styles.volumeText}>
                {Math.round(volume * 100)}%
              </Text>
              <TouchableOpacity
                onPress={() => setVolume(Math.min(1, volume + 0.1))}
                style={styles.volumeBtn}
              >
                <Ionicons name="add" size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>
          }
        />
        <MenuItem
          icon="mic"
          label="Voz do mapa (TTS)"
          right={
            <Switch
              value={mapVoiceEnabled}
              onValueChange={setMapVoiceEnabled}
              trackColor={{ false: "#334155", true: "#3b82f6" }}
              thumbColor="#fff"
            />
          }
        />

        <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Conta</Text>
        <MenuItem
          icon="person"
          label="Perfil"
          onPress={() => setScreen("profile")}
        />
        <MenuItem
          icon="settings"
          label="Configurações da conta"
          onPress={() => setScreen("accountSettings")}
        />
        <MenuItem
          icon="log-out"
          label="Sair"
          onPress={handleLogout}
        />
      </ScrollView>
    </>
  );

  const renderProfileContent = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.keyboardView}
    >
      <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarLarge}>
          <Text style={styles.avatarTextLarge}>
            {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
          </Text>
        </View>

        <Text style={styles.fieldLabel}>Nome</Text>
        <TextInput
          style={styles.input}
          value={profileName}
          onChangeText={setProfileName}
          placeholder="Seu nome"
          placeholderTextColor="#64748b"
          autoCapitalize="words"
        />

        <Text style={styles.fieldLabel}>Email</Text>
        <TextInput
          style={styles.input}
          value={profileEmail}
          onChangeText={setProfileEmail}
          placeholder="seu@email.com"
          placeholderTextColor="#64748b"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={18} color="#64748b" />
          <Text style={styles.infoText}>
            Membro desde {formatDate(user?.createdAt)}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.buttonDisabled]}
          onPress={handleSaveProfile}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Salvar alterações</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderAccountSettingsContent = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.keyboardView}
    >
      <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Alterar senha</Text>

        <Text style={styles.fieldLabel}>Senha atual</Text>
        <TextInput
          style={styles.input}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder="Digite sua senha atual"
          placeholderTextColor="#64748b"
          secureTextEntry
          autoCapitalize="none"
        />

        <Text style={styles.fieldLabel}>Nova senha</Text>
        <TextInput
          style={styles.input}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="Mínimo 6 caracteres"
          placeholderTextColor="#64748b"
          secureTextEntry
          autoCapitalize="none"
        />

        <Text style={styles.fieldLabel}>Confirmar nova senha</Text>
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Repita a nova senha"
          placeholderTextColor="#64748b"
          secureTextEntry
          autoCapitalize="none"
        />

        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.buttonDisabled]}
          onPress={handleChangePassword}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Alterar senha</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setScreen("profile")}
        >
          <Ionicons name="person-outline" size={20} color="#3b82f6" />
          <Text style={styles.secondaryButtonText}>Editar perfil (nome e email)</Text>
        </TouchableOpacity>

        <View style={styles.accountInfo}>
          <Text style={styles.accountInfoTitle}>Informações da conta</Text>
          <View style={styles.accountInfoRow}>
            <Text style={styles.accountInfoLabel}>Email:</Text>
            <Text style={styles.accountInfoValue}>{user?.email}</Text>
          </View>
          <View style={styles.accountInfoRow}>
            <Text style={styles.accountInfoLabel}>Nome:</Text>
            <Text style={styles.accountInfoValue}>{user?.name || "—"}</Text>
          </View>
          <View style={styles.accountInfoRow}>
            <Text style={styles.accountInfoLabel}>Cadastro:</Text>
            <Text style={styles.accountInfoValue}>{formatDate(user?.createdAt)}</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
          pointerEvents="none"
        />
        <Animated.View
          style={[
            styles.drawer,
            {
              transform: [{ translateX: slideAnim }],
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          {screen === "menu" && renderMenuContent()}
          {screen === "profile" && (
            <>
              {renderHeader("Perfil", true)}
              {renderProfileContent()}
            </>
          )}
          {screen === "accountSettings" && (
            <>
              {renderHeader("Configurações da conta", true)}
              {renderAccountSettingsContent()}
            </>
          )}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

export default MenuModal;
export { MenuModal };

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  drawer: {
    width: 300,
    flex: 0,
    alignSelf: "stretch",
    backgroundColor: "#1e293b",
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 16,
  },
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#3b82f6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#3b82f6",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 24,
  },
  avatarTextLarge: {
    fontSize: 36,
    fontWeight: "700",
    color: "#fff",
  },
  userName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
    color: "#94a3b8",
  },
  menuScroll: {
    flex: 1,
    maxHeight: 400,
  },
  formScroll: {
    flex: 1,
    maxHeight: 450,
  },
  keyboardView: {
    flex: 1,
  },
  menu: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    letterSpacing: 1,
    marginBottom: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 14,
  },
  menuItemLabel: {
    flex: 1,
    fontSize: 16,
    color: "#e2e8f0",
  },
  volumeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  volumeBtn: {
    padding: 4,
  },
  volumeText: {
    fontSize: 14,
    color: "#94a3b8",
    minWidth: 36,
    textAlign: "right",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94a3b8",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#fff",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 8,
  },
  infoText: {
    fontSize: 14,
    color: "#94a3b8",
  },
  primaryButton: {
    backgroundColor: "#3b82f6",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3b82f6",
  },
  secondaryButtonText: {
    fontSize: 15,
    color: "#3b82f6",
    fontWeight: "600",
  },
  accountInfo: {
    marginTop: 32,
    padding: 16,
    backgroundColor: "#0f172a",
    borderRadius: 12,
  },
  accountInfoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 12,
  },
  accountInfoRow: {
    flexDirection: "row",
    marginTop: 6,
    gap: 8,
  },
  accountInfoLabel: {
    fontSize: 13,
    color: "#64748b",
    minWidth: 70,
  },
  accountInfoValue: {
    fontSize: 13,
    color: "#e2e8f0",
    flex: 1,
  },
});

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
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { colors } from "../utils/theme";

type MenuScreen = "menu" | "profile" | "accountSettings" | "soundSettings";

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
        <Ionicons name={icon as any} size={24} color={colors.textSecondary} />
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
    ttsVoiceId,
    setTtsVoiceId,
  } = useSettings();

  const [screen, setScreen] = useState<MenuScreen>("menu");
  const [maleVoice, setMaleVoice] = useState<{ id: string; name: string } | null>(null);
  const [femaleVoice, setFemaleVoice] = useState<{ id: string; name: string } | null>(null);
  const [previewing, setPreviewing] = useState<"male" | "female" | null>(null);
  const [profileName, setProfileName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setProfileName(user?.name || "");
      setScreen("menu");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [visible, user?.name]);

  const lower = (s: string) => (s || "").toLowerCase();
  const MALE_TERMS = ["male", "masculin", "homem", "masculino"];
  const FEMALE_TERMS = ["female", "feminin", "mulher", "feminino", "feminina"];

  const pickVoiceByGender = (gender: "male" | "female") => {
    const voice = gender === "male" ? maleVoice : femaleVoice;
    if (voice) {
      setTtsVoiceId(voice.id);
      try {
        require("react-native-tts").default.setDefaultVoice?.(voice.id);
      } catch {}
    }
  };

  const previewVoice = (gender: "male" | "female") => {
    const voice = gender === "male" ? maleVoice : femaleVoice;
    if (!voice) return;
    try {
      const Tts = require("react-native-tts").default;
      if (previewing === gender) {
        Tts.stop?.();
        setPreviewing(null);
        return;
      }
      setPreviewing(gender);
      const { volume } = require("../utils/settingsStore").getStoredSettings();
      const init = async () => {
        await Tts.setDefaultLanguage?.("pt-BR");
        await Tts.getInitStatus?.();
      };
      init().then(() => {
        Tts.setDefaultVoice?.(voice.id);
        const opts = Platform.OS === "android"
          ? { androidParams: { KEY_PARAM_VOLUME: volume, KEY_PARAM_STREAM: "STREAM_MUSIC" } }
          : {};
        Tts.speak("Radar a 100 metros", opts);
        setTimeout(() => setPreviewing(null), 2500);
      });
    } catch {
      setPreviewing(null);
    }
  };

  useEffect(() => {
    if (screen === "soundSettings") {
      try {
        const Tts = require("react-native-tts").default;
        Tts.voices?.()
          .then((list: Array<{ id: string; name: string; language: string }>) => {
            const all = (list || []).filter((v) => v?.id);
            if (all.length === 0) {
              setMaleVoice(null);
              setFemaleVoice(null);
              return;
            }
            const ptFirst = [...all.filter((v) => v.language?.startsWith("pt")), ...all];
            let male = ptFirst.find((v) => MALE_TERMS.some((t) => lower(v.name).includes(t) || lower(v.id).includes(t)));
            let female = ptFirst.find((v) => FEMALE_TERMS.some((t) => lower(v.name).includes(t) || lower(v.id).includes(t)));
            if (!male) male = ptFirst[0];
            if (!female) female = ptFirst[1] ?? ptFirst[0];
            setMaleVoice(male ? { id: male.id, name: male.name || "Voz 1" } : null);
            setFemaleVoice(female ? { id: female.id, name: female.name || "Voz 2" } : null);
          })
          .catch(() => {
            setMaleVoice(null);
            setFemaleVoice(null);
          });
      } catch {
        setMaleVoice(null);
        setFemaleVoice(null);
      }
    }
  }, [screen]);

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
    setSaving(true);
    try {
      await updateProfile({ name: name || undefined });
      Alert.alert("Sucesso", "Perfil atualizado com sucesso");
      closeFullScreen();
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
      closeFullScreen();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      Alert.alert("Erro", e instanceof Error ? e.message : "Erro ao alterar senha");
    } finally {
      setSaving(false);
    }
  };

  const closeFullScreen = () => {
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

  const openFullScreen = (s: "profile" | "accountSettings" | "soundSettings") => setScreen(s);

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
        <Text style={styles.sectionTitle}>Conta</Text>
        <MenuItem
          icon="person"
          label="Perfil"
          onPress={() => openFullScreen("profile")}
        />
        <MenuItem
          icon="settings"
          label="Configurações da conta"
          onPress={() => openFullScreen("accountSettings")}
        />
        <MenuItem
          icon="volume-high"
          label="Som e voz"
          onPress={() => openFullScreen("soundSettings")}
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
      style={styles.fullScreenKeyboard}
    >
      <ScrollView style={styles.fullScreenScroll} showsVerticalScrollIndicator={false}>
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
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="words"
        />

        <Text style={styles.fieldLabel}>Email</Text>
        <View style={styles.readOnlyField}>
          <Text style={styles.readOnlyText}>{user?.email}</Text>
          <Ionicons name="lock-closed" size={16} color={colors.textSecondary} />
        </View>
        <Text style={styles.fieldHint}>O email não pode ser alterado</Text>

        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
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
            <ActivityIndicator color={colors.text} size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Salvar alterações</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderSoundSettingsContent = () => (
    <ScrollView
      style={styles.fullScreenScroll}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.sectionTitle}>Som</Text>
      <MenuItem
        icon="volume-high"
        label="Voz alerta de rotas"
        right={
          <Switch
            value={soundEnabled}
            onValueChange={setSoundEnabled}
            trackColor={{ false: colors.borderSecondary, true: colors.primary }}
            thumbColor={colors.text}
          />
        }
      />
     
      <MenuItem
        icon="mic"
        label="Voz alerta de radares (TTS)"
        right={
          <Switch
            value={mapVoiceEnabled}
            onValueChange={setMapVoiceEnabled}
            trackColor={{ false: colors.borderSecondary, true: colors.primary }}
            thumbColor={colors.text}
          />
        }
      />

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Voz (TTS)</Text>
      <Text style={styles.fieldHint}>
        Escolha a voz para os alertas de radar. Toque em Ouvir para pré-visualizar.
      </Text>
      <TouchableOpacity
        style={[styles.voiceOption, !ttsVoiceId && styles.voiceOptionSelected]}
        onPress={() => setTtsVoiceId(null)}
      >
        <Ionicons
          name={!ttsVoiceId ? "checkmark-circle" : "ellipse-outline"}
          size={24}
          color={!ttsVoiceId ? colors.primary : colors.textSecondary}
        />
        <Text style={styles.voiceOptionText}>Padrão do sistema</Text>
      </TouchableOpacity>
      <View style={styles.voiceRow}>
        <View collapsable={false} style={[styles.voiceCard, ttsVoiceId === maleVoice?.id && styles.voiceCardSelected]}>
          <Pressable
            style={styles.voiceCardTouchable}
            onPress={() => maleVoice && pickVoiceByGender("male")}
            android_ripple={{ color: "rgba(255,193,7,0.3)" }}
          >
            <Ionicons
              name={ttsVoiceId === maleVoice?.id ? "checkmark-circle" : "ellipse-outline"}
              size={24}
              color={ttsVoiceId === maleVoice?.id ? colors.primary : colors.textSecondary}
            />
            <View style={styles.voiceCardContent}>
              <Ionicons name="male" size={28} color={colors.primaryDark} />
              <Text style={styles.voiceOptionText}>Masculina</Text>
            </View>
          </Pressable>
          <Pressable
            style={[styles.previewBtn, (!maleVoice || previewing) && styles.previewBtnDisabled]}
            onPress={() => maleVoice && previewVoice("male")}
            disabled={!maleVoice || (previewing !== null && previewing !== "male")}
            android_ripple={{ color: "rgba(255,255,255,0.2)" }}
          >
            <Ionicons
              name={previewing === "male" ? "stop" : "play"}
              size={18}
              color={colors.text}
            />
            <Text style={styles.previewBtnText}>
              {previewing === "male" ? "Parar" : "Ouvir"}
            </Text>
          </Pressable>
        </View>
        <View collapsable={false} style={[styles.voiceCard, ttsVoiceId === femaleVoice?.id && styles.voiceCardSelected]}>
          <Pressable
            style={styles.voiceCardTouchable}
            onPress={() => femaleVoice && pickVoiceByGender("female")}
            android_ripple={{ color: "rgba(255,193,7,0.3)" }}
          >
            <Ionicons
              name={ttsVoiceId === femaleVoice?.id ? "checkmark-circle" : "ellipse-outline"}
              size={24}
              color={ttsVoiceId === femaleVoice?.id ? colors.primary : colors.textSecondary}
            />
            <View style={styles.voiceCardContent}>
              <Ionicons name="female" size={28} color={colors.warning} />
              <Text style={styles.voiceOptionText}>Feminina</Text>
            </View>
          </Pressable>
          <Pressable
            style={[styles.previewBtn, (!femaleVoice || previewing) && styles.previewBtnDisabled]}
            onPress={() => femaleVoice && previewVoice("female")}
            disabled={!femaleVoice || (previewing !== null && previewing !== "female")}
            android_ripple={{ color: "rgba(255,255,255,0.2)" }}
          >
            <Ionicons
              name={previewing === "female" ? "stop" : "play"}
              size={18}
              color={colors.text}
            />
            <Text style={styles.previewBtnText}>
              {previewing === "female" ? "Parar" : "Ouvir"}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );

  const renderAccountSettingsContent = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.fullScreenKeyboard}
    >
      <ScrollView style={styles.fullScreenScroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Alterar senha</Text>

        <Text style={styles.fieldLabel}>Senha atual</Text>
        <TextInput
          style={styles.input}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder="Digite sua senha atual"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
          autoCapitalize="none"
        />

        <Text style={styles.fieldLabel}>Nova senha</Text>
        <TextInput
          style={styles.input}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="Mínimo 6 caracteres"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
          autoCapitalize="none"
        />

        <Text style={styles.fieldLabel}>Confirmar nova senha</Text>
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Repita a nova senha"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
          autoCapitalize="none"
        />

        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.buttonDisabled]}
          onPress={handleChangePassword}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.text} size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Alterar senha</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setScreen("profile")}
        >
          <Ionicons name="person-outline" size={20} color={colors.primary} />
          <Text style={styles.secondaryButtonText}>Editar perfil (nome)</Text>
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

  const handleRequestClose = () => {
    if (screen === "menu") onClose();
    else closeFullScreen();
  };

  return (
    <Modal
      visible={visible}
      transparent={screen === "menu"}
      animationType="none"
      onRequestClose={handleRequestClose}
    >
      {screen === "menu" ? (
        <Pressable style={styles.overlay} onPress={onClose}>
          <Animated.View
            style={[styles.backdrop, { opacity: backdropOpacity }]}
            pointerEvents="none"
          />
          <Animated.View
            style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}
            onStartShouldSetResponder={() => true}
          >
            {renderMenuContent()}
          </Animated.View>
        </Pressable>
      ) : (
        <View style={styles.fullScreenWrapper}>
          <SafeAreaView style={styles.fullScreenContainer} edges={["top", "left", "right"]}>
            <View style={styles.fullScreenHeader}>
            <TouchableOpacity
              onPress={closeFullScreen}
              style={styles.fullScreenBackBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.fullScreenTitle}>
              {screen === "profile"
                ? "Perfil"
                : screen === "soundSettings"
                  ? "Som e voz"
                  : "Configurações da conta"}
            </Text>
          </View>
            {screen === "profile" && renderProfileContent()}
            {screen === "accountSettings" && renderAccountSettingsContent()}
            {screen === "soundSettings" && renderSoundSettingsContent()}
          </SafeAreaView>
        </View>
      )}
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
    backgroundColor: colors.background,
  },
  drawer: {
    width: 300,
    flex: 0,
    alignSelf: "stretch",
    backgroundColor: colors.backgroundCard,
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
  fullScreenWrapper: {
    flex: 1,
    backgroundColor: colors.backgroundCard,
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: colors.backgroundCard,
  },
  fullScreenHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  fullScreenBackBtn: {
    padding: 4,
    marginRight: 12,
  },
  fullScreenTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  fullScreenKeyboard: {
    flex: 1,
  },
  fullScreenScroll: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 24,
  },
  avatarTextLarge: {
    fontSize: 36,
    fontWeight: "700",
    color: colors.text,
  },
  userName: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
    color: colors.textTertiary,
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
    color: colors.textSecondary,
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
    color: colors.text,
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
    color: colors.textTertiary,
    minWidth: 36,
    textAlign: "right",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textTertiary,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: colors.backgroundCardSecondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  readOnlyField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.backgroundCardSecondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  readOnlyText: {
    fontSize: 16,
    color: colors.textTertiary,
    flex: 1,
  },
  fieldHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
    marginLeft: 4,
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
    color: colors.textTertiary,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
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
    borderColor: colors.primary,
  },
  secondaryButtonText: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: "600",
  },
  accountInfo: {
    marginTop: 32,
    padding: 16,
    backgroundColor: colors.background,
    borderRadius: 12,
  },
  accountInfoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 12,
  },
  accountInfoRow: {
    flexDirection: "row",
    marginTop: 6,
    gap: 8,
  },
  accountInfoLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    minWidth: 70,
  },
  accountInfoValue: {
    fontSize: 13,
    color: colors.text,
    flex: 1,
  },
  voiceOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.backgroundCardSecondary,
    marginTop: 8,
  },
  voiceOptionSelected: {
    backgroundColor: colors.backgroundCardSecondary,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  voiceOptionText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: "500",
  },
  voiceOptionSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  voiceRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  voiceCard: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.backgroundCardSecondary,
    borderWidth: 2,
    borderColor: "transparent",
  },
  voiceCardSelected: {
    borderColor: colors.primary,
  },
  voiceCardTouchable: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  voiceCardContent: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  previewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
    minHeight: 44,
  },
  previewBtnDisabled: {
    opacity: 0.5,
  },
  previewBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
});

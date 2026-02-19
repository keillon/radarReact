import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useIAP } from "../context/IAPContext";
import { useSettings } from "../context/SettingsContext";
import { colors } from "../utils/theme";
import { AppModal, type AppModalButton } from "./AppModal";

type MenuScreen = "menu" | "profile" | "accountSettings" | "soundSettings" | "subscription";

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
  /** Chamado ao tocar em "Atualizar radares" (opcional) */
  onRefreshRadars?: () => void;
}

function MenuModal({ visible, onClose, onRefreshRadars }: MenuModalProps) {
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
  const {
    isSubscribed,
    isInFreePeriod,
    hasFullAccess,
    freePeriodEndsAt,
    subscriptionPrice,
    purchaseSubscription,
    restorePurchases,
  } = useIAP();

  const [screen, setScreen] = useState<MenuScreen>("menu");
  const [iapActionLoading, setIapActionLoading] = useState(false);
  const [iapMessage, setIapMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  // Vozes pt-BR fixas (ids do dispositivo)
  const MALE_VOICE_ID = "pt-br-x-ptd-network";
  const FEMALE_VOICE_ID = "pt-br-x-pte-local";
  const [profileName, setProfileName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [appModal, setAppModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    buttons: AppModalButton[];
  }>({ visible: false, title: "", message: "", buttons: [] });

  const showAlert = (title: string, message: string) => {
    setAppModal({
      visible: true,
      title,
      message,
      buttons: [
        { text: "OK", onPress: () => setAppModal((s) => ({ ...s, visible: false })) },
      ],
    });
  };

  const showConfirm = (
    title: string,
    message: string,
    opts: { confirmText?: string; cancelText?: string; onConfirm: () => void },
  ) => {
    setAppModal({
      visible: true,
      title,
      message,
      buttons: [
        {
          text: opts.cancelText ?? "Cancelar",
          style: "cancel",
          onPress: () => setAppModal((s) => ({ ...s, visible: false })),
        },
        {
          text: opts.confirmText ?? "Confirmar",
          style: "destructive",
          onPress: () => {
            setAppModal((s) => ({ ...s, visible: false }));
            opts.onConfirm();
          },
        },
      ],
    });
  };

  useEffect(() => {
    if (visible) {
      setProfileName(user?.name || "");
      setScreen("menu");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [visible, user?.name]);

  const pickVoice = (voiceId: string) => {
    setTtsVoiceId(voiceId);
    try {
      require("react-native-tts").default.setDefaultVoice?.(voiceId);
    } catch {}
  };

  const previewVoiceById = (voiceId: string) => {
    try {
      const Tts = require("react-native-tts").default;
      if (previewingId === voiceId) {
        Tts.stop?.();
        setPreviewingId(null);
        return;
      }
      setPreviewingId(voiceId);
      const { volume } = require("../utils/settingsStore").getStoredSettings();
      const init = async () => {
        await Tts.setDefaultLanguage?.("pt-BR");
        await Tts.getInitStatus?.();
      };
      init().then(() => {
        Tts.setDefaultVoice?.(voiceId);
        const opts = Platform.OS === "android"
          ? { androidParams: { KEY_PARAM_VOLUME: volume, KEY_PARAM_STREAM: "STREAM_MUSIC" } }
          : {};
        Tts.speak("Radar a 100 metros", opts);
        setTimeout(() => setPreviewingId(null), 2500);
      });
    } catch {
      setPreviewingId(null);
    }
  };

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

  const handleLogout = () => {
    showConfirm("Sair", "Deseja realmente sair da sua conta?", {
      cancelText: "Cancelar",
      confirmText: "Sair",
      onConfirm: async () => {
        onClose();
        await logout();
      },
    });
  };

  const handleSaveProfile = async () => {
    const name = profileName.trim() || undefined;
    setSaving(true);
    try {
      await updateProfile({ name: name || undefined });
      showAlert("Sucesso", "Perfil atualizado com sucesso");
      closeFullScreen();
    } catch (e) {
      showAlert("Erro", e instanceof Error ? e.message : "Erro ao atualizar perfil");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      showAlert("Erro", "Preencha todos os campos");
      return;
    }
    if (newPassword.length < 6) {
      showAlert("Erro", "A nova senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert("Erro", "A nova senha e a confirmação não coincidem");
      return;
    }
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      showAlert("Sucesso", "Senha alterada com sucesso");
      closeFullScreen();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      showAlert("Erro", e instanceof Error ? e.message : "Erro ao alterar senha");
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

  const openFullScreen = (s: "profile" | "accountSettings" | "soundSettings" | "subscription") => setScreen(s);

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
        {onRefreshRadars && (
          <>
            <Text style={styles.sectionTitle}>Mapa</Text>
            <MenuItem
              icon="radio"
              label="Atualizar lista de radares"
              onPress={() => {
                onClose();
                onRefreshRadars();
              }}
            />
          </>
        )}
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
          icon="diamond"
          label="Assinatura Premium"
          onPress={() => openFullScreen("subscription")}
          right={
            isSubscribed ? (
              <View style={styles.premiumBadge}>
                <Text style={styles.premiumBadgeText}>PRO</Text>
              </View>
            ) : isInFreePeriod && freePeriodEndsAt ? (
              <View style={styles.freeBadge}>
                <Text style={styles.premiumBadgeText}>Grátis</Text>
              </View>
            ) : null
          }
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
        Uma só voz para alertas e navegação (pt-BR). Toque em Ouvir para pré-visualizar.
      </Text>
      <View style={styles.voiceRow}>
        <View style={[styles.voiceCard, ttsVoiceId === MALE_VOICE_ID && styles.voiceCardSelected]}>
          <Pressable
            style={styles.voiceCardTouchable}
            onPress={() => pickVoice(MALE_VOICE_ID)}
            android_ripple={{ color: "rgba(255,193,7,0.3)" }}
          >
            <Ionicons
              name={ttsVoiceId === MALE_VOICE_ID ? "checkmark-circle" : "ellipse-outline"}
              size={24}
              color={ttsVoiceId === MALE_VOICE_ID ? colors.primary : colors.textSecondary}
            />
            <View style={styles.voiceCardContent}>
              <Ionicons name="male" size={28} color={colors.primaryDark} />
              <Text style={styles.voiceOptionText}>Masculina</Text>
            </View>
          </Pressable>
          <Pressable
            style={[styles.previewBtn, (previewingId !== null && previewingId !== MALE_VOICE_ID) && styles.previewBtnDisabled]}
            onPress={() => previewVoiceById(MALE_VOICE_ID)}
            disabled={previewingId !== null && previewingId !== MALE_VOICE_ID}
          >
            <Ionicons name={previewingId === MALE_VOICE_ID ? "stop" : "play"} size={18} color={colors.text} />
            <Text style={styles.previewBtnText}>{previewingId === MALE_VOICE_ID ? "Parar" : "Ouvir"}</Text>
          </Pressable>
        </View>
        <View style={[styles.voiceCard, ttsVoiceId === FEMALE_VOICE_ID && styles.voiceCardSelected]}>
          <Pressable
            style={styles.voiceCardTouchable}
            onPress={() => pickVoice(FEMALE_VOICE_ID)}
            android_ripple={{ color: "rgba(255,193,7,0.3)" }}
          >
            <Ionicons
              name={ttsVoiceId === FEMALE_VOICE_ID ? "checkmark-circle" : "ellipse-outline"}
              size={24}
              color={ttsVoiceId === FEMALE_VOICE_ID ? colors.primary : colors.textSecondary}
            />
            <View style={styles.voiceCardContent}>
              <Ionicons name="female" size={28} color={colors.warning} />
              <Text style={styles.voiceOptionText}>Feminina</Text>
            </View>
          </Pressable>
          <Pressable
            style={[styles.previewBtn, (previewingId !== null && previewingId !== FEMALE_VOICE_ID) && styles.previewBtnDisabled]}
            onPress={() => previewVoiceById(FEMALE_VOICE_ID)}
            disabled={previewingId !== null && previewingId !== FEMALE_VOICE_ID}
          >
            <Ionicons name={previewingId === FEMALE_VOICE_ID ? "stop" : "play"} size={18} color={colors.text} />
            <Text style={styles.previewBtnText}>{previewingId === FEMALE_VOICE_ID ? "Parar" : "Ouvir"}</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );

  const handlePurchase = async () => {
    setIapMessage(null);
    setIapActionLoading(true);
    try {
      const result = await purchaseSubscription();
      if (result.success) {
        setIapMessage({ type: "success", text: "Assinatura ativada com sucesso!" });
      } else {
        setIapMessage({ type: "error", text: result.error || "Erro ao assinar" });
      }
    } finally {
      setIapActionLoading(false);
    }
  };

  const handleRestore = async () => {
    setIapMessage(null);
    setIapActionLoading(true);
    try {
      const result = await restorePurchases();
      if (result.success) {
        setIapMessage({
          type: isSubscribed ? "success" : "error",
          text: isSubscribed ? "Assinatura restaurada com sucesso!" : "Nenhuma assinatura encontrada para esta conta.",
        });
      } else {
        setIapMessage({ type: "error", text: result.error || "Erro ao restaurar" });
      }
    } finally {
      setIapActionLoading(false);
    }
  };

  const formatFreePeriodEnd = (ts: number) => {
    try {
      return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return "";
    }
  };

  const renderSubscriptionContent = () => (
    <ScrollView style={styles.fullScreenScroll} showsVerticalScrollIndicator={false}>
      {isInFreePeriod && freePeriodEndsAt && !isSubscribed && (
        <View style={styles.freePeriodBanner}>
          <Ionicons name="gift" size={22} color={colors.primary} />
          <Text style={styles.freePeriodBannerText}>
            Plano grátis ativo até {formatFreePeriodEnd(freePeriodEndsAt)}. Depois assine PRO para continuar sem anúncios.
          </Text>
        </View>
      )}
      <View style={styles.subscriptionCard}>
        <Ionicons name="diamond" size={48} color={colors.primary} />
        <Text style={styles.subscriptionTitle}>RadarZone PRO</Text>
        <Text style={styles.subscriptionDesc}>
          Sem anúncios, acesso completo a alertas de radares, navegação com voz e atualizações. Cancele quando quiser.
        </Text>
        <View style={styles.subscriptionPriceRow}>
          <Text style={styles.subscriptionPriceIntro}>R$ 9,90/mês</Text>
          <Text style={styles.subscriptionPriceSub}>nos 3 primeiros meses</Text>
          <Text style={styles.subscriptionPriceStandard}>depois R$ 14,90/mês</Text>
        </View>
        {isSubscribed ? (
          <View style={styles.subscriptionStatusActive}>
            <Ionicons name="checkmark-circle" size={24} color={colors.success} />
            <Text style={styles.subscriptionStatusText}>Sua assinatura PRO está ativa</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.primaryButton, iapActionLoading && styles.buttonDisabled]}
              onPress={handlePurchase}
              disabled={iapActionLoading}
            >
              {iapActionLoading ? (
                <ActivityIndicator color={colors.textDark} size="small" />
              ) : (
                <Text style={[styles.primaryButtonText, { padding: 8 }]}>Assinar PRO — R$ 9,90/mês (3 meses)</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestore}
              disabled={iapActionLoading}
            >
              <Text style={styles.restoreButtonText}>Restaurar compras</Text>
            </TouchableOpacity>
          </>
        )}
        {iapMessage && (
          <View style={[styles.iapMessage, iapMessage.type === "error" && styles.iapMessageError]}>
            <Ionicons
              name={iapMessage.type === "success" ? "checkmark-circle" : "alert-circle"}
              size={20}
              color={iapMessage.type === "success" ? colors.success : colors.error}
            />
            <Text style={[styles.iapMessageText, iapMessage.type === "error" && styles.iapMessageTextError]}>
              {iapMessage.text}
            </Text>
          </View>
        )}
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
    <>
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
                  : screen === "subscription"
                    ? "Assinatura"
                    : "Configurações da conta"}
            </Text>
          </View>
            {screen === "profile" && renderProfileContent()}
            {screen === "accountSettings" && renderAccountSettingsContent()}
            {screen === "soundSettings" && renderSoundSettingsContent()}
            {screen === "subscription" && renderSubscriptionContent()}
          </SafeAreaView>
        </View>
      )}
    </Modal>
    <AppModal
      visible={appModal.visible}
      title={appModal.title}
      message={appModal.message}
      buttons={appModal.buttons}
      onRequestClose={() => setAppModal((s) => ({ ...s, visible: false }))}
    />
    </>
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
    color: colors.textDark,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  premiumBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  premiumBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  freeBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  freePeriodBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255, 193, 7, 0.15)",
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  freePeriodBannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
  },
  subscriptionCard: {
    backgroundColor: colors.backgroundCardSecondary,
    borderRadius: 16,
    padding: 24,
    marginTop: 8,
    alignItems: "center",
  },
  subscriptionTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    marginTop: 16,
  },
  subscriptionDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
  subscriptionPriceRow: {
    marginTop: 20,
    alignItems: "center",
  },
  subscriptionPrice: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.primary,
  },
  subscriptionPriceIntro: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.primary,
  },
  subscriptionPriceSub: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  subscriptionPriceStandard: {
    fontSize: 15,
    color: colors.text,
    marginTop: 8,
    fontWeight: "600",
  },
  subscriptionStatusActive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    borderRadius: 12,
  },
  subscriptionStatusText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.success,
  },
  restoreButton: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  restoreButtonText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  iapMessage: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    padding: 12,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    borderRadius: 12,
  },
  iapMessageError: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
  },
  iapMessageText: {
    fontSize: 14,
    color: colors.success,
    flex: 1,
  },
  iapMessageTextError: {
    color: colors.error,
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

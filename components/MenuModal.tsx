import React, { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  Switch,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";

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
  const { user, logout } = useAuth();
  const {
    soundEnabled,
    setSoundEnabled,
    volume,
    setVolume,
    mapVoiceEnabled,
    setMapVoiceEnabled,
  } = useSettings();

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
    onClose();
    await logout();
  };

  const backdropOpacity = backdropAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });

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
          <View style={styles.header}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.userName}>{user?.name || "Usuário"}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
          </View>

          <View style={styles.menu}>
            <Text style={styles.sectionTitle}>Configurações</Text>
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
            <MenuItem icon="person" label="Perfil" onPress={onClose} />
            <MenuItem icon="settings" label="Configurações da conta" onPress={onClose} />
            <MenuItem
              icon="log-out"
              label="Sair"
              onPress={handleLogout}
            />
          </View>
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
});

import React, { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { colors } from "../utils/theme";

export type AppModalButton = {
  text: string;
  onPress: () => void;
  style?: "cancel" | "default" | "destructive";
};

export interface AppModalProps {
  visible: boolean;
  title: string;
  message: string;
  buttons: AppModalButton[];
  onRequestClose?: () => void;
}

/**
 * Modal personalizado que substitui Alert.alert.
 * Use com um único botão (ex.: "OK") ou dois (ex.: "Cancelar" e "Sair").
 */
export function AppModal({
  visible,
  title,
  message,
  buttons,
  onRequestClose,
}: AppModalProps) {
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
      ]).start();
    } else {
      backdropAnim.setValue(0);
      scaleAnim.setValue(0.9);
    }
  }, [visible, backdropAnim, scaleAnim]);

  const handleRequestClose = () => {
    onRequestClose?.();
  };

  const getButtonStyle = (style?: AppModalButton["style"]) => {
    switch (style) {
      case "cancel":
        return [styles.button, styles.buttonCancel];
      case "destructive":
        return [styles.button, styles.buttonDestructive];
      default:
        return [styles.button, styles.buttonDefault];
    }
  };

  const getButtonTextStyle = (style?: AppModalButton["style"]) => {
    switch (style) {
      case "cancel":
        return styles.buttonTextCancel;
      case "destructive":
        return styles.buttonTextDestructive;
      default:
        return styles.buttonTextDefault;
    }
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={handleRequestClose}
      animationType="none"
      statusBarTranslucent
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={handleRequestClose}>
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: backdropAnim,
            },
          ]}
        />
      </Pressable>
      <View style={styles.centered} pointerEvents="box-none">
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Animated.View
            style={[
              styles.card,
              {
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>
            <View
              style={
                buttons.length > 1
                  ? styles.buttonsRow
                  : styles.buttonsRowSingle
              }
            >
              {buttons.map((btn, i) => (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.8}
                  style={getButtonStyle(btn.style)}
                  onPress={() => btn.onPress()}
                >
                  <Text style={getButtonTextStyle(btn.style)}>{btn.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: 24,
    minWidth: 280,
    maxWidth: 340,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 12,
    textAlign: "center",
  },
  message: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 24,
    textAlign: "center",
    lineHeight: 22,
  },
  buttonsRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "stretch",
  },
  buttonsRowSingle: {
    flexDirection: "row",
    justifyContent: "center",
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonCancel: {
    backgroundColor: colors.backgroundCardSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonDefault: {
    backgroundColor: colors.primary,
    minHeight: 48,
  },
  buttonDestructive: {
    backgroundColor: colors.error,
  },
  buttonTextCancel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  buttonTextDefault: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111111",
  },
  buttonTextDestructive: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
});

import React from "react";
import {
  Dimensions,
  Image,
  ImageSourcePropType,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

const ICON_SIZE = 33;

/**
 * Overlay escuro em toda a tela.
 * Camada acima: somente o ícone do radar selecionado (destacado no centro).
 */
export function VignetteOverlay({
  onPress,
  centerX,
  centerY,
  radarIconSource,
}: {
  onPress: () => void;
  centerX?: number | null;
  centerY?: number | null;
  radarIconSource?: ImageSourcePropType | null;
}) {
  const { width, height } = Dimensions.get("window");
  const cx = centerX ?? width / 2;
  const cy = centerY ?? height / 2;
  const half = ICON_SIZE / 2;
  const showRadar = !!radarIconSource;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={onPress}
      />
      {/* Camada escura (cobre tudo) */}
      <View style={styles.darkLayer} pointerEvents="none" />
      {/* Camada acima: somente o radar selecionado destacado */}
      {showRadar && (
        <View
          style={[
            styles.radarLayer,
            {
              left: cx - half,
              top: cy - half,
              width: ICON_SIZE,
              height: ICON_SIZE,
            },
          ]}
          pointerEvents="none"
        >
         <Image source={radarIconSource} style={styles.radarIcon} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  darkLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  radarLayer: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 40,
    // Brilho sutil no Android
    elevation: 12,
    shadowColor: "#fff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,

  },
  radarIcon: {
    width: 80,
    height: 80,
  },
});

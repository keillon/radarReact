import React from "react";
import {
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

const HOLE_SIZE = 104; // Largura/altura do foco (~2x raio) — apenas em volta do ícone do radar

/** Overlay vignette: escurece tudo exceto o centro (foco em volta do radar). Usa Views nativas, sem react-native-svg. */
export function VignetteOverlay({
  onPress,
  centerX,
  centerY,
  size = HOLE_SIZE,
}: {
  onPress: () => void;
  /** Posição X do foco (pixels). Se null, usa centro da tela */
  centerX?: number | null;
  /** Posição Y do foco (pixels). Se null, usa centro da tela */
  centerY?: number | null;
  /** Lado do quadrado do foco */
  size?: number;
}) {
  const { width, height } = Dimensions.get("window");
  const cx = centerX ?? width / 2;
  const cy = centerY ?? height / 2;
  const half = size / 2;
  const left = Math.max(0, cx - half);
  const top = Math.max(0, cy - half);
  const holeTop = top;
  const holeBottom = Math.min(height, cy + half);
  const holeLeft = left;
  const holeRight = Math.min(width, cx + half);

  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        { zIndex: 999, elevation: 999 },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={onPress}
      />
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {/* Topo */}
        <View style={[styles.bar, { height: holeTop, top: 0, left: 0, right: 0 }]} />
        {/* Fundo */}
        <View style={[styles.bar, { height: height - holeBottom, bottom: 0, left: 0, right: 0 }]} />
        {/* Esquerda */}
        <View style={[styles.bar, { width: holeLeft, left: 0, top: holeTop, height: holeBottom - holeTop }]} />
        {/* Direita */}
        <View style={[styles.bar, { width: width - holeRight, right: 0, top: holeTop, height: holeBottom - holeTop }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
});

import React from "react";
import {
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

const HOLE_SIZE = 112; // Quadrado ~56px de cada lado do centro = radar destacado

/**
 * Tudo escuro em volta, radar destacado no centro.
 * 4 barras formam um quadrado limpo — sem borderRadius (evita artefatos).
 * Funciona sem deps nativas extras.
 */
export function VignetteOverlay({
  onPress,
  centerX,
  centerY,
  size = HOLE_SIZE,
}: {
  onPress: () => void;
  centerX?: number | null;
  centerY?: number | null;
  size?: number;
}) {
  const { width, height } = Dimensions.get("window");
  const cx = centerX ?? width / 2;
  const cy = centerY ?? height / 2;
  const half = size / 2;

  const t = Math.max(0, cy - half);
  const b = Math.min(height, cy + half);
  const l = Math.max(0, cx - half);
  const rr = Math.min(width, cx + half);

  const fill = { backgroundColor: "rgba(0,0,0,0.62)" as const };

  return (
    <View
      style={[StyleSheet.absoluteFillObject, { zIndex: 999, elevation: 999 }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={onPress}
      />
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <View style={[s.bar, fill, { height: t, top: 0, left: 0, right: 0 }]} />
        <View style={[s.bar, fill, { height: height - b, bottom: 0, left: 0, right: 0 }]} />
        <View style={[s.bar, fill, { width: l, left: 0, top: t, height: b - t }]} />
        <View style={[s.bar, fill, { width: width - rr, right: 0, top: t, height: b - t }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { position: "absolute" as const },
});

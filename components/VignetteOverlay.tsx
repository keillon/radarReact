import React from "react";
import {
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

const HOLE_RADIUS = 52;

/**
 * Overlay estilo Waze: tela escura com círculo em volta do radar.
 * 4 barras nativas + borderRadius nos cantos internos = círculo.
 * Sem dependências nativas extras (react-native-svg, masked-view).
 */
export function VignetteOverlay({
  onPress,
  centerX,
  centerY,
  radius = HOLE_RADIUS,
}: {
  onPress: () => void;
  centerX?: number | null;
  centerY?: number | null;
  radius?: number;
}) {
  const { width, height } = Dimensions.get("window");
  const cx = centerX ?? width / 2;
  const cy = centerY ?? height / 2;
  const r = radius;

  const t = Math.max(0, cy - r);
  const b = Math.min(height, cy + r);
  const l = Math.max(0, cx - r);
  const rr = Math.min(width, cx + r);

  const fill = { backgroundColor: "rgba(0,0,0,0.55)" as const };

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
        <View style={[s.bar, fill, { height: t, top: 0, left: 0, right: 0, borderBottomLeftRadius: r, borderBottomRightRadius: r }]} />
        <View style={[s.bar, fill, { height: height - b, bottom: 0, left: 0, right: 0, borderTopLeftRadius: r, borderTopRightRadius: r }]} />
        <View style={[s.bar, fill, { width: l, left: 0, top: t, height: b - t, borderTopRightRadius: r, borderBottomRightRadius: r }]} />
        <View style={[s.bar, fill, { width: width - rr, right: 0, top: t, height: b - t, borderTopLeftRadius: r, borderBottomLeftRadius: r }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { position: "absolute" as const },
});

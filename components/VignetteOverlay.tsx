import React from "react";
import {
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

const HOLE_RADIUS = 52;

/**
 * Overlay com foco REDONDO em volta do radar.
 * Usa 4 barras com borderRadius nos cantos internos para formar um círculo — sem react-native-svg.
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

  const holeTop = Math.max(0, cy - r);
  const holeBottom = Math.min(height, cy + r);
  const holeLeft = Math.max(0, cx - r);
  const holeRight = Math.min(width, cx + r);

  const barStyle = { backgroundColor: "rgba(0,0,0,0.55)" as const };

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
        {/* Topo — bordas inferiores arredondadas (parte superior do círculo) */}
        <View
          style={[
            styles.bar,
            barStyle,
            {
              height: holeTop,
              top: 0,
              left: 0,
              right: 0,
              borderBottomLeftRadius: r,
              borderBottomRightRadius: r,
            },
          ]}
        />
        {/* Fundo — bordas superiores arredondadas */}
        <View
          style={[
            styles.bar,
            barStyle,
            {
              height: height - holeBottom,
              bottom: 0,
              left: 0,
              right: 0,
              borderTopLeftRadius: r,
              borderTopRightRadius: r,
            },
          ]}
        />
        {/* Esquerda — bordas direitas arredondadas */}
        <View
          style={[
            styles.bar,
            barStyle,
            {
              width: holeLeft,
              left: 0,
              top: holeTop,
              height: holeBottom - holeTop,
              borderTopRightRadius: r,
              borderBottomRightRadius: r,
            },
          ]}
        />
        {/* Direita — bordas esquerdas arredondadas */}
        <View
          style={[
            styles.bar,
            barStyle,
            {
              width: width - holeRight,
              right: 0,
              top: holeTop,
              height: holeBottom - holeTop,
              borderTopLeftRadius: r,
              borderBottomLeftRadius: r,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
  },
});

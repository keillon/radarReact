import React from "react";
import {
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Defs, Mask, Rect, Circle } from "react-native-svg";

const HOLE_RADIUS = 56;

/**
 * Círculo perfeito em volta do radar — usa react-native-svg.
 * IMPORTANTE: após instalar, rode: npx react-native run-android
 * (rebuild nativo obrigatório para RNSVGRect)
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
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <Mask id="hole">
              <Rect x={0} y={0} width={width} height={height} fill="white" />
              <Circle cx={cx} cy={cy} r={radius} fill="black" />
            </Mask>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="rgba(0,0,0,0.62)"
            mask="url(#hole)"
          />
        </Svg>
      </View>
    </View>
  );
}

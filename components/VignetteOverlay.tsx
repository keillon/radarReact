import React from "react";
import {
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Defs, Mask, Rect, Circle } from "react-native-svg";

const HOLE_RADIUS = 52; // Tamanho do foco circular — apenas em volta do ícone do radar

/** Overlay vignette: escurece tudo exceto um círculo em volta do radar */
export function VignetteOverlay({
  onPress,
  centerX,
  centerY,
  radius = HOLE_RADIUS,
}: {
  onPress: () => void;
  /** Posição X do foco (pixels). Se null, usa centro da tela */
  centerX?: number | null;
  /** Posição Y do foco (pixels). Se null, usa centro da tela */
  centerY?: number | null;
  radius?: number;
}) {
  const { width, height } = Dimensions.get("window");
  const cx = centerX ?? width / 2;
  const cy = centerY ?? height / 2;

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
        <Svg
          width={width}
          height={height}
          style={StyleSheet.absoluteFill}
        >
          <Defs>
            {/* Máscara: branco = overlay visível, preto = buraco (transparente) */}
            <Mask id="hole">
              <Rect
                x={0}
                y={0}
                width={width}
                height={height}
                fill="white"
              />
              <Circle
                cx={cx}
                cy={cy}
                r={radius}
                fill="black"
              />
            </Mask>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="rgba(0,0,0,0.55)"
            mask="url(#hole)"
          />
        </Svg>
      </View>
    </View>
  );
}

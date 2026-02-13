import React from "react";
import {
  Dimensions,
  Image,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";

const HOLE_RADIUS = 52;

/**
 * Overlay estilo Waze: tela escura com UM CÍRCULO em volta do radar.
 * Máscara PNG: branco com círculo transparente = spotlight perfeito.
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

  // Máscara 512x512, círculo r=10 no centro → escalar para radius no ecrã
  const scale = radius / 10;
  const maskSize = 512 * scale;

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
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <Image
            source={require("../assets/images/vignetteMask.png")}
            style={{
              position: "absolute",
              width: maskSize,
              height: maskSize,
              left: cx - maskSize / 2,
              top: cy - maskSize / 2,
            }}
            resizeMode="stretch"
          />
        }
      >
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: "rgba(0,0,0,0.55)" },
          ]}
        />
      </MaskedView>
    </View>
  );
}

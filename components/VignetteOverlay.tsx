import React from "react";
import {
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

/** Overlay vignette: escurece as bordas, centro livre (radar destacado) */
export function VignetteOverlay({ onPress }: { onPress: () => void }) {
  const { width, height } = Dimensions.get("window");
  const edge = Math.min(width, height) * 0.32;
  const topBottomH = edge;
  const leftRightW = edge;
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
        <View style={[styles.vignetteBar, { height: topBottomH, top: 0, left: 0, right: 0 }]} />
        <View style={[styles.vignetteBar, { height: topBottomH, bottom: 0, left: 0, right: 0 }]} />
        <View style={[styles.vignetteBar, { width: leftRightW, left: 0, top: topBottomH, bottom: topBottomH }]} />
        <View style={[styles.vignetteBar, { width: leftRightW, right: 0, top: topBottomH, bottom: topBottomH }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  vignetteBar: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
});

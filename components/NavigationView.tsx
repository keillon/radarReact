import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { NavigationStep } from "../services/mapbox";

interface NavigationViewProps {
  currentStep: NavigationStep | null;
  onStop: () => void;
  totalDistance?: number;
  totalDuration?: number;
}

// Função para obter o ícone/seta baseado no tipo de manobra
const getManeuverIcon = (maneuverType: string, modifier?: string): string => {
  switch (maneuverType) {
    case "turn":
      switch (modifier) {
        case "left":
          return "↰"; // Seta esquerda
        case "right":
          return "↱"; // Seta direita
        case "sharp left":
          return "↫";
        case "sharp right":
          return "↬";
        case "slight left":
          return "↖";
        case "slight right":
          return "↗";
        default:
          return "→";
      }
    case "merge":
      return "⇄";
    case "depart":
      return "▶";
    case "arrive":
      return "✓";
    case "continue":
      return "→";
    case "roundabout":
      return "⟲";
    case "exit roundabout":
      return "⟳";
    case "fork":
      return "⇉";
    case "end of road":
      return "═";
    default:
      return "→";
  }
};

export default function NavigationView({
  currentStep,
  onStop,
  totalDistance,
  totalDuration,
}: NavigationViewProps) {
  if (!currentStep) return null;

  const icon = getManeuverIcon(
    currentStep.maneuver.type,
    currentStep.maneuver.modifier
  );
  const instruction =
    currentStep.instruction || currentStep.maneuver.instruction || "";
  const distance = currentStep.distance;
  const distanceText =
    distance > 1000
      ? `${(distance / 1000).toFixed(1)} km`
      : `${Math.round(distance)} m`;

  // Calcular tempo estimado
  const durationMinutes = Math.round((currentStep.duration || 0) / 60);
  const durationText =
    durationMinutes > 0 ? `${durationMinutes} min` : "Poucos segundos";

  return (
    <View style={styles.container}>
      {/* Header com botão de parar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.stopButton} onPress={onStop}>
          <Text style={styles.stopButtonText}>✕ Parar</Text>
        </TouchableOpacity>
        {totalDistance && (
          <View style={styles.routeInfo}>
            <Text style={styles.routeInfoText}>
              {totalDistance > 1000
                ? `${(totalDistance / 1000).toFixed(1)} km`
                : `${Math.round(totalDistance)} m`}
            </Text>
          </View>
        )}
      </View>

      {/* Instrução principal */}
      <View style={styles.instructionContainer}>
        <View style={styles.iconContainer}>
          <Text style={styles.maneuverIcon}>{icon}</Text>
        </View>
        <View style={styles.instructionTextContainer}>
          <Text style={styles.instructionText}>{instruction}</Text>
          <View style={styles.distanceContainer}>
            <Text style={styles.distanceText}>{distanceText}</Text>
            <Text style={styles.durationText}> • {durationText}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1f2937",
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 16,
    zIndex: 1000,
    borderBottomWidth: 2,
    borderBottomColor: "#3b82f6",
    pointerEvents: "box-none",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    pointerEvents: "auto",
  },
  stopButton: {
    backgroundColor: "#dc2626",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  stopButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  routeInfo: {
    backgroundColor: "#374151",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  routeInfoText: {
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: "500",
  },
  instructionContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111827",
    padding: 16,
    borderRadius: 12,
    pointerEvents: "auto",
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#3b82f6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  maneuverIcon: {
    fontSize: 32,
    color: "#fff",
  },
  instructionTextContainer: {
    flex: 1,
  },
  instructionText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  distanceContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  distanceText: {
    color: "#60a5fa",
    fontSize: 16,
    fontWeight: "600",
  },
  durationText: {
    color: "#9ca3af",
    fontSize: 14,
  },
});


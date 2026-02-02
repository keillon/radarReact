import Mapbox, {
  Camera,
  Images,
  MapView,
  ShapeSource,
  SymbolLayer,
} from "@rnmapbox/maps";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Radar } from "../services/api";
import { MAPBOX_TOKEN } from "../services/mapbox";

Mapbox.setAccessToken(MAPBOX_TOKEN);

/** Mapeia tipo do CSV/API para ícone (igual admin e Map.tsx). */
function getRadarIconName(radar: Radar): string {
  const type = radar?.type;
  if (!type) return "radar";
  const t = String(type).trim().toLowerCase().normalize("NFD").replace(/\u0300/g, "");
  if (t.includes("semaforo") && t.includes("camera")) return "radarSemaforico";
  if (t.includes("semaforo") && t.includes("radar")) return "radarSemaforico";
  if (t.includes("radar") && t.includes("fixo")) return "radarFixo";
  if (t.includes("radar") && (t.includes("movel") || t.includes("móvel"))) return "radarMovel";
  return "radar";
}

const radarImages = {
  radar: require("../assets/images/radar.png"),
  radarFixo: require("../assets/images/radarFixo.png"),
  radarMovel: require("../assets/images/radarMovel.png"),
  radarSemaforico: require("../assets/images/radarSemaforico.png"),
};

const ICON_SIZE = 0.2;

interface RadarOverlayProps {
  radars: Radar[];
  currentLocation: { latitude: number; longitude: number } | null;
}

/**
 * Componente overlay que renderiza radares sobre o MapboxNavigation
 * Usa os mesmos ícones por tipo (radar, radarFixo, radarMovel, radarSemaforico).
 */
export default function RadarOverlay({
  radars,
  currentLocation,
}: RadarOverlayProps) {
  const cameraRef = useRef<Camera>(null);
  const [mapReady, setMapReady] = useState(false);

  const radarsGeoJSON = {
    type: "FeatureCollection" as const,
    features: radars.map((radar) => ({
      type: "Feature" as const,
      id: radar.id,
      geometry: {
        type: "Point" as const,
        coordinates: [radar.longitude, radar.latitude],
      },
      properties: {
        id: radar.id,
        type: radar.type || "default",
        iconImage: getRadarIconName(radar),
      },
    })),
  };

  // Sincronizar câmera com a localização atual
  useEffect(() => {
    if (currentLocation && cameraRef.current && mapReady) {
      // Atualizar câmera para seguir a localização durante navegação
      cameraRef.current.setCamera({
        centerCoordinate: [currentLocation.longitude, currentLocation.latitude],
        zoomLevel: 16,
        animationDuration: 0, // Sem animação para sincronização perfeita
      });
    }
  }, [currentLocation, mapReady]);

  if (radars.length === 0) {
    return null; // Não renderizar se não houver radares
  }

  return (
    <View style={styles.overlay} pointerEvents="none">
      <MapView
        style={styles.map}
        styleURL={Mapbox.StyleURL.Street}
        logoEnabled={false}
        attributionEnabled={false}
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        onDidFinishLoadingMap={() => setMapReady(true)}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: currentLocation
              ? [currentLocation.longitude, currentLocation.latitude]
              : [-46.6333, -23.5505],
            zoomLevel: 16,
          }}
          followUserLocation={false}
        />

        <Images images={radarImages} />
        <ShapeSource id="radars-overlay" shape={radarsGeoJSON}>
          <SymbolLayer
            id="radars-overlay-icons"
            style={{
              iconImage: ["coalesce", ["get", "iconImage"], "radar"],
              iconSize: ICON_SIZE,
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
            }}
          />
        </ShapeSource>
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    backgroundColor: "transparent",
  },
  map: {
    flex: 1,
    backgroundColor: "transparent",
  },
});

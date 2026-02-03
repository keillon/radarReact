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

const PLACA_SPEEDS = [
  20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160,
];
function getClosestPlacaName(speed: number | undefined): string {
  if (speed == null || speed <= 0) return "placa60";
  const closest = PLACA_SPEEDS.reduce((a, b) =>
    Math.abs(a - speed) <= Math.abs(b - speed) ? a : b
  );
  return `placa${closest}`;
}

/** Ícone no mapa: fixo usa placa por velocidade; demais por tipo. */
function getRadarIconForMap(radar: Radar): string {
  const type = radar?.type;
  if (!type) return "radar";
  const t = String(type)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (t.includes("radar") && t.includes("fixo"))
    return getClosestPlacaName(radar.speedLimit);
  if (t.includes("semaforo") && t.includes("camera")) return "radarSemaforico";
  if (t.includes("semaforo") && t.includes("radar")) return "radarSemaforico";
  if (t.includes("radar") && t.includes("movel")) return "radarMovel";
  return "radar";
}

/** Tamanhos de ícone por tipo (ajuste aqui para mudar no overlay de navegação). */
const RADAR_ICON_SIZES: Record<string, number> = {
  radar: 0.2,
  radarMovel: 0.2,
  radarSemaforico: 0.22,
  radarFixo: 0.24,
  placa: 0.24,
};
function getIconSizeForIcon(iconImage: string): number {
  if (iconImage.startsWith("placa")) return RADAR_ICON_SIZES.placa ?? 0.24;
  return RADAR_ICON_SIZES[iconImage] ?? RADAR_ICON_SIZES.radar ?? 0.2;
}

const radarImages = {
  radar: require("../assets/images/radar.png"),
  radarFixo: require("../assets/images/radarFixo.png"),
  radarMovel: require("../assets/images/radarMovel.png"),
  radarSemaforico: require("../assets/images/radarSemaforico.png"),
  placa20: require("../assets/images/placa20.png"),
  placa30: require("../assets/images/placa30.png"),
  placa40: require("../assets/images/placa40.png"),
  placa50: require("../assets/images/placa50.png"),
  placa60: require("../assets/images/placa60.png"),
  placa70: require("../assets/images/placa70.png"),
  placa80: require("../assets/images/placa80.png"),
  placa90: require("../assets/images/placa90.png"),
  placa100: require("../assets/images/placa100.png"),
  placa110: require("../assets/images/placa110.png"),
  placa120: require("../assets/images/placa120.png"),
  placa130: require("../assets/images/placa130.png"),
  placa140: require("../assets/images/placa140.png"),
  placa150: require("../assets/images/placa150.png"),
  placa160: require("../assets/images/placa160.png"),
};

const DEFAULT_ICON_SIZE = 0.2;

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
        iconImage: getRadarIconForMap(radar),
        iconSize: getIconSizeForIcon(getRadarIconForMap(radar)),
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
              iconSize: ["coalesce", ["get", "iconSize"], DEFAULT_ICON_SIZE],
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

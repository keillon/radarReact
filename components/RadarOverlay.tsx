import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import Mapbox, {
  MapView,
  Camera,
  ShapeSource,
  CircleLayer,
} from "@rnmapbox/maps";
import { Radar } from "../services/api";
import { MAPBOX_TOKEN } from "../services/mapbox";

Mapbox.setAccessToken(MAPBOX_TOKEN);

interface RadarOverlayProps {
  radars: Radar[];
  currentLocation: { latitude: number; longitude: number } | null;
}

/**
 * Componente overlay que renderiza radares sobre o MapboxNavigation
 * Usa um MapView transparente e não interativo apenas para visualização
 */
export default function RadarOverlay({
  radars,
  currentLocation,
}: RadarOverlayProps) {
  const cameraRef = useRef<Camera>(null);
  const [mapReady, setMapReady] = useState(false);

  // Criar GeoJSON para radares
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
        speedLimit: radar.speedLimit || null,
        type: radar.type || "default",
      },
    })),
  };

  // Sincronizar câmera com a localização atual
  useEffect(() => {
    if (currentLocation && cameraRef.current && mapReady) {
      // Atualizar câmera para seguir a localização durante navegação
      cameraRef.current.setCamera({
        centerCoordinate: [
          currentLocation.longitude,
          currentLocation.latitude,
        ],
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

        {/* Renderizar radares */}
        <ShapeSource id="radars-overlay" shape={radarsGeoJSON}>
          <CircleLayer
            id="radars-circles"
            style={{
              circleColor: "#dc2626", // Vermelho para radares
              circleRadius: 8,
              circleStrokeWidth: 2,
              circleStrokeColor: "#ffffff",
              circlePitchScale: "map",
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


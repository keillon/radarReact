import Mapbox, {
  Camera,
  CircleLayer,
  Images,
  LineLayer,
  MapView,
  ShapeSource,
  SymbolLayer,
  UserLocation,
  UserTrackingMode,
} from "@rnmapbox/maps";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Radar } from "../services/api";
import { MAPBOX_TOKEN, NavigationStep, RouteFeature } from "../services/mapbox";

Mapbox.setAccessToken(MAPBOX_TOKEN);

interface MapProps {
  radars: Radar[];
  route?: RouteFeature | null;
  onRadarPress?: (radar: Radar) => void;
  /** Chamado quando o usuário toca no mapa (fora de um radar). Coordenadas do toque. */
  onMapPress?: (coords: { latitude: number; longitude: number }) => void;
  isNavigating?: boolean;
  currentLocation?: { latitude: number; longitude: number } | null;
  currentStep?: NavigationStep | null;
  interactive?: boolean; // Se false, desativa interação do mapa (útil para overlay)
  nearbyRadarIds?: Set<string>; // IDs dos radares próximos para animação pulsante
}

export default function Map({
  radars,
  route,
  onRadarPress,
  onMapPress,
  isNavigating = false,
  currentLocation,
  currentStep,
  interactive = true,
  nearbyRadarIds = new Set(),
}: MapProps) {
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const cameraRef = useRef<any>(null);
  const pulseAnimation = useRef(new Animated.Value(1)).current;

  // Animação de pulso para radares próximos
  useEffect(() => {
    if (nearbyRadarIds.size > 0) {
      // Criar loop de animação de pulso
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnimation, {
            toValue: 1.5,
            duration: 1000,
            useNativeDriver: false, // Não pode usar native driver para propriedades do Mapbox
          }),
          Animated.timing(pulseAnimation, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: false,
          }),
        ]),
      ).start();
    } else {
      pulseAnimation.setValue(1);
    }
  }, [nearbyRadarIds.size]);

  // Atualizar userLocation quando currentLocation mudar
  useEffect(() => {
    if (currentLocation) {
      setUserLocation(currentLocation);
      // Se não é interativo (overlay), atualizar câmera para sincronizar com navegação
      if (!interactive && cameraRef.current) {
        // Usar requestAnimationFrame para evitar atualizações muito frequentes
        const timeoutId = setTimeout(() => {
          if (cameraRef.current) {
            cameraRef.current.setCamera({
              centerCoordinate: [
                currentLocation.longitude,
                currentLocation.latitude,
              ],
              zoomLevel: 16,
              animationDuration: 0, // Sincronização instantânea
            });
          }
        }, 100); // Debounce de 100ms
        return () => clearTimeout(timeoutId);
      }
    }
  }, [currentLocation, interactive]);

  // Focar na localização quando ela for obtida pela primeira vez
  useEffect(() => {
    if (userLocation && cameraRef.current && !isNavigating && !hasInitialized) {
      setTimeout(() => {
        if (cameraRef.current) {
          cameraRef.current.setCamera({
            centerCoordinate: [userLocation.longitude, userLocation.latitude],
            zoomLevel: 14,
            animationDuration: 1000,
          });
          setHasInitialized(true);
        }
      }, 500);
    }
  }, [userLocation, isNavigating, hasInitialized]);

  const focusOnUserLocation = () => {
    if (userLocation && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [userLocation.longitude, userLocation.latitude],
        zoomLevel: 16,
        animationDuration: 500,
      });
    }
  };

  // Função para mapear velocidade para nome da imagem da placa
  const getPlacaImageName = (speedLimit: number | null | undefined): string => {
    if (!speedLimit || speedLimit === 0) return "placa0";

    // Mapear para as velocidades disponíveis (20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160)
    const speeds = [
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160,
    ];

    // Encontrar a velocidade mais próxima disponível
    const closestSpeed = speeds.reduce((prev, curr) =>
      Math.abs(curr - speedLimit) < Math.abs(prev - speedLimit) ? curr : prev,
    );

    return `placa${closestSpeed}`;
  };

  // Objeto com todas as imagens das placas
  const placaImages = {
    placa0: require("../assets/images/placa0.png"),
    placa10: require("../assets/images/placa10.png"),
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
    placa: require("../assets/images/placa0.png"), // Fallback (placa.png não existe)
  };

  // Criar GeoJSON para radares com nome da imagem e propriedade de proximidade
  const radarsGeoJSON = {
    type: "FeatureCollection" as const,
    features: (radars || [])
      .filter(
        (radar) =>
          radar != null &&
          radar.id != null &&
          typeof radar.latitude === "number" &&
          typeof radar.longitude === "number" &&
          !isNaN(radar.latitude) &&
          !isNaN(radar.longitude),
      )
      .map((radar) => ({
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
          iconImage: getPlacaImageName(radar.speedLimit), // Nome da imagem para o ícone
          isNearby: nearbyRadarIds?.has(radar.id) ? 1 : 0, // Flag para animação pulsante
        },
      })),
  };

  // Debug (apenas em desenvolvimento): log de radares recebidos
  useEffect(() => {
    if (!__DEV__) return;
    const validRadars = radars || [];
    if (validRadars.length > 0 && validRadars[0] != null) {
      const firstRadar = validRadars[0];
      if (
        firstRadar.id != null &&
        typeof firstRadar.latitude === "number" &&
        typeof firstRadar.longitude === "number"
      ) {
        console.log(`🗺️ Map: ${validRadars.length} radares para renderizar`);
      }
    }
  }, [radars?.length || 0]);

  return (
    <View style={styles.container} pointerEvents="box-none">
      <MapView
        pointerEvents={interactive ? "auto" : "none"}
        style={styles.map}
        styleURL={Mapbox.StyleURL.Street}
        logoEnabled={false}
        attributionEnabled={false}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        pitchEnabled={interactive}
        rotateEnabled={interactive}
        compassEnabled={interactive}
        compassPosition={{ bottom: 420, right: 20 }}
        scaleBarEnabled={false}
        onPress={(event) => {
          const geometry = event?.geometry as { coordinates?: number[] } | undefined;
          const coords = geometry?.coordinates;
          if (onMapPress && Array.isArray(coords) && coords.length >= 2) {
            const [lng, lat] = coords;
            onMapPress({ latitude: lat, longitude: lng });
          }
        }}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: userLocation
              ? [userLocation.longitude, userLocation.latitude]
              : [-46.6333, -23.5505], // São Paulo como padrão
            zoomLevel: isNavigating ? 16 : 14,
          }}
          followUserLocation={isNavigating && interactive}
          followUserMode={
            isNavigating && interactive
              ? UserTrackingMode.FollowWithCourse
              : undefined
          }
          animationDuration={1000}
        />

        {/* Desabilitar UserLocation quando não é interativo (overlay) para evitar conflitos */}
        {interactive && (
          <UserLocation
            visible={true}
            onUpdate={(location) => {
              if (location?.coords) {
                setUserLocation({
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                });
              }
            }}
          />
        )}

        {/* Camada de rota usando componentes nativos do SDK */}
        {route &&
          route.geometry &&
          route.geometry.coordinates &&
          Array.isArray(route.geometry.coordinates) &&
          route.geometry.coordinates.length > 0 && (
            <ShapeSource id="route" shape={route}>
              <LineLayer
                id="routeLine"
                style={{
                  lineColor: isNavigating ? "#3b82f6" : "#60a5fa",
                  lineWidth: isNavigating ? 6 : 4,
                  lineCap: "round",
                  lineJoin: "round",
                  lineGradient: isNavigating
                    ? [
                        "interpolate",
                        ["linear"],
                        ["line-progress"],
                        0,
                        "#3b82f6",
                        0.5,
                        "#60a5fa",
                        1,
                        "#93c5fd",
                      ]
                    : undefined,
                }}
              />
            </ShapeSource>
          )}

        {/* Marcador de destino */}
        {route &&
          route.geometry &&
          route.geometry.coordinates &&
          Array.isArray(route.geometry.coordinates) &&
          route.geometry.coordinates.length > 0 && (
            <ShapeSource
              id="destination"
              shape={{
                type: "Feature",
                geometry: {
                  type: "Point",
                  coordinates: route.geometry.coordinates[
                    route.geometry.coordinates.length - 1
                  ] || [0, 0],
                },
                properties: {},
              }}
            >
              <CircleLayer
                id="destinationMarker"
                style={{
                  circleColor: "#10b981",
                  circleRadius: 10,
                  circleStrokeWidth: 3,
                  circleStrokeColor: "#fff",
                }}
              />
              <SymbolLayer
                id="destinationLabel"
                style={{
                  textField: "📍",
                  textSize: 20,
                  textOffset: [0, -2],
                }}
              />
            </ShapeSource>
          )}

        {/* Marcador de próxima manobra */}
        {isNavigating &&
          currentStep &&
          currentStep.geometry &&
          Array.isArray(currentStep.geometry.coordinates) &&
          currentStep.geometry.coordinates.length > 0 &&
          currentStep.geometry.coordinates[0] != null && (
            <ShapeSource
              id="nextManeuver"
              shape={{
                type: "Feature",
                geometry: {
                  type: "Point",
                  coordinates: currentStep.geometry.coordinates[0] || [0, 0],
                },
                properties: {},
              }}
            >
              <CircleLayer
                id="maneuverMarker"
                style={{
                  circleColor: "#f59e0b",
                  circleRadius: 12,
                  circleStrokeWidth: 3,
                  circleStrokeColor: "#fff",
                }}
              />
              <SymbolLayer
                id="maneuverArrow"
                style={{
                  textField: "→",
                  textSize: 24,
                  textColor: "#fff",
                  textOffset: [0, 0],
                }}
              />
            </ShapeSource>
          )}

        {/* Adicionar imagens das placas ao mapa - DEVE estar antes do ShapeSource que as usa */}
        <Images
          images={placaImages}
          onImageMissing={(imageId) => {
            console.warn(`⚠️ Imagem faltando no mapa: ${imageId}`);
          }}
        />

        {/* Camada de radares com clustering */}
        {radars &&
          radars.length > 0 &&
          radarsGeoJSON.features &&
          radarsGeoJSON.features.length > 0 && (
            <ShapeSource
              id="radars"
              shape={radarsGeoJSON}
              cluster
              clusterRadius={50}
              clusterMaxZoomLevel={14}
              onPress={(event) => {
                try {
                  console.log("Radar pressionado:", event);
                  if (
                    onRadarPress &&
                    event?.features &&
                    Array.isArray(event.features) &&
                    event.features.length > 0
                  ) {
                    const feature = event.features[0];
                    if (feature != null) {
                      const radarId = feature.properties?.id || feature.id;
                      if (radarId != null && radars != null) {
                        const radar = radars.find(
                          (r) => r != null && r.id === radarId,
                        );
                        if (radar != null) {
                          onRadarPress(radar);
                        }
                      }
                    }
                  }
                } catch (error) {
                  console.error("Erro ao processar press do radar:", error);
                }
              }}
            >
              {/* Clusters */}
              <CircleLayer
                id="radarClusters"
                filter={["has", "point_count"]}
                style={{
                  circleColor: [
                    "step",
                    ["get", "point_count"],
                    "#fbbf24",
                    10,
                    "#8b5800",
                    50,
                    "#000",
                  ],
                  circleRadius: [
                    "step",
                    ["get", "point_count"],
                    20,
                    10,
                    30,
                    50,
                    40,
                  ],
                  circleStrokeWidth: 2,
                  circleStrokeColor: "#fbbf24",
                }}
              />

              {/* Contagem de clusters */}
              <SymbolLayer
                id="radarClusterCount"
                filter={["has", "point_count"]}
                style={{
                  textField: "{point_count_abbreviated}",
                  textFont: ["Open Sans Regular", "Arial Unicode MS Regular"],
                  textSize: 12,
                  textColor: "#fff",
                }}
              />

              {/* Marcadores individuais de radares usando placas */}
              <SymbolLayer
                id="radarMarkers"
                filter={["!", ["has", "point_count"]]}
                style={{
                  iconImage: [
                    "coalesce",
                    ["get", "iconImage"],
                    "placa", // Fallback se iconImage não existir
                  ],
                  iconSize: 0.1, // Aumentar tamanho para melhor visibilidade
                  iconAllowOverlap: true, // Permitir que as placas se sobreponham
                  iconIgnorePlacement: true, // Ignorar placement para evitar conflitos
                }}
              />
            </ShapeSource>
          )}
      </MapView>
      {!isNavigating && userLocation && (
        <TouchableOpacity
          style={styles.locationButton}
          onPress={focusOnUserLocation}
          activeOpacity={0.7}
        >
          <Text style={styles.locationButtonText}>📍</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
    backgroundColor: "transparent", // Torna o mapa transparente quando usado como overlay
  },
  locationButton: {
    position: "absolute",
    bottom: 200,
    right: 20,
    backgroundColor: "#fff",
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  locationButtonText: {
    fontSize: 24,
  },
});

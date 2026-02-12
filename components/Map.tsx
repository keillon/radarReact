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
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  StyleSheet,
  TouchableOpacity,
  View
} from "react-native";
import { MAPBOX_TOKEN, NavigationStep, RouteFeature } from "../services/mapbox";
import { Radar } from "../services/types";

Mapbox.setAccessToken(MAPBOX_TOKEN);

export const PLACA_SPEEDS = [
  20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160,
];

export const getClosestPlacaName = (speed: number | undefined): string => {
  if (speed == null || speed <= 0) return "placa60";
  const closest = PLACA_SPEEDS.reduce((a, b) =>
    Math.abs(a - speed) <= Math.abs(b - speed) ? a : b
  );
  return `placa${closest}`;
};

export const radarImages: Record<string, any> = {
  // radar: require("../assets/images/radar.png"), // Removed usage
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
  target_icon: require("../assets/images/target_icon.png"),
};

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
  onCameraChanged?: (coords: { latitude: number; longitude: number }) => void;
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
  onCameraChanged,
}: MapProps) {
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isTracking, setIsTracking] = useState(false); // Add tracking state
  const [hasInitialized, setHasInitialized] = useState(false);
  const cameraRef = useRef<any>(null);
  const pulseAnimation = useRef(new Animated.Value(1)).current;

  const emitCameraCenter = (rawCenter: any) => {
    if (!onCameraChanged || rawCenter == null) return;

    let lat: number | null = null;
    let lng: number | null = null;

    if (Array.isArray(rawCenter) && rawCenter.length >= 2) {
      lng = Number(rawCenter[0]);
      lat = Number(rawCenter[1]);
    } else if (typeof rawCenter === "object") {
      const maybeLat = (rawCenter.latitude ?? rawCenter.lat) as number | undefined;
      const maybeLng = (rawCenter.longitude ?? rawCenter.lng ?? rawCenter.lon) as number | undefined;
      if (maybeLat != null && maybeLng != null) {
        lat = Number(maybeLat);
        lng = Number(maybeLng);
      }
    }

    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;
    onCameraChanged({ latitude: lat, longitude: lng });
  };

  // Picker mode: fallback robusto para sempre capturar o centro real do pin.
  // Alguns builds/ROMs podem não emitir onCameraChanged de forma confiável.
  useEffect(() => {
    if (!onCameraChanged) return;

    let active = true;
    const readCenter = async () => {
      try {
        if (!active || !cameraRef.current || typeof cameraRef.current.getCenter !== "function") {
          return;
        }
        const center = await cameraRef.current.getCenter();
        emitCameraCenter(center);
      } catch {
        // Ignorar falhas eventuais de leitura do centro
      }
    };

    // Leitura inicial e polling curto enquanto picker estiver aberto
    readCenter();
    const interval = setInterval(readCenter, 250);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [onCameraChanged]);

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
        ])
      ).start();
    } else {
      pulseAnimation.setValue(1);
    }
  }, [nearbyRadarIds.size]);

  // Atualizar userLocation quando currentLocation mudar
  useEffect(() => {
    if (currentLocation) {
      // Se estamos em modo "picker" (onCameraChanged presente), NÃO atualizamos o userLocation local
      // baseado no GPS. Isso evita que o blue dot ou atualizações de GPS "sequestrem" o centro do mapa
      // enquanto o usuário está tentando marcar um local manualmente.
      if (!onCameraChanged) {
        setUserLocation(currentLocation);
      }

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
  }, [currentLocation, interactive, onCameraChanged]);

  // Focar na localização quando ela for obtida pela primeira vez ou quando um currentLocation inicial é provido
  useEffect(() => {
    if (cameraRef.current && !isNavigating && !hasInitialized) {
      const targetLocation = currentLocation || userLocation;
      if (targetLocation && targetLocation.latitude !== 0) {
        // Se já temos uma localização (via prop ou GPS inicial), focamos nela
        cameraRef.current.setCamera({
          centerCoordinate: [targetLocation.longitude, targetLocation.latitude],
          zoomLevel: 14,
          animationDuration: currentLocation ? 0 : 1000, // Instantâneo se for prop (picker), suave se for GPS
        });
        setHasInitialized(true);
      } else {
        // Fallback: aguardar um pouco para ver se o GPS chega
        const timeoutId = setTimeout(() => {
          if (cameraRef.current && userLocation && !hasInitialized) {
            cameraRef.current.setCamera({
              centerCoordinate: [userLocation.longitude, userLocation.latitude],
              zoomLevel: 14,
              animationDuration: 1000,
            });
            setHasInitialized(true);
          }
        }, 800);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [userLocation, currentLocation, isNavigating, hasInitialized]);

  const focusOnUserLocation = () => {
    // Priority for GPS center: use local state or prop fallback
    const target = userLocation || currentLocation;
    if (target && cameraRef.current) {
      // Toggle tracking to force Mapbox camera to refocus
      setIsTracking(false);
      setTimeout(() => {
        setIsTracking(true);
        if (cameraRef.current) {
          cameraRef.current.setCamera({
            centerCoordinate: [target.longitude, target.latitude],
            zoomLevel: 16,
            animationDuration: 1000,
          });
        }
      }, 50);
    }
  };

  // Removido onMapDrag redundante


  /** Tamanhos de ícone por tipo (ajuste aqui para mudar no mapa). */
  const RADAR_ICON_SIZES: Record<string, number> = {
    radarMovel: 0.05,
    radarSemaforico: 0.05,
    radarFixo: 0.05,
    placa: 0.18,
  };
  const getIconSizeForIcon = (iconImage: string): number => {
    if (iconImage.startsWith("placa")) return RADAR_ICON_SIZES.placa ?? 0.24;
    return RADAR_ICON_SIZES[iconImage] ?? RADAR_ICON_SIZES.radarMovel ?? 0.2;
  };

  /** Ícone no mapa: fixo usa placa por velocidade; demais por tipo. */
  const getRadarIconForMap = (radar: Radar): string => {
    const type = radar?.type;
    if (!type) return "radarMovel";
    const t = String(type)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (t.includes("fixo") || t.includes("placa") || t.includes("velocidade"))
      return getClosestPlacaName(radar.speedLimit);
    if (t.includes("semaforo") || t.includes("camera"))
      return "radarSemaforico";
    if (t.includes("movel") || t.includes("mobile")) return "radarMovel";
    return "radarMovel";
  };


  // Criar GeoJSON para radares com ícone por tipo (radar, radarFixo, radarMovel, radarSemaforico)
  const radarsGeoJSON = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: (radars || [])
      .filter(
        (radar) =>
          radar != null &&
          radar.id != null &&
          typeof radar.latitude === "number" &&
          typeof radar.longitude === "number" &&
          !isNaN(radar.latitude) &&
          !isNaN(radar.longitude)
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
          type: radar.type || "default",
          iconImage: getRadarIconForMap(radar),
          iconSize: getIconSizeForIcon(getRadarIconForMap(radar)),
          isNearby: nearbyRadarIds?.has(radar.id) ? 1 : 0,
        },
      })),
  }), [radars, nearbyRadarIds]);

  /* useEffect(() => {
    if (!__DEV__) return;
    const validRadars = radars || [];
    if (validRadars.length > 0 && validRadars[0] != null) {
      const firstRadar = validRadars[0];
      if (
        firstRadar.id != null &&
        typeof firstRadar.latitude === "number" &&
        typeof firstRadar.longitude === "number"
      ) {
        console.log(`MAP RENDER: ${validRadars.length} radars`);
      }
    }
  }, [radars?.length || 0]); */

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
          const geometry = event?.geometry as
            | { coordinates?: number[] }
            | undefined;
          const coords = geometry?.coordinates;
          if (onMapPress && Array.isArray(coords) && coords.length >= 2) {
            const [lng, lat] = coords;
            onMapPress({ latitude: lat, longitude: lng });
          }
        }}
        onLongPress={(event) => {
          const geometry = event?.geometry as
            | { coordinates?: number[] }
            | undefined;
          const coords = geometry?.coordinates;
          if (onMapPress && Array.isArray(coords) && coords.length >= 2) {
            const [lng, lat] = coords;
            onMapPress({ latitude: lat, longitude: lng });
          }
        }}
        onCameraChanged={(event) => {
          try {
            // Define isUserInteraction strictly
            const props = (event.properties || {}) as any;
            const isUserInteraction = props.isUserInteraction === true;

            if (isTracking && isUserInteraction) {
              setIsTracking(false);
            }

            if (onCameraChanged) {
              // Captura robusta do centro para diferentes formatos de evento
              const centerCandidate =
                event?.properties?.center ??
                (event as any)?.geometry?.coordinates ??
                (event as any)?.centerCoordinate ??
                (event as any)?.center;

              emitCameraCenter(centerCandidate);

              // Fallback adicional: obter do Camera ref se o evento vier sem centro
              if (
                centerCandidate == null &&
                cameraRef.current &&
                typeof cameraRef.current.getCenter === "function"
              ) {
                Promise.resolve(cameraRef.current.getCenter())
                  .then((center: any) => emitCameraCenter(center))
                  .catch(() => {
                    // ignorar fallback failures
                  });
              }
            }
          } catch (e) {
            console.error("Error in onCameraChanged:", e);
          }
        }}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [-46.6333, -23.5505], // São Paulo como padrão
            zoomLevel: 14,
          }}
          followUserLocation={isNavigating || (interactive && isTracking)}
          followUserMode={
            isNavigating
              ? UserTrackingMode.FollowWithCourse
              : (isTracking ? UserTrackingMode.Follow : undefined)
          }
          {...(isTracking ? { followZoomLevel: 16 } : {})}
          animationDuration={1000}
        />

        {/* Desabilitar UserLocation quando não é interativo (overlay) para evitar conflitos */}
        {interactive && (
          <UserLocation
            visible={true}
            androidRenderMode="gps"
            onUpdate={(location) => {
              if (location?.coords) {
                // SÓ atualizamos o estado de localização se NÃO estivermos no modo picker
                if (!onCameraChanged) {
                  setUserLocation({
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                  });
                }
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

        {/* Ícones de radar por tipo (radar, radarFixo, radarMovel, radarSemaforico) */}
        <Images
          images={radarImages}
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
                      const radarId = feature.properties?.id || feature.id; // Check properties first
                      if (radarId != null && radars != null) {
                        const radar = radars.find(
                          (r) => r != null && r.id === radarId
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
                  textField: "{point_count}",
                  textFont: ["Open Sans Regular", "Arial Unicode MS Regular"],
                  textSize: 12,
                  textColor: "#fff",
                }}
              />

              {/* Marcadores individuais: ícone por tipo (radar, radarFixo, radarMovel, radarSemaforico) */}
              <SymbolLayer
                id="radarMarkers"
                filter={["!", ["has", "point_count"]]}
                style={{
                  iconImage: ["coalesce", ["get", "iconImage"], "radarMovel"],
                  iconSize: ["coalesce", ["get", "iconSize"], 0.2],
                  iconAllowOverlap: true,
                  iconIgnorePlacement: true,
                }}
              />
            </ShapeSource>
          )}
      </MapView>
      {!isNavigating && (userLocation || currentLocation) && (
        <TouchableOpacity
          style={[styles.locationButton, { zIndex: 999 }]}
          onPress={focusOnUserLocation}
          activeOpacity={0.7}
        >
          <Image
            source={radarImages.target_icon}
            style={styles.locationButtonImage}
            resizeMode="contain"
          />
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
  locationButtonImage: {
    width: 30,
    height: 30,
    flex: 1,

  },
});

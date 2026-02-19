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
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Image,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { MenuModal } from "./MenuModal";
import { MAPBOX_TOKEN, NavigationStep, RouteFeature } from "../services/mapbox";
import { Radar } from "../services/types";
import { colors } from "../utils/theme";

Mapbox.setAccessToken(MAPBOX_TOKEN);

export const PLACA_SPEEDS = [
  20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160,
];

export const getClosestPlacaName = (speed: number | undefined): string => {
  if (speed == null || speed <= 0) return "placa60";
  const closest = PLACA_SPEEDS.reduce((a, b) =>
    Math.abs(a - speed) <= Math.abs(b - speed) ? a : b,
  );
  return `placa${closest}`;
};

export const radarImages: Record<string, any> = {
  // radar: require("../assets/images/radar.png"), // Removed usage
  // radarFixo: radares fixos usam placas (placa20, placa60, etc.) dinamicamente
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
  /** Esconde o ícone de localização do usuário (ex.: modo picker "marcar no mapa") */
  hideUserLocation?: boolean;
  /** Ponto selecionado no modo picker (ex.: toque no mapa) — mostra marcador vermelho */
  pickerSelectedPoint?: { latitude: number; longitude: number } | null;
  /** Chamado quando o mapa termina de animar (câmera parada) */
  onMapIdle?: () => void;
  /** Mostrar botão hamburger e menu (ocultar no picker) */
  showMenu?: boolean;
  /** Chamado ao tocar em "Atualizar radares" no menu */
  onRefreshRadars?: () => void;
}

export type MapHandle = {
  getCenter: () => Promise<{ latitude: number; longitude: number } | null>;
  /** Foca a câmera nas coordenadas (zoom 16, animação 800ms) */
  focusOnCoord: (
    latitude: number,
    longitude: number,
    zoomLevel?: number,
  ) => void;
  /** Converte coordenada geo para pixels na tela (para posicionar overlay) */
  getPointInView: (
    longitude: number,
    latitude: number,
  ) => Promise<[number, number] | null>;
  /** Abre o menu lateral na aba Assinatura (para bloqueio pós-período grátis) */
  openMenuToSubscription: () => void;
};

const Map = forwardRef<MapHandle, MapProps>(function Map(
  {
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
    hideUserLocation = false,
    pickerSelectedPoint = null,
  onMapIdle,
  showMenu = !hideUserLocation,
  onRefreshRadars,
},
  ref,
) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuOpenToScreen, setMenuOpenToScreen] = useState<"menu" | "profile" | "accountSettings" | "soundSettings" | "subscription" | null>(null);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isTracking, setIsTracking] = useState(false); // Add tracking state
  const [hasInitialized, setHasInitialized] = useState(false);
  const cameraRef = useRef<any>(null);
  const mapViewRef = useRef<any>(null);

  const CAMERA_THROTTLE_MS = 150;
  const lastEmitCameraRef = useRef<number>(0);
  const pendingCameraRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emitCameraCenter = (rawCenter: any) => {
    if (!onCameraChanged || rawCenter == null) return;

    let lat: number | null = null;
    let lng: number | null = null;

    if (Array.isArray(rawCenter) && rawCenter.length >= 2) {
      lng = Number(rawCenter[0]);
      lat = Number(rawCenter[1]);
    } else if (typeof rawCenter === "object") {
      const maybeLat = (rawCenter.latitude ?? rawCenter.lat) as
        | number
        | undefined;
      const maybeLng = (rawCenter.longitude ??
        rawCenter.lng ??
        rawCenter.lon) as number | undefined;
      if (maybeLat != null && maybeLng != null) {
        lat = Number(maybeLat);
        lng = Number(maybeLng);
      }
    }

    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;
    const payload = { latitude: lat, longitude: lng };

    const now = Date.now();
    if (now - lastEmitCameraRef.current >= CAMERA_THROTTLE_MS) {
      lastEmitCameraRef.current = now;
      pendingCameraRef.current = null;
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      onCameraChanged(payload);
    } else {
      pendingCameraRef.current = payload;
      if (throttleTimerRef.current == null) {
        throttleTimerRef.current = setTimeout(() => {
          throttleTimerRef.current = null;
          const pending = pendingCameraRef.current;
          pendingCameraRef.current = null;
          if (pending) {
            lastEmitCameraRef.current = Date.now();
            onCameraChanged(pending);
          }
        }, CAMERA_THROTTLE_MS - (now - lastEmitCameraRef.current));
      }
    }
  };

  useEffect(() => {
    return () => {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
    };
  }, []);

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
      if (
        !interactive &&
        cameraRef.current &&
        typeof currentLocation.latitude === "number" &&
        typeof currentLocation.longitude === "number"
      ) {
        const timeoutId = setTimeout(() => {
          const ref = cameraRef.current;
          if (ref && typeof ref.setCamera === "function") {
            ref.setCamera({
              centerCoordinate: [
                currentLocation.longitude,
                currentLocation.latitude,
              ],
              zoomLevel: 16,
              animationDuration: 0,
            });
          }
        }, 100);
        return () => clearTimeout(timeoutId);
      }
      // Modo picker (interativo + onCameraChanged): NÃO atualizar câmera aqui quando currentLocation mudar.
      // O centro inicial é feito uma vez no efeito de hasInitialized. Assim o mapa não "puxa" para a
      // localização atual (GPS) enquanto o usuário está escolhendo o ponto no mapa.
    }
  }, [currentLocation, interactive, onCameraChanged]);

  // Focar na localização quando ela for obtida pela primeira vez ou quando um currentLocation inicial é provido
  useEffect(() => {
    const ref = cameraRef.current;
    if (
      ref &&
      typeof ref.setCamera === "function" &&
      !isNavigating &&
      !hasInitialized
    ) {
      const targetLocation = currentLocation || userLocation;
      if (
        targetLocation != null &&
        typeof targetLocation.latitude === "number" &&
        typeof targetLocation.longitude === "number" &&
        targetLocation.latitude !== 0
      ) {
        ref.setCamera({
          centerCoordinate: [targetLocation.longitude, targetLocation.latitude],
          zoomLevel: 14,
          animationDuration: currentLocation ? 0 : 1000,
        });
        setHasInitialized(true);
      } else {
        // Fallback: aguardar um pouco para ver se o GPS chega
        const timeoutId = setTimeout(() => {
          const r = cameraRef.current;
          const loc = userLocation;
          if (
            r &&
            typeof r.setCamera === "function" &&
            loc != null &&
            typeof loc.latitude === "number" &&
            typeof loc.longitude === "number" &&
            !hasInitialized
          ) {
            r.setCamera({
              centerCoordinate: [loc.longitude, loc.latitude],
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
    const target = userLocation || currentLocation;
    if (
      target == null ||
      typeof target.latitude !== "number" ||
      typeof target.longitude !== "number"
    )
      return;
    const ref = cameraRef.current;
    if (ref == null || typeof ref.setCamera !== "function") return;
    setIsTracking(false);
    setTimeout(() => {
      setIsTracking(true);
      const r = cameraRef.current;
      if (r && typeof r.setCamera === "function") {
        r.setCamera({
          centerCoordinate: [target.longitude, target.latitude],
          zoomLevel: 16,
          animationDuration: 1000,
        });
      }
    }, 50);
  };

  // Removido onMapDrag redundante

  /** Tamanhos de ícone por tipo (ajuste aqui para mudar no mapa). */
  const RADAR_ICON_SIZES: Record<string, number> = {
    radarMovel: 0.05,
    radarSemaforico: 0.05,
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

  // Chave estável para nearbyRadarIds — evita recalc desnecessário quando Set tem mesmos IDs
  const nearbyIdsKey = useMemo(
    () =>
      nearbyRadarIds?.size
        ? Array.from(nearbyRadarIds).sort().join(",")
        : "",
    [nearbyRadarIds],
  );

  // Criar GeoJSON para radares com ícone por tipo (radar, radarFixo, radarMovel, radarSemaforico)
  const radarsGeoJSON = useMemo(
    () => {
      const idsSet = nearbyRadarIds ?? new Set<string>();
      const hasId = (id: string) => idsSet.has(id);
      return {
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
              type: radar.type || "default",
              iconImage: getRadarIconForMap(radar),
              iconSize: getIconSizeForIcon(getRadarIconForMap(radar)),
              isNearby: hasId(radar.id) ? 1 : 0,
            },
          })),
      };
    },
    [radars, nearbyIdsKey],
  );

  const showUserLocation: boolean =
    interactive && !onCameraChanged && !hideUserLocation;

  useImperativeHandle(
    ref,
    () => ({
      getCenter: (): Promise<{
        latitude: number;
        longitude: number;
      } | null> => {
        const mapView = mapViewRef.current;
        if (mapView == null || typeof mapView.getCenter !== "function") {
          return Promise.resolve(null);
        }
        return Promise.resolve(mapView.getCenter())
          .then((raw: unknown) => {
            if (raw == null) return null;
            let lat: number | null = null;
            let lng: number | null = null;
            if (Array.isArray(raw) && raw.length >= 2) {
              lng = Number(raw[0]);
              lat = Number(raw[1]);
            } else if (typeof raw === "object" && raw !== null) {
              const o = raw as Record<string, unknown>;
              const a = o.latitude ?? o.lat;
              const b = o.longitude ?? o.lng ?? o.lon;
              if (typeof a === "number" && typeof b === "number") {
                lat = a;
                lng = b;
              }
            }
            if (lat == null || lng == null || isNaN(lat) || isNaN(lng))
              return null;
            return { latitude: lat, longitude: lng };
          })
          .catch(() => null);
      },
      focusOnCoord: (
        latitude: number,
        longitude: number,
        zoomLevel: number = 16,
      ) => {
        const cam = cameraRef.current;
        if (cam == null || typeof (cam as any).setCamera !== "function") return;
        setIsTracking(false);
        (cam as any).setCamera({
          centerCoordinate: [longitude, latitude],
          zoomLevel,
          animationDuration: 800,
        });
      },
      getPointInView: async (
        longitude: number,
        latitude: number,
      ): Promise<[number, number] | null> => {
        const map = mapViewRef.current;
        if (map == null || typeof (map as any).getPointInView !== "function")
          return null;
        try {
          const pt = await (map as any).getPointInView([longitude, latitude]);
          return Array.isArray(pt) && pt.length >= 2
            ? [Number(pt[0]), Number(pt[1])]
            : null;
        } catch {
          return null;
        }
      },
      openMenuToSubscription: () => {
        setMenuOpenToScreen("subscription");
        setMenuVisible(true);
      },
    }),
    [],
  );

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
    <View style={styles.container} pointerEvents="auto">
      {showMenu && (
        <>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setMenuVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="menu" size={26} color="#fff" />
          </TouchableOpacity>
          <MenuModal
            visible={menuVisible}
            onClose={() => {
              setMenuVisible(false);
              setMenuOpenToScreen(null);
            }}
            onRefreshRadars={onRefreshRadars}
            openToScreen={menuOpenToScreen}
          />
        </>
      )}
      <MapView
        ref={mapViewRef}
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
          const geom = event?.geometry as
            | { coordinates?: number[] }
            | undefined;
          const coords = geom?.coordinates;
          if (onMapPress && Array.isArray(coords) && coords.length >= 2) {
            const [lng, lat] = coords;
            onMapPress({ latitude: Number(lat), longitude: Number(lng) });
          }
        }}
        onLongPress={(event) => {
          const geom = event?.geometry as
            | { coordinates?: number[] }
            | undefined;
          const coords = geom?.coordinates;
          if (onMapPress && Array.isArray(coords) && coords.length >= 2) {
            const [lng, lat] = coords;
            onMapPress({ latitude: Number(lat), longitude: Number(lng) });
          }
        }}
        {...(onCameraChanged != null
          ? {
              onCameraChanged: (event: unknown) => {
                if (event == null) return;
                try {
                  let centerCandidate: number[] | undefined;
                  if (typeof event === "object") {
                    const e = event as Record<string, unknown>;
                    const props = (e.properties as Record<string, unknown> | undefined) ?? {};
                    centerCandidate =
                      (props.center as number[] | undefined) ??
                      (e.geometry as { coordinates?: number[] } | undefined)?.coordinates ??
                      (e.centerCoordinate as number[] | undefined) ??
                      (e.center as number[] | undefined);
                    const isUserInteraction = props.isUserInteraction === true;
                    if (isTracking && isUserInteraction) setIsTracking(false);
                  }
                  if (typeof event === "string") {
                    try {
                      const parsed = JSON.parse(event) as Record<string, unknown>;
                      const props = (parsed.properties as Record<string, unknown>) ?? {};
                      centerCandidate ??= (props.center as number[] | undefined);
                    } catch (_) {}
                  }
                  if (centerCandidate != null && Array.isArray(centerCandidate) && centerCandidate.length >= 2)
                    emitCameraCenter(centerCandidate);
                } catch (_) {}
              },
            }
          : {})}
        {...(onMapIdle != null || onCameraChanged != null
          ? {
              onMapIdle: (event: unknown) => {
                if (event == null || typeof event !== "object") return;
                try {
                  if (onCameraChanged != null) {
                    const e = event as {
                      properties?: { center?: number[] };
                      geometry?: { coordinates?: number[] };
                    };
                    const centerCandidate =
                      e.properties?.center ?? e.geometry?.coordinates;
                    if (centerCandidate != null)
                      emitCameraCenter(centerCandidate);
                  }
                  onMapIdle?.();
                } catch (_) {}
              },
            }
          : {})}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [-46.6333, -23.5505], // São Paulo como padrão
            zoomLevel: 14,
          }}
          followUserLocation={
            onCameraChanged
              ? false
              : isNavigating || (interactive && isTracking)
          }
          followUserMode={
            isNavigating
              ? UserTrackingMode.FollowWithCourse
              : isTracking
                ? UserTrackingMode.Follow
                : undefined
          }
          {...(isTracking ? { followZoomLevel: 16 } : {})}
          animationDuration={1000}
        />

        {/* Desabilitar UserLocation quando não é interativo (overlay) ou no modo picker */}
        {showUserLocation && (
          <UserLocation
            visible={true}
            androidRenderMode="gps"
            onUpdate={(location) => {
              if (location?.coords != null && onCameraChanged == null) {
                const { latitude, longitude } = location.coords;
                if (
                  typeof latitude === "number" &&
                  typeof longitude === "number"
                ) {
                  setUserLocation({ latitude, longitude });
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
                  lineColor: isNavigating ? colors.primary : colors.primaryLight,
                  lineWidth: isNavigating ? 6 : 4,
                  lineCap: "round",
                  lineJoin: "round",
                  lineGradient: isNavigating
                    ? [
                        "interpolate",
                        ["linear"],
                        ["line-progress"],
                        0,
                        colors.primary,
                        0.5,
                        colors.primaryLight,
                        1,
                        "#FFE082",
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
                  circleColor: colors.success,
                  circleRadius: 10,
                  circleStrokeWidth: 3,
                  circleStrokeColor: colors.text,
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
                  circleColor: colors.warning,
                  circleRadius: 12,
                  circleStrokeWidth: 3,
                  circleStrokeColor: colors.text,
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
          onImageMissing={(imageId: unknown) => {
            if (imageId != null && typeof imageId === "string") {
              console.warn("Imagem faltando no mapa:", imageId);
            }
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
              clusterMaxZoomLevel={12}
              onPress={(event) => {
                if (event == null || onRadarPress == null || radars == null)
                  return;
                try {
                  const features = event.features;
                  if (!Array.isArray(features) || features.length === 0) return;
                  const feature = features[0];
                  if (feature == null) return;
                  const radarId = String(feature.properties?.id ?? feature.id ?? "");
                  if (!radarId) return;
                  const radar = radars.find(
                    (r) => r != null && String(r.id) === radarId,
                  );
                  if (radar != null) onRadarPress(radar);
                } catch (_) {
                  // Evita NPE no bridge
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
                    colors.primary,
                    10,
                    colors.primaryDark,
                    50,
                    colors.background,
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
                  circleStrokeColor: colors.primary,
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

              {/* Highlight/pulse em radares próximos (alertados ou perto de alertar) */}
              <CircleLayer
                id="radarNearbyHighlight"
                filter={[
                  "all",
                  ["!", ["has", "point_count"]],
                  ["==", ["get", "isNearby"], 1],
                ]}
                style={{
                  circleRadius: 28,
                  circleColor: "transparent",
                  circleStrokeWidth: 3,
                  circleStrokeColor: colors.warning,
                  circleOpacity: 0.9,
                }}
              />
              {/* Marcadores individuais: ícone por tipo (radar, radarFixo, radarMovel, radarSemaforico) */}
              <SymbolLayer
                id="radarMarkers"
                filter={["!", ["has", "point_count"]]}
                style={{
                  iconImage: ["coalesce", ["get", "iconImage"], "radarMovel"],
                  iconSize: [
                    "case",
                    ["==", ["get", "isNearby"], 1],
                    ["*", ["coalesce", ["get", "iconSize"], 0.2], 1.3],
                    ["coalesce", ["get", "iconSize"], 0.2],
                  ],
                  iconAllowOverlap: true,
                  iconIgnorePlacement: true,
                }}
              />
            </ShapeSource>
          )}

        {/* Marcador do ponto selecionado no modo picker (por último = por cima) */}
        {pickerSelectedPoint != null &&
          typeof pickerSelectedPoint.latitude === "number" &&
          typeof pickerSelectedPoint.longitude === "number" && (
            <ShapeSource
              id="pickerSelectedPoint"
              shape={{
                type: "Feature",
                properties: {},
                geometry: {
                  type: "Point",
                  coordinates: [
                    pickerSelectedPoint.longitude,
                    pickerSelectedPoint.latitude,
                  ],
                },
              }}
            >
              <CircleLayer
                id="pickerSelectedPointCircle"
                style={{
                  circleRadius: 22,
                  circleColor: colors.error,
                  circleStrokeWidth: 4,
                  circleStrokeColor: colors.text,
                }}
              />
              <CircleLayer
                id="pickerSelectedPointRing"
                style={{
                  circleRadius: 28,
                  circleColor: "transparent",
                  circleStrokeWidth: 3,
                  circleStrokeColor: colors.error,
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
});

export default Map;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  menuButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 48,
    left: 16,
    zIndex: 1000,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.backgroundCard,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
  },
  map: {
    flex: 1,
    backgroundColor: "transparent", // Torna o mapa transparente quando usado como overlay
  },
  locationButton: {
    position: "absolute",
    bottom: 280,
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

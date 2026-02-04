import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
// Geolocation: carregar sob demanda para evitar "Requiring unknown module 'undefined'" no startup
type GeolocationApi = {
  getCurrentPosition: any;
  watchPosition: any;
  clearWatch: any;
};
let GeolocationModule: GeolocationApi | null = null;
function getGeolocation(): GeolocationApi {
  if (GeolocationModule == null) {
    try {
      const m = require("react-native-geolocation-service");
      const api = m.default ?? m;
      GeolocationModule = api;
      return api;
    } catch {
      throw new Error("react-native-geolocation-service no disponvel");
    }
  }
  return GeolocationModule;
}

import { getClosestPlacaName, radarImages } from "../components/Map";
import SearchContainer from "../components/SearchContainer";
import {
  API_BASE_URL,
  getRadarsNearLocation,
  getRadarsNearRoute,
  getRecentRadars,
  Radar,
  reportRadar,
} from "../services/api";
import {
  geocodeAddress,
  getRoute,
  initMapbox,
  LatLng,
  RouteResponse,
} from "../services/mapbox";
// TTS: carregar s no primeiro uso para evitar "Requiring unknown module 'undefined'" no startup
let TtsCache: any = undefined; // undefined = ainda no tentou; null = tentou e falhou
function getTts(): any {
  if (TtsCache !== undefined) return TtsCache;
  try {
    const TtsModule = require("react-native-tts");
    TtsCache = TtsModule.default || TtsModule;
  } catch (error) {
    console.warn("react-native-tts no est disponvel:", error);
    TtsCache = null;
  }
  return TtsCache;
}

// Map carregado sob demanda para evitar "Requiring unknown module 'undefined'" no startup (@rnmapbox/maps)
const MapComponent = React.lazy(() => {
  try {
    const m = require("../components/Map");
    return Promise.resolve(m.default ? m : { default: () => null });
  } catch (e) {
    return Promise.resolve({
      default: () => (
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <Text>Erro ao carregar mapa</Text>
        </View>
      ),
    });
  }
});

// Funo para calcular distncia entre dois pontos (Haversine)
const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3; // Raio da Terra em metros
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

// Funo auxiliar para calcular distncia ponto-reta (Cross-Track Distance)
const getDistanceFromLine = (pt: any, v: any, w: any) => {
  const l2 = (w[0] - v[0]) ** 2 + (w[1] - v[1]) ** 2;
  if (l2 === 0) return Math.sqrt((pt[0] - v[0]) ** 2 + (pt[1] - v[1]) ** 2);
  let t = ((pt[0] - v[0]) * (w[0] - v[0]) + (pt[1] - v[1]) * (w[1] - v[1])) / l2;
  t = Math.max(0, Math.min(1, t));
  const projectionX = v[0] + t * (w[0] - v[0]);
  const projectionY = v[1] + t * (w[1] - v[1]);
  return Math.sqrt((pt[0] - projectionX) ** 2 + (pt[1] - projectionY) ** 2);
};

// Funo para checar se o radar est na rota
const isRadarOnRoute = (radar: Radar, route: any) => {
  if (!route || !route.geometry || !route.geometry.coordinates) return true;

  const MAX_DIST_DEG = 0.0003; // ~30m
  const coordinates = route.geometry.coordinates;
  const radarPt = [radar.longitude, radar.latitude];

  for (let i = 0; i < coordinates.length - 1; i++) {
    const p1 = coordinates[i];
    const p2 = coordinates[i + 1];
    const dist = getDistanceFromLine(radarPt, p1, p2);
    if (dist < MAX_DIST_DEG) return true;
  }
  return false;
};


// Funo para calcular distncia perpendicular de um ponto a um segmento de linha
const distanceToLineSegment = (
  point: LatLng,
  lineStart: LatLng,
  lineEnd: LatLng
): number => {
  const A = point.latitude - lineStart.latitude;
  const B = point.longitude - lineStart.longitude;
  const C = lineEnd.latitude - lineStart.latitude;
  const D = lineEnd.longitude - lineStart.longitude;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) param = dot / lenSq;

  let xx: number, yy: number;

  if (param < 0) {
    xx = lineStart.latitude;
    yy = lineStart.longitude;
  } else if (param > 1) {
    xx = lineEnd.latitude;
    yy = lineEnd.longitude;
  } else {
    xx = lineStart.latitude + param * C;
    yy = lineStart.longitude + param * D;
  }

  return calculateDistance(point.latitude, point.longitude, xx, yy);
};

// Funo para calcular distncia de um ponto at a rota (distncia perpendicular mais prxima)
const calculateDistanceToRoute = (
  point: LatLng,
  routePoints: LatLng[]
): number => {
  if (routePoints.length < 2) {
    // Se no h rota, retornar distncia grande
    return Infinity;
  }

  let minDistance = Infinity;

  // Verificar distncia perpendicular para cada segmento da rota
  for (let i = 0; i < routePoints.length - 1; i++) {
    const segmentStart = routePoints[i];
    const segmentEnd = routePoints[i + 1];

    const distance = distanceToLineSegment(point, segmentStart, segmentEnd);
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
};

// --- Lgica robusta estilo Waze: distncia ao longo da rota com projeo contnua ---

/** Distncias cumulativas desde o incio da rota (em metros). cumulative[0]=0, cumulative[i]=soma dos segmentos 0..i-1 */
function getCumulativeDistances(routePoints: LatLng[]): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < routePoints.length; i++) {
    cum[i] =
      cum[i - 1] +
      calculateDistance(
        routePoints[i - 1].latitude,
        routePoints[i - 1].longitude,
        routePoints[i].latitude,
        routePoints[i].longitude
      );
  }
  return cum;
}

/**
 * Projeta um ponto na rota e retorna a distncia cumulativa (em metros) at essa projeo.
 * Usa projeo no segmento mais prximo (no s vrtices).
 */
function projectPointOntoRoute(
  point: LatLng,
  routePoints: LatLng[],
  cumulative: number[]
): number {
  if (routePoints.length < 2 || cumulative.length !== routePoints.length) {
    return 0;
  }
  let bestCumulative = 0;
  let bestDist = Infinity;
  for (let i = 0; i < routePoints.length - 1; i++) {
    const segStart = routePoints[i];
    const segEnd = routePoints[i + 1];
    const segLen = cumulative[i + 1] - cumulative[i] || 1e-9;
    const A = point.latitude - segStart.latitude;
    const B = point.longitude - segStart.longitude;
    const C = segEnd.latitude - segStart.latitude;
    const D = segEnd.longitude - segStart.longitude;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let t = lenSq > 0 ? dot / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const projLat = segStart.latitude + t * C;
    const projLon = segStart.longitude + t * D;
    const dist = calculateDistance(
      point.latitude,
      point.longitude,
      projLat,
      projLon
    );
    if (dist < bestDist) {
      bestDist = dist;
      bestCumulative = cumulative[i] + t * segLen;
    }
  }
  return bestCumulative;
}

/**
 * Distncia ao longo da rota do usurio at o radar (em metros).
 * Positiva = radar  frente; negativa ou zero = j passou.
 * Estilo Waze: projeo contnua + cumulativas.
 */
const calculateDistanceAlongRoute = (
  userLocation: LatLng,
  radarLocation: LatLng,
  routePoints: LatLng[]
): { distance: number; hasPassed: boolean } => {
  if (routePoints.length < 2) {
    return { distance: Infinity, hasPassed: false };
  }
  const cumulative = getCumulativeDistances(routePoints);
  const userCum = projectPointOntoRoute(userLocation, routePoints, cumulative);
  const radarCum = projectPointOntoRoute(
    radarLocation,
    routePoints,
    cumulative
  );
  const distanceAlongRoute = radarCum - userCum;
  // Histerese 5m: marcar "passou" quando < 5m para evitar flicker por rudo do GPS
  const hasPassed = distanceAlongRoute < 5;
  return {
    distance: hasPassed ? 0 : Math.max(0, distanceAlongRoute),
    hasPassed,
  };
};

/** Arredonda distncia para mltiplo de 10m (ex.: 287 -> 290, 283 -> 280), mnimo 0. */
const roundDistanceTo10 = (meters: number): number => {
  if (meters <= 0) return 0;
  return Math.round(meters / 10) * 10;
};

// Funo para filtrar radares prximos  rota
const filterRadarsNearRoute = (
  radars: Radar[],
  routePoints: LatLng[],
  maxDistance: number = 100 // metros
): Radar[] => {
  if (routePoints.length < 2) return radars;

  return radars.filter((radar) => {
    const radarPoint: LatLng = {
      latitude: radar.latitude,
      longitude: radar.longitude,
    };

    // Verificar distncia at cada segmento da rota
    for (let i = 0; i < routePoints.length - 1; i++) {
      const distance = distanceToLineSegment(
        radarPoint,
        routePoints[i],
        routePoints[i + 1]
      );
      if (distance <= maxDistance) {
        return true;
      }
    }
    return false;
  });
};

interface HomeProps {
  onOpenEditor?: () => void;
}

export default function Home({ onOpenEditor }: HomeProps) {
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [destinationText, setDestinationText] = useState<string>("");
  const [route, setRoute] = useState<any>(null);
  const [routeData, setRouteData] = useState<RouteResponse | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isPreparingNavigation, setIsPreparingNavigation] = useState(false);
  const [radars, setRadars] = useState<Radar[]>([]);
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null);
  const [alertedRadars, setAlertedRadars] = useState<Set<string>>(new Set());
  const [nearestRadar, setNearestRadar] = useState<{
    radar: Radar;
    distance: number;
  } | null>(null);
  const [filteredRadars, setFilteredRadars] = useState<Radar[]>([]);
  const [nearbyRadarIds, setNearbyRadarIds] = useState<Set<string>>(new Set()); // IDs dos radares prximos para animao
  const [isReportingRadar, setIsReportingRadar] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showLocationErrorModal, setShowLocationErrorModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [reportSpeedLimit, setReportSpeedLimit] = useState("");
  const [reportRadarType, setReportRadarType] = useState<
    "reportado" | "fixo" | "mvel" | "semaforo"
  >("mvel");
  const [MapboxNavComponent, setMapboxNavComponent] =
    useState<React.ComponentType<any> | null>(null);
  const [mapboxNavError, setMapboxNavError] = useState<string | null>(null);

  // Multi-step report modal states
  const [reportStep, setReportStep] = useState<1 | 2 | 3>(1);
  const [reportSelectedSpeed, setReportSelectedSpeed] = useState<number | null>(null);
  const [reportLocationMode, setReportLocationMode] = useState<
    "current" | "map"
  >("current");
  const [reportCustomLocation, setReportCustomLocation] =
    useState<LatLng | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [mapPickerCenter, setMapPickerCenter] = useState<LatLng | null>(null);

  const lastSyncTimeRef = useRef<number>(Date.now());

  const REPORT_RADAR_TYPES: {
    value: "reportado" | "fixo" | "mvel" | "semaforo";
    label: string;
    icon: number;
  }[] = [
      {
        value: "reportado",
        label: "Reportado",
        icon: require("../assets/images/radar.png"),
      },
      {
        value: "fixo",
        label: "Radar Fixo",
        icon: require("../assets/images/placa60.png"),
      },
      {
        value: "mvel",
        label: "Radar Mvel",
        icon: require("../assets/images/radarMovel.png"),
      },
      {
        value: "semaforo",
        label: "Semforo c/ Radar",
        icon: require("../assets/images/radarSemaforico.png"),
      },
    ];
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const locationWatchRef = useRef<any>(null);
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalScale = useRef(new Animated.Value(0.8)).current;
  const loadingOpacity = useRef(new Animated.Value(0)).current;
  const loadingScale = useRef(new Animated.Value(0.9)).current;
  const lastTtsTime = useRef<{ [key: string]: number }>({});
  const alertedRadarIds = useRef<Set<string>>(new Set()); // Rastrear radares j alertados (apenas uma vez)
  const passedRadarIds = useRef<Set<string>>(new Set()); // Rastrear radares que j foram passados
  const lastLocationUpdate = useRef<number>(0);
  const locationUpdateDebounce = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastCalculatedDistance = useRef<number>(0);
  const radarZeroTimeRef2 = useRef<number | null>(null); // Timestamp quando chegou a 0 metros
  const modalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNavigatingRef = useRef(false);
  const routeDataRef = useRef<RouteResponse | null>(null);
  const radarCheckDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    initMapbox();
    requestLocationPermission();

    // Configurar TTS se disponvel (aguardar inicializao do mdulo nativo)  carregado sob demanda
    const Tts = getTts();
    if (Tts) {
      if (Tts.getInitStatus && typeof Tts.getInitStatus === "function") {
        Tts.getInitStatus()
          .then((status: boolean) => {
            if (status && Tts.setDefaultLanguage) {
              try {
                Tts.setDefaultLanguage("pt-BR");
                Tts.setDefaultRate(0.5);
                Tts.setDefaultPitch(1.0);
              } catch (error) {
                console.warn("Erro ao configurar TTS:", error);
              }
            }
          })
          .catch(() => {
            if (Tts.setDefaultLanguage) {
              try {
                Tts.setDefaultLanguage("pt-BR");
                Tts.setDefaultRate(0.5);
                Tts.setDefaultPitch(1.0);
              } catch (error) {
                console.warn("Erro ao configurar TTS:", error);
              }
            }
          });
      } else if (Tts.setDefaultLanguage) {
        try {
          Tts.setDefaultLanguage("pt-BR");
          Tts.setDefaultRate(0.5);
          Tts.setDefaultPitch(1.0);
        } catch (error) {
          console.warn("Erro ao configurar TTS:", error);
        }
      }
    }

    return () => {
      const Tts = getTts();
      if (Tts && Tts.stop) {
        try {
          Tts.stop();
        } catch (error) {
          // Ignorar erro ao parar TTS
        }
      }
    };
  }, []);

  const requestLocationPermission = async () => {
    try {
      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(
            "Permisso negada",
            " necessrio permitir acesso  localizao para usar o app"
          );
          return;
        }
      }

      getGeolocation().getCurrentPosition(
        (position: { coords: { latitude: number; longitude: number } }) => {
          const loc: LatLng = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          console.log(` Localizao obtida:`, loc);
          setCurrentLocation(loc);
          setOrigin(loc); // Origem sempre ser a localizao atual

          // Buscar radares imediatamente quando obtm localizao
          getRadarsNearLocation(loc.latitude, loc.longitude, 1000)
            .then((nearbyRadars) => {
              console.log(
                ` ${nearbyRadars.length} radares encontrados na inicializao`
              );
              setRadars(nearbyRadars);
            })
            .catch((error) => {
              console.error("Erro ao buscar radares na inicializao:", error);
            });
        },
        (error: unknown) => {
          console.error("Erro ao obter localizao:", error);
          setShowLocationErrorModal(true);
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 5000,
        }
      );
    } catch (error) {
      console.error("Erro ao solicitar permisso:", error);
    }
  };

  const handleSearchRoute = async () => {
    if (!origin) {
      Alert.alert("Erro", "Aguardando localizao atual...");
      return;
    }

    if (!destinationText.trim()) {
      Alert.alert("Erro", "Por favor, digite um endereo de destino");
      return;
    }

    // Mostrar loading imediatamente
    setLoading(true);
    setGeocoding(true);
    setIsPreparingNavigation(true);

    // Animao de entrada do loading (simplificada)
    Animated.timing(loadingOpacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();

    try {
      // Se j temos coordenadas de destino (selecionado do autocomplete), usar diretamente
      // Caso contrrio, fazer geocode do texto digitado
      let destinationCoords = destination;
      if (!destinationCoords) {
        destinationCoords = await geocodeAddress(destinationText.trim());
        setDestination(destinationCoords);
      }

      // Buscar rota com instrues (o SDK vai calcular a rota internamente, mas buscamos para obter os pontos para radares)
      const routeResponse = await getRoute(origin, destinationCoords);
      setRouteData(routeResponse);
      setRoute(routeResponse.route);

      // Extrair pontos da rota
      const routePoints = routeResponse.route.geometry.coordinates.map(
        (coord: number[]) => ({
          latitude: coord[1],
          longitude: coord[0],
        })
      );

      // Limpar estado de radares para nova navegao (cada viagem comea "limpa")
      passedRadarIds.current.clear();
      alertedRadarIds.current.clear();
      lastCalculatedDistance.current = 0;
      radarZeroTimeRef2.current = null;

      // Iniciar navegao IMEDIATAMENTE (no esperar radares)
      setIsNavigating(true);

      // NOVIDADE: Filtrar imediatamente os radares que j temos na memria para mostrar algo instantneo
      const localFiltered = filterRadarsNearRoute(radars, routePoints, 200);
      if (localFiltered.length > 0) {
        setFilteredRadars(localFiltered);
      }

      // Fechar loading rapidamente
      Animated.timing(loadingOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setIsPreparingNavigation(false);
        loadingOpacity.setValue(0);
      });

      // Buscar radares em BACKGROUND (no bloqueia navegao)
      getRadarsNearRoute({
        route: routePoints,
        radius: 250, // Aumentado para 250m para ser mais abrangente
      })
        .then((nearbyRadars) => {
          // Filtrar radares que esto realmente prximos da rota
          const filteredFromApi = filterRadarsNearRoute(nearbyRadars, routePoints, 250);

          // UNIR: Manter o que j temos localmente (especialmente reportes recentes) e adicionar os novos
          setRadars((prev) => {
            const existingIds = new Set(prev.map(r => r.id));
            const newRadars = filteredFromApi.filter(r => !existingIds.has(r.id));
            return [...newRadars, ...prev]; // Prepor novos para prioridade, mas manter locais
          });

          setFilteredRadars((prev) => {
            const existingIds = new Set(prev.map(r => r.id));
            const newFiltered = filteredFromApi.filter(r => !existingIds.has(r.id));
            return [...newFiltered, ...prev];
          });

          console.log(
            ` ${filteredFromApi.length} radares da API injetados na lista (total filtrado)`
          );
        })
        .catch((error: any) => {
          // Fallback simples: usar localizao atual se busca falhar
          console.warn("Erro ao buscar radares na rota, usando fallback:", error);
          getRadarsNearLocation(origin.latitude, origin.longitude, 1000)
            .then((fallbackRadars) => {
              const filtered = filterRadarsNearRoute(
                fallbackRadars,
                routePoints,
                250
              );
              setRadars(prev => [...filtered.filter(r => !prev.some(p => p.id === r.id)), ...prev]);
              setFilteredRadars(prev => [...filtered.filter(r => !prev.some(p => p.id === r.id)), ...prev]);
              console.log(` ${filtered.length} radares (fallback)`);
            })
            .catch((err) => {
              console.error("Erro no fallback de radares:", err);
            });
        });
    } catch (error: any) {
      console.error("Erro ao buscar rota:", error);
      // Resetar animao em caso de erro
      Animated.timing(loadingOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setIsPreparingNavigation(false);
        loadingOpacity.setValue(0);
      });
      Alert.alert(
        "Erro",
        error.message ||
        "No foi possvel calcular a rota. Verifique o endereo digitado."
      );
    } finally {
      setLoading(false);
      setGeocoding(false);
    }
  };

  // Buscar radares quando a localizao muda (mapa normal)
  useEffect(() => {
    if (!currentLocation || isNavigating) return;

    // Buscar radares prximos  localizao atual
    const fetchRadars = async () => {
      try {
        const nearbyRadars = await getRadarsNearLocation(
          currentLocation.latitude,
          currentLocation.longitude,
          1000 // raio de 1km
        );
        setRadars(nearbyRadars);
        console.log(` ${nearbyRadars.length} radares encontrados prximos`);
      } catch (error) {
        console.error("Erro ao buscar radares:", error);
      }
    };

    fetchRadars();
  }, [currentLocation?.latitude, currentLocation?.longitude, isNavigating]);

  // Monitorar localizao apenas quando no est navegando (o SDK cuida durante navegao)
  useEffect(() => {
    if (!currentLocation || isNavigating) return;

    // Limpar watch anterior se existir
    if (locationWatchRef.current?.watchId) {
      getGeolocation().clearWatch(locationWatchRef.current.watchId);
    }

    const watchId = getGeolocation().watchPosition(
      (position: { coords: { latitude: number; longitude: number } }) => {
        const currentPos: LatLng = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCurrentLocation(currentPos);
      },
      (error: unknown) => {
        console.error("Erro ao monitorar localizao:", error);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 50,
        interval: 5000,
        fastestInterval: 3000,
        forceLocationManager: true,
      }
    );

    if (!locationWatchRef.current) {
      locationWatchRef.current = { watchId, lastRadarFetch: 0 };
    } else {
      locationWatchRef.current.watchId = watchId;
    }

    return () => {
      if (locationWatchRef.current?.watchId) {
        getGeolocation().clearWatch(locationWatchRef.current.watchId);
      }
      if (locationUpdateDebounce.current) {
        clearTimeout(locationUpdateDebounce.current);
      }
    };
  }, [isNavigating]);

  const handleDestinationSelect = async (address: string, coords: LatLng) => {
    setDestinationText(address);
    setDestination(coords);
  };

  // Reportar radar na localizao atual (modal: velocidade + tipo).
  // Futuro: mesma lgica pode ser usada para reportar acidentes, trnsito, etc. (estilo Waze)  por ora s radar.
  const handleReportRadar = async (opts?: {
    speedLimit?: number;
    type?: "reportado" | "fixo" | "mvel" | "semaforo";
  }) => {

    const speedLimit =
      opts?.speedLimit ?? reportSelectedSpeed;
    const type = opts?.type ?? reportRadarType;

    // Validao: velocidade obrigatria e mximo 120 km/h
    if (!speedLimit || isNaN(speedLimit)) {
      Alert.alert("Ateno", "Por favor, selecione a velocidade do radar");
      return;
    }
    if (speedLimit > 120) {
      Alert.alert("Ateno", "A velocidade mxima permitida  120 km/h");
      return;
    }

    setIsReportingRadar(true);
    setShowReportModal(false);

    try {
      // Define precisely which coordinate to use
      let reportCoords: LatLng | null = null;

      console.log(" [Report] Iniciando reporte. Modo:", reportLocationMode);

      if (reportLocationMode === "map") {
        if (reportCustomLocation) {
          reportCoords = reportCustomLocation;
          console.log(" [Report] USANDO PIN DO MAPA:", reportCoords);
        } else {
          Alert.alert("Erro", "Por favor, selecione uma localizao no mapa primeiro");
          setIsReportingRadar(false);
          return;
        }
      } else {
        // Modo padro: localizao atual
        if (currentLocation) {
          reportCoords = {
            latitude: Number(currentLocation.latitude),
            longitude: Number(currentLocation.longitude)
          };
          console.log(` [Report] MODO ATUAL - USANDO GPS: ${reportCoords.latitude}, ${reportCoords.longitude}`);
        } else {
          Alert.alert("Erro", "Sua localizao atual no est disponvel. Tente marcar no mapa.");
          setIsReportingRadar(false);
          return;
        }
      }

      if (!reportCoords) {
        Alert.alert("Erro", "Localizao invlida para o reporte.");
        setIsReportingRadar(false);
        return;
      }

      console.log(` [Report] Enviando para API: Tipo=${type}, Velocidade=${speedLimit}, Lat=${reportCoords.latitude}, Lon=${reportCoords.longitude}`);

      const newRadar = await reportRadar({
        latitude: reportCoords.latitude,
        longitude: reportCoords.longitude,
        speedLimit: speedLimit,
        type,
      });

      // Verificar se  um radar temporrio (salvo localmente)
      const isLocalRadar = newRadar.id.startsWith("temp_");

      // Adicionar o radar reportado  lista local imediatamente (PREPOR para prioridade)
      setRadars((prev) => {
        // Verificar se j existe para evitar duplicatas
        const exists = prev.some((r) => r.id === newRadar.id);
        if (exists) return prev;
        return [newRadar, ...prev];
      });

      // Se estiver navegando, tambm adicionar aos radares filtrados (PREPOR para prioridade)
      if (isNavigating && routeData) {
        setFilteredRadars((prev) => {
          const exists = prev.some((r) => r.id === newRadar.id);
          if (exists) return prev;
          return [newRadar, ...prev];
        });
      }

      // Mostrar modal de sucesso (auto-dismiss 5s)
      if (isLocalRadar) {
        setSuccessMessage("Radar salvo localmente! \n\nEle aparecer no mapa e ser sincronizado quando o servidor estiver disponvel.");
      } else {
        setSuccessMessage("Radar reportado com sucesso! \n\nOutros usurios j podem v-lo no mapa.");
      }
      setShowSuccessModal(true);

      // Auto-dismiss aps 5 segundos
      setTimeout(() => {
        setShowSuccessModal(false);
      }, 5000);

      setReportSpeedLimit("");
      setReportRadarType("mvel" as const);
    } catch (error: any) {
      console.error("Erro ao reportar radar:", error);

      // Radares somente via API - sem fallback local
      if (
        error?.message?.includes("404") ||
        error?.message?.includes("Network")
      ) {
        Alert.alert(
          "Servidor indisponvel",
          "No foi possvel reportar o radar. Verifique sua conexo e tente novamente."
        );
        return;
      }

      Alert.alert(
        "Erro",
        error.message || "No foi possvel reportar o radar. Tente novamente."
      );
    } finally {
      setIsReportingRadar(false);
    }
  };

  // Sincronizar radares reportados recentemente (em tempo real)
  const syncRecentRadars = useCallback(async () => {
    if (!isNavigating) return;

    try {
      const recentRadars = await getRecentRadars(lastSyncTimeRef.current);

      if (recentRadars.length > 0) {
        console.log(` ${recentRadars.length} novos radares sincronizados`);

        // Adicionar novos radares  lista
        setRadars((prev) => {
          const existingIds = new Set(prev.map((r) => r.id));
          const newRadars = recentRadars.filter((r) => !existingIds.has(r.id));

          if (newRadars.length > 0) {
            return [...prev, ...newRadars];
          }
          return prev;
        });

        // Se estiver navegando, tambm adicionar aos radares filtrados
        if (routeData && routeData.route?.geometry?.coordinates) {
          const routePoints = routeData.route.geometry.coordinates.map(
            (coord: number[]) => ({
              latitude: coord[1],
              longitude: coord[0],
            })
          );

          const filtered = filterRadarsNearRoute(
            recentRadars,
            routePoints,
            100
          );

          if (filtered.length > 0) {
            setFilteredRadars((prev) => {
              const existingIds = new Set(prev.map((r) => r.id));
              const newFiltered = filtered.filter(
                (r) => !existingIds.has(r.id)
              );

              if (newFiltered.length > 0) {
                return [...prev, ...newFiltered];
              }
              return prev;
            });
          }
        }
      }

      lastSyncTimeRef.current = Date.now();
    } catch (error) {
      console.error("Erro ao sincronizar radares recentes:", error);
    }
  }, [isNavigating, routeData]);

  // Iniciar sincronizao em tempo real quando comear a navegar
  useEffect(() => {
    if (isNavigating) {
      // Sincronizar imediatamente
      syncRecentRadars();

      // Sincronizar a cada 15 segundos
      syncIntervalRef.current = setInterval(() => {
        syncRecentRadars();
      }, 15000); // 15 segundos
    } else {
      // Parar sincronizao quando parar de navegar
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    }

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [isNavigating, syncRecentRadars]);

  // Carregar MapboxNavigation s quando entrar em navegao (evita "Requiring unknown module 'undefined'" no bundle)
  useEffect(() => {
    if (!isNavigating || MapboxNavComponent) return;
    try {
      const M = require("@pawan-pk/react-native-mapbox-navigation").default;
      setMapboxNavComponent(() => M);
      setMapboxNavError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMapboxNavError(msg);
      console.warn("MapboxNavigation no disponvel:", e);
    }
  }, [isNavigating, MapboxNavComponent]);

  // Manter refs atualizados para o handler do Socket.IO (evitar closure obsoleta durante navegao)
  isNavigatingRef.current = isNavigating;
  routeDataRef.current = routeData;

  // Preparar radares para o MapboxNavigation (sempre calcular, mesmo quando no est navegando)
  const mapboxRadars = useMemo(() => {
    // Se filteredRadars estiver vazio (ex: carregando rota), usar radars globais como fallback instantneo
    const list = filteredRadars.length > 0 ? filteredRadars : radars;
    return list.map((r) => ({
      id: r.id,
      latitude: r.latitude,
      longitude: r.longitude,
      speedLimit: r.speedLimit,
      type: r.type, // Passar tipo do radar para o componente nativo
    }));
  }, [filteredRadars, radars]);

  // WebSocket nativo: radares em tempo real para todos (mapa e navegao), inclusive durante navegao
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    const connectWebSocket = () => {
      try {
        const wsUrl = API_BASE_URL.replace(/^https?:\/\//, "").replace(
          /\/$/,
          ""
        );
        const protocol = API_BASE_URL.startsWith("https") ? "wss" : "ws";
        ws = new WebSocket(`${protocol}://${wsUrl}/ws`);

        ws.onopen = () => {
          console.log(
            "WebSocket conectado para alertas de radares em tempo real"
          );
          reconnectAttempts = 0;
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            const { event: eventName, data: payload } = message;

            if (eventName === "radar:new") {
              const radar: Radar = {
                id: payload.id,
                latitude: payload.latitude,
                longitude: payload.longitude,
                speedLimit: payload.velocidadeLeve ?? undefined,
                type: payload.tipoRadar ?? "unknown",
                situacao: payload.situacao ?? undefined,
              };

              /* console.log(
                ` WebSocket: Novo radar recebido durante ${isNavigatingRef.current ? "navegao" : "mapa"
                }:`,
                radar.id
              ); */

              // Sempre adicionar ao estado principal de radares
              setRadars((prev) => {
                if (prev.some((r) => r.id === radar.id)) {
                  return prev; // J existe, no adicionar novamente
                }
                return [...prev, radar];
              });

              // Durante navegao: filtrar pela rota e adicionar ao filteredRadars
              const nav = isNavigatingRef.current;
              const rd = routeDataRef.current;
              if (nav && rd?.route?.geometry?.coordinates) {
                const routePoints = rd.route.geometry.coordinates.map(
                  (c: number[]) => ({ latitude: c[1], longitude: c[0] })
                );
                const near = filterRadarsNearRoute([radar], routePoints, 100);
                if (near.length > 0) {
                  /* console.log(
                    ` Radar ${radar.id} est prximo  rota, adicionando ao filteredRadars`
                  ); */
                  setFilteredRadars((prev) => {
                    if (prev.some((r) => r.id === radar.id)) {
                      return prev; // J existe
                    }
                    const updated = [...prev, radar];
                    /* console.log(
                      ` filteredRadars atualizado: ${updated.length} radares`
                    ); */
                    return updated;
                  });
                } else {
                  /* console.log(
                    ` Radar ${radar.id} no est prximo  rota (distncia > 100m)`
                  ); */
                }
              } else {
                // No est navegando: adicionar diretamente ao filteredRadars
                /* console.log(
                  ` Adicionando radar ao filteredRadars (no est navegando)`
                ); */
                setFilteredRadars((prev) => {
                  if (prev.some((r) => r.id === radar.id)) {
                    return prev; // J existe
                  }
                  return [...prev, radar];
                });
              }
            } else if (eventName === "radar:update") {
              const radar: Radar = {
                id: payload.id,
                latitude: payload.latitude,
                longitude: payload.longitude,
                speedLimit: payload.velocidadeLeve ?? undefined,
                type: payload.tipoRadar ?? "unknown",
                situacao: payload.situacao ?? undefined,
              };

              // console.log(` WebSocket: Radar atualizado:`, radar.id);

              // Atualizar em ambos os estados
              setRadars((prev) =>
                prev.map((r) => (r.id === radar.id ? radar : r))
              );
              setFilteredRadars((prev) => {
                const updated = prev.map((r) =>
                  r.id === radar.id ? radar : r
                );
                /* console.log(
                  ` filteredRadars atualizado aps update: ${updated.length} radares`
                ); */
                return updated;
              });
            } else if (eventName === "radar:delete") {
              const radarId = payload.id;
              // console.log(` WebSocket: Radar deletado/inativado:`, radarId);

              // Remover de ambos os estados
              setRadars((prev) => {
                const updated = prev.filter((r) => r.id !== radarId);
                /* console.log(
                  ` Radar removido de radars: ${updated.length} radares restantes`
                ); */
                return updated;
              });
              setFilteredRadars((prev) => {
                const updated = prev.filter((r) => r.id !== radarId);
                /* console.log(
                  ` Radar removido de filteredRadars: ${updated.length} radares restantes`
                ); */
                return updated;
              });
            } else if (eventName === "connected") {
              console.log(" WebSocket conectado:", payload.message);
            }
          } catch (e) {
            console.warn("Erro ao processar mensagem WebSocket:", e);
          }
        };

        ws.onerror = (error) => {
          console.warn("Erro WebSocket:", error);
        };

        ws.onclose = () => {
          console.log("WebSocket desconectado");
          ws = null;

          // Tentar reconectar
          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const delay = Math.min(
              1000 * Math.pow(2, reconnectAttempts),
              30000
            ); // Backoff exponencial, max 30s
            reconnectTimeout = setTimeout(() => {
              console.log(
                `Tentando reconectar WebSocket (tentativa ${reconnectAttempts}/${maxReconnectAttempts})...`
              );
              connectWebSocket();
            }, delay);
          }
        };
      } catch (e) {
        console.warn("WebSocket no disponvel para alertas em tempo real:", e);
      }
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.close();
        ws = null;
      }
    };
  }, []);

  // Memoizar converso de Set para Array para evitar nova referncia a cada render
  const nearbyRadarIdsArray = useMemo(() => Array.from(nearbyRadarIds), [nearbyRadarIds]);

  // Handler para mudana de localizao (memoizado)
  const handleLocationChange = useCallback((location: any) => {
    if (!location || location.latitude == null || location.longitude == null) return;

    try {
      const now = Date.now();
      const newLat = Number(location.latitude);
      const newLng = Number(location.longitude);

      // Debounce location state update for UI stability
      if (locationUpdateDebounce.current) clearTimeout(locationUpdateDebounce.current);
      locationUpdateDebounce.current = setTimeout(() => {
        try {
          if (currentLocation) {
            const distance = calculateDistance(currentLocation.latitude, currentLocation.longitude, newLat, newLng);
            if (distance < 20) return; // Ignore small noise
            if (distance > 100 && now - lastLocationUpdate.current < 2000) return; // Ignore GPS jumps
          }
          setCurrentLocation({ latitude: newLat, longitude: newLng });
          lastLocationUpdate.current = now;
        } catch (error) {
          console.error("Erro ao processar localizao:", error);
        }
      }, 1000);

      const hideModal = () => {
        Animated.parallel([
          Animated.timing(modalOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.timing(modalScale, { toValue: 0.8, duration: 300, useNativeDriver: true }),
        ]).start(() => setNearestRadar(null));
      };

      const checkRadarDistance = () => {
        try {
          const lat = Number(location.latitude);
          const lng = Number(location.longitude);

          // Scalability: Only recalculate heavy routing if moved > 5m
          if (lastCalculatedDistance.current > 0) {
            // We use lastCalculatedDistance as a proxy for 'has a radar we are tracking'
          }

          if (filteredRadars.length === 0 || !routeDataRef.current?.route?.geometry?.coordinates) {
            if (nearestRadar) hideModal();
            return;
          }

          const routePoints = routeDataRef.current.route.geometry.coordinates.map((c: any) => ({
            latitude: Number(c[1]),
            longitude: Number(c[0])
          }));

          // Scalability: Radial proximity filter (2km)
          const candidates = filteredRadars.filter(r => {
            if (passedRadarIds.current.has(r.id)) return false;
            return Math.abs(Number(r.latitude) - lat) < 0.02 && Math.abs(Number(r.longitude) - lng) < 0.02;
          });

          if (candidates.length === 0) {
            if (nearestRadar) hideModal();
            return;
          }

          let bestMatch: { radar: Radar; distance: number } | null = null;
          let minDistance = Infinity;

          for (const radar of candidates) {
            const { distance, hasPassed } = calculateDistanceAlongRoute(
              { latitude: lat, longitude: lng },
              { latitude: Number(radar.latitude), longitude: Number(radar.longitude) },
              routePoints
            );

            if (hasPassed) {
              passedRadarIds.current.add(radar.id);
              continue;
            }

            if (distance < 1000 && distance < minDistance) {
              minDistance = distance;
              bestMatch = { radar, distance };
            }
          }

          if (bestMatch) {
            const { radar, distance } = bestMatch;

            // Optimization: Avoid redundant state updates
            if (nearestRadar?.radar.id === radar.id && Math.abs(distance - lastCalculatedDistance.current) < 5) {
              return;
            }
            lastCalculatedDistance.current = distance;

            setNearestRadar({ radar, distance });
            setNearbyRadarIds(new Set([radar.id]));

            if (!nearestRadar) {
              Animated.parallel([
                Animated.spring(modalOpacity, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
                Animated.spring(modalScale, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
              ]).start();
            }

            // TTS Alert logic
            if (!alertedRadarIds.current.has(radar.id) && distance <= 300) {
              alertedRadarIds.current.add(radar.id);
              const type = radar.type?.toLowerCase() || "";
              let radarLabel = "Radar";
              if (type.includes("semaforo")) radarLabel = "Radar Semafrico";
              else if (type.includes("fixo")) radarLabel = "Radar Fixo";

              const msg = `${radarLabel} a ${Math.round(distance)} metros. ${radar.speedLimit ? `Limite ${radar.speedLimit}` : ""}`;
              const Tts = getTts();
              if (Tts) Tts.speak(msg);
            }
          } else if (nearestRadar) {
            hideModal();
          }
        } catch (err) {
          console.error("Erro em checkRadarDistance:", err);
        }
      };

      if (radarCheckDebounce.current) clearTimeout(radarCheckDebounce.current);
      radarCheckDebounce.current = setTimeout(checkRadarDistance, 400); // Throttled for scalability
    } catch (error) {
      console.error("Erro no callback onLocationChange:", error);
    }
  }, [filteredRadars, currentLocation, nearestRadar, modalScale, modalOpacity, routeData]);

  // Handlers memoizados para evitar re-creates
  const handleRouteProgressChange = useCallback((progress: any) => {
    if (!progress) return;
  }, []);

  const handleArrive = useCallback(() => {
    Alert.alert("Chegada", "Voc chegou ao destino!");
    if (locationUpdateDebounce.current) {
      clearTimeout(locationUpdateDebounce.current);
      locationUpdateDebounce.current = null;
    }
    passedRadarIds.current.clear();
    alertedRadarIds.current.clear();
    setNearestRadar(null);
    setNearbyRadarIds(new Set());
    setIsNavigating(false);
    setIsPreparingNavigation(false);
    setRouteData(null);
    setRoute(null);
  }, []);

  const handleCancelNavigation = useCallback(() => {
    if (locationUpdateDebounce.current) {
      clearTimeout(locationUpdateDebounce.current);
      locationUpdateDebounce.current = null;
    }
    passedRadarIds.current.clear();
    alertedRadarIds.current.clear();
    setNearestRadar(null);
    setNearbyRadarIds(new Set());
    setIsNavigating(false);
    setIsPreparingNavigation(false);
    setRouteData(null);
    setRoute(null);
  }, []);

  const handleError = useCallback((error: any) => {
    try {
      if (!error) {
        return;
      }
      console.error("Erro na navegao:", error);
      const errorMessage =
        error?.message ||
        error?.toString() ||
        "Erro na navegao";
      Alert.alert("Erro", errorMessage);
    } catch (e) {
      console.error("Erro ao processar erro de navegao:", e);
    }
  }, []);

  // Handler para selecionar rota alternativa (vinda do evento nativo)
  const handleRouteAlternativeSelected = useCallback((event: any) => {
    console.log("Rota alternativa selecionada via evento nativo!");
    // Adicionar log visual ou toast se necessrio
  }, []);

  useEffect(() => {
    if (isNavigating && !isPreparingNavigation && mapboxRadars) {
      // Pr-aquecer ou validar dados se necessrio
    }
  }, [isNavigating, isPreparingNavigation, mapboxRadars]);

  // Render do MapboxNavComponent com props memoizadas
  // Simplificado para evitar erros de renderizao
  const navigationView = useMemo(() => {
    if (!MapboxNavComponent || !isNavigating || !origin || !destination) return null;

    return (
      <MapboxNavComponent
        style={StyleSheet.absoluteFill}
        startOrigin={{
          latitude: origin.latitude,
          longitude: origin.longitude,
        }}
        destination={{
          latitude: destination.latitude,
          longitude: destination.longitude,
          title: destinationText || "Destino",
        }}
        distanceUnit="metric"
        language="pt-BR"
        // @ts-ignore
        radars={mapboxRadars}
        // @ts-ignore
        nearbyRadarIds={nearbyRadarIdsArray}
        // @ts-ignore
        bottomPadding={
          nearestRadar ? (Platform.OS === "ios" ? 180 : 240) : 0
        }
        onLocationChange={handleLocationChange}
        onRouteProgressChange={handleRouteProgressChange}
        onArrive={handleArrive}
        onCancelNavigation={handleCancelNavigation}
        onError={handleError}
        // @ts-ignore
        onRouteAlternativeSelected={handleRouteAlternativeSelected}
      />
    );
  }, [
    MapboxNavComponent, isNavigating, origin, destination, destinationText,
    mapboxRadars, nearbyRadarIdsArray, nearestRadar,
    handleLocationChange, handleRouteProgressChange, handleArrive, handleCancelNavigation, handleError, handleRouteAlternativeSelected
  ]);

  return (
    <View style={styles.container}>
      {onOpenEditor && !isNavigating && !isPreparingNavigation && (
        <TouchableOpacity
          style={styles.editorButton}
          onPress={onOpenEditor}
          activeOpacity={0.8}
        >
          <Text style={styles.editorButtonText}>Editor de radares</Text>
        </TouchableOpacity>
      )}
      {!isNavigating && !isPreparingNavigation && (
        <SearchContainer
          origin={origin}
          destinationText={destinationText}
          onDestinationChange={setDestinationText}
          onDestinationSelect={handleDestinationSelect}
          onSearchRoute={handleSearchRoute}
          loading={loading}
          geocoding={geocoding}
          radarsCount={radars.length}
        />
      )}

      {/* Animao de loading durante preparao da navegao */}
      {isPreparingNavigation && (
        <Animated.View
          style={[
            styles.loadingOverlay,
            {
              opacity: loadingOpacity,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.loadingContainer,
              {
                transform: [{ scale: loadingScale }],
              },
            ]}
          >
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Preparando navegao...</Text>
            <Text style={styles.loadingSubtext}>Aguarde um momento</Text>
          </Animated.View>
        </Animated.View>
      )}

      {isNavigating && origin && destination && !isPreparingNavigation ? (
        <View style={styles.mapContainer}>
          {mapboxNavError ? (
            <View style={styles.loadingOverlay}>
              <Text style={styles.loadingText}>Erro ao carregar navegao</Text>
              <Text style={styles.loadingSubtext}>{mapboxNavError}</Text>
            </View>
          ) : MapboxNavComponent ? (
            <>
              {navigationView}

              {/* Boto de reportar radar - abre modal com velocidade e tipo */}
              <TouchableOpacity
                style={styles.reportRadarButton}
                onPress={() => setShowReportModal(true)}
                disabled={isReportingRadar}
                activeOpacity={0.7}
              >
                {isReportingRadar ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (

                  <Image
                    source={require("../assets/images/reportIcon.png")}
                    style={styles.reportRadarButtonImage}
                    resizeMode="contain"
                  />

                )}
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.loadingText}>Carregando navegao...</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.mapContainer} pointerEvents="box-none">
          <Suspense
            fallback={
              <View
                style={[
                  styles.mapContainer,
                  { justifyContent: "center", alignItems: "center" },
                ]}
              >
                <ActivityIndicator size="large" color="#3b82f6" />
              </View>
            }
          >
            <MapComponent
              radars={radars}
              route={route}
              isNavigating={false}
              currentLocation={currentLocation}
              nearbyRadarIds={nearbyRadarIds}
            />
          </Suspense>
        </View>
      )}

      {/* Alerta de radar - Modal animado no topo */}
      {isNavigating &&
        nearestRadar &&
        (() => {
          console.log(
            ` Renderizando modal: isNavigating=${isNavigating}, nearestRadar=${!!nearestRadar}, distance=${nearestRadar.distance
            }m`
          );
          return null;
        })()}
      {isNavigating && nearestRadar && (
        <Animated.View
          style={[
            styles.radarAlertContainer,
            {
              opacity: modalOpacity,
              transform: [
                {
                  translateY: modalOpacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-100, 0],
                  }),
                },
                {
                  scale: modalScale,
                },
              ],
            },
          ]}
          pointerEvents="none"
        >
          <Animated.View
            style={[
              styles.radarAlertContent,
              {
                backgroundColor:
                  nearestRadar.distance <= 30
                    ? "rgba(255,255,255,1)" // Transparente quando muito prximo
                    : nearestRadar.distance <= 100
                      ? "rgba(255,255,255,1)" // Transparente quando prximo
                      : "rgba(255,255,255,1)", // Transparente quando distante
              },
            ]}
          >
            <View style={styles.radarIconContainer}>
              {(() => {
                const type = nearestRadar.radar.type ? nearestRadar.radar.type.toLowerCase() : "";
                let iconSource = radarImages.radar;

                if (type.includes("semaforo") || type.includes("camera") || type.includes("fotografica")) {
                  iconSource = radarImages.radarSemaforico;
                } else if (type.includes("movel") || type.includes("mobile")) {
                  iconSource = radarImages.radarMovel;
                } else if (type.includes("fixo") || type.includes("placa")) {
                  iconSource = radarImages[getClosestPlacaName(nearestRadar.radar.speedLimit)];
                }

                return <Image source={iconSource} style={styles.radarAlertIconLarge} />;
              })()}
            </View>
            <View style={styles.radarAlertTextContainer}>
              <Text style={styles.radarAlertTitle}>
                {(() => {
                  const type = nearestRadar.radar.type ? nearestRadar.radar.type.toLowerCase() : "";
                  let typeName = "Radar";
                  if (type.includes("semaforo")) typeName = "Radar Semafrico";
                  else if (type.includes("movel")) typeName = "Radar Mvel";
                  else if (type.includes("fixo") || type.includes("placa")) typeName = "Radar Fixo";

                  return nearestRadar.distance <= 30
                    ? `${typeName} Prximo!`
                    : `${typeName} a frente`;
                })()}
              </Text>
              <Text style={styles.radarAlertDistance}>
                {nearestRadar.distance < 10
                  ? "0m"
                  : `${nearestRadar.distance}m`}
                {nearestRadar.radar.speedLimit && (
                  <Text style={styles.radarAlertSpeed}>
                    {"  "}
                    {nearestRadar.radar.speedLimit} km/h
                  </Text>
                )}
              </Text>
            </View>
          </Animated.View>
        </Animated.View>
      )}

      {/* Modal: Reportar radar (Multi-step, button-based for safety while driving) */}
      <Modal
        visible={showReportModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowReportModal(false);
          setReportStep(1);
          setReportSelectedSpeed(null);
          setReportRadarType("mvel");
        }}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.reportModalOverlay}
          onPress={() => {
            setShowReportModal(false);
            setReportStep(1);
          }}
        >
          <View
            style={styles.reportModalContent}
            onStartShouldSetResponder={() => true}
          >
            {/* Progress indicator */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {[1, 2, 3].map((step) => (
                <View
                  key={step}
                  style={{
                    flex: 1,
                    height: 4,
                    backgroundColor: reportStep >= step ? "#3b82f6" : "#e5e7eb",
                    borderRadius: 2,
                  }}
                />
              ))}
            </View>

            <Text style={styles.reportModalTitle}>
              {reportStep === 1 && "O que voc est vendo?"}
              {reportStep === 2 && "Qual o limite de velocidade?"}
              {reportStep === 3 && "Onde est localizado?"}
            </Text>

            <Text style={styles.reportModalSubtitle}>
              {reportStep === 1 && "Selecione o tipo de radar"}
              {reportStep === 2 && "Toque no limite (km/h)"}
              {reportStep === 3 && "Escolha a localizao"}
            </Text>

            {/* Step 1: Radar Type Selection */}
            {reportStep === 1 && (
              <View style={styles.reportModalTypeGrid}>
                {REPORT_RADAR_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.value}
                    style={[
                      styles.reportModalTypeCard,
                      reportRadarType === t.value &&
                      styles.reportModalTypeCardActive,
                    ]}
                    onPress={() => setReportRadarType(t.value)}
                    activeOpacity={0.7}
                  >
                    <Image
                      source={t.icon}
                      style={styles.reportModalTypeIcon}
                      resizeMode="contain"
                    />
                    <Text
                      style={[
                        styles.reportModalTypeCardText,
                        reportRadarType === t.value &&
                        styles.reportModalTypeCardTextActive,
                      ]}
                      numberOfLines={2}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Step 2: Speed Limit Selection */}
            {reportStep === 2 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginVertical: 16 }}>
                {[30, 40, 50, 60, 70, 80, 90, 100, 110, 120].map((speed) => (
                  <TouchableOpacity
                    key={speed}
                    style={{
                      width: "30%",
                      padding: 16,
                      backgroundColor: reportSelectedSpeed === speed ? "#3b82f6" : "#f3f4f6",
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor: reportSelectedSpeed === speed ? "#3b82f6" : "#e5e7eb",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onPress={() => setReportSelectedSpeed(speed)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={{
                        fontSize: 24,
                        fontWeight: "700",
                        color: reportSelectedSpeed === speed ? "#fff" : "#1f2937",
                      }}
                    >
                      {speed}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Step 3: Location Selection */}
            {reportStep === 3 && (
              <View style={{ gap: 12, marginVertical: 22 }}>
                {/* Current Location (Default) */}
                <TouchableOpacity
                  style={{
                    padding: 16,
                    backgroundColor: reportLocationMode === "current" ? "#3b82f6" : "#f3f4f6",
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: reportLocationMode === "current" ? "#3b82f6" : "#e5e7eb",
                  }}
                  onPress={() => {
                    setReportLocationMode("current");
                    setReportCustomLocation(null);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <Ionicons
                      name="location"
                      size={20}
                      color={reportLocationMode === "current" ? "#fff" : "#3b82f6"}
                    />
                    <Text style={{ fontSize: 16, fontWeight: "600", color: reportLocationMode === "current" ? "#fff" : "#1f2937" }}>
                      Usar Localizao Atual
                    </Text>
                  </View>
                </TouchableOpacity>



                {/* Map Pin */}
                <TouchableOpacity
                  style={{
                    padding: 16,
                    backgroundColor: reportLocationMode === "map" ? "#3b82f6" : "#f3f4f6",
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: reportLocationMode === "map" ? "#3b82f6" : "#e5e7eb",
                  }}
                  onPress={() => {
                    setShowMapPicker(true);
                    // Force a clean object to avoid any potential corruption
                    const initialLoc = currentLocation
                      ? { latitude: currentLocation.latitude, longitude: currentLocation.longitude }
                      : { latitude: -23.550520, longitude: -46.633308 };
                    setMapPickerCenter(initialLoc);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <Ionicons
                      name="map"
                      size={20}
                      color={reportLocationMode === "map" ? "#fff" : "#3b82f6"}
                    />
                    <Text style={{ fontSize: 16, fontWeight: "600", color: reportLocationMode === "map" ? "#fff" : "#1f2937" }}>
                      Marcar no Mapa
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* Navigation Buttons */}
            <View style={styles.reportModalButtons}>
              {reportStep > 1 && (
                <TouchableOpacity
                  style={[styles.reportModalCancel, { flex: 1 }]}
                  onPress={() => setReportStep((prev) => Math.max(1, prev - 1) as 1 | 2 | 3)}
                >
                  <Text style={styles.reportModalCancelText}> Voltar</Text>
                </TouchableOpacity>
              )}

              {reportStep < 3 ? (
                <TouchableOpacity
                  style={[styles.reportModalSubmit, { flex: 1 }]}
                  onPress={() => {
                    if (reportStep === 1 && reportRadarType) {
                      setReportStep(2);
                    } else if (reportStep === 2 && reportSelectedSpeed) {
                      setReportStep(3);
                    }
                  }}
                  disabled={reportStep === 1 ? !reportRadarType : !reportSelectedSpeed}
                >
                  <Text style={styles.reportModalSubmitText}>Prximo </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.reportModalSubmit, { flex: 1 }]}
                  onPress={() => handleReportRadar()}
                  disabled={isReportingRadar}
                >
                  <Text style={styles.reportModalSubmitText}>
                    {isReportingRadar ? "Enviando..." : " Reportar"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showMapPicker}
        animationType="slide"
        onRequestClose={() => setShowMapPicker(false)}
      >
        <View style={{ flex: 1 }}>
          {mapPickerCenter && (
            <View style={{ flex: 1, position: "relative" }}>
              {/* Map View for picking location */}
              <Suspense fallback={<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><ActivityIndicator size="large" color="#3b82f6" /></View>}>
                <MapComponent
                  radars={[]} // No radars needed for picker
                  interactive={true}
                  currentLocation={mapPickerCenter}
                  onCameraChanged={(coords: LatLng) => {
                    // "Washing" variables to ensure no hidden corrupted properties survive
                    const cleanLat = Number(coords.latitude);
                    const cleanLng = Number(coords.longitude);
                    const cleanCoords = { latitude: cleanLat, longitude: cleanLng };

                    if (!isNaN(cleanLat) && !isNaN(cleanLng)) {
                      setMapPickerCenter(cleanCoords);
                    }
                  }}
                />
              </Suspense>

              {/* Center Pin Overlay */}
              <View style={{ position: "absolute", top: "50%", left: "50%", marginTop: -40, marginLeft: -20, pointerEvents: "none" }}>
                <Ionicons name="location" size={40} color="#ef4444" />
              </View>

              {/* Control Overlay */}
              <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#fff", padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, shadowColor: "#000", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 }}>
                <Text style={{ fontSize: 14, color: "#6b7280", marginBottom: 12, textAlign: "center" }}>
                  Arraste o mapa para posicionar ou toque no local
                </Text>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity
                    style={{ flex: 1, padding: 16, backgroundColor: "#f3f4f6", borderRadius: 12, alignItems: "center" }}
                    onPress={() => setShowMapPicker(false)}
                  >
                    <Text style={{ fontSize: 16, fontWeight: "600", color: "#374151" }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, padding: 16, backgroundColor: "#3b82f6", borderRadius: 12, alignItems: "center" }}
                    onPress={() => {
                      console.log(" [Home-MapPicker] Confirmando localizao:", mapPickerCenter);
                      setReportCustomLocation(mapPickerCenter);
                      setReportLocationMode("map");
                      setShowMapPicker(false);
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: "600", color: "#fff" }}>Confirmar Localizao</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Modal: Erro ao obter localizao */}
      <Modal
        visible={showLocationErrorModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLocationErrorModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.reportModalOverlay}
          onPress={() => setShowLocationErrorModal(false)}
        >
          <View
            style={[styles.reportModalContent, { maxWidth: 320 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={{ alignItems: "center", marginBottom: 12 }}>
              <Ionicons name="location-outline" size={64} color="#ef4444" style={{ marginBottom: 12 }} />
              <Text style={[styles.reportModalTitle, { textAlign: "center", fontSize: 20 }]}>
                Ops! Localizao Indisponvel
              </Text>
            </View>
            <Text style={[styles.reportModalSubtitle, { textAlign: "center", fontSize: 14, lineHeight: 20, marginBottom: 20 }]}>
              No conseguimos obter sua posio atual. Por favor, verifique se o seu GPS est ligado e tente novamente.
            </Text>
            <TouchableOpacity
              style={[styles.reportModalSubmit, { width: "100%", marginHorizontal: 0 }]}
              onPress={() => {
                setShowLocationErrorModal(false);
                requestLocationPermission();
              }}
            >
              <Text style={styles.reportModalSubmitText}>Tentar Novamente</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal: Sucesso ao reportar (auto-dismiss 5s) */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.reportModalOverlay}
          onPress={() => setShowSuccessModal(false)}
        >
          <View
            style={[styles.reportModalContent, { maxWidth: 320 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={{ alignItems: "center", marginBottom: 12 }}>
              <Ionicons name="checkmark-circle-outline" size={64} color="#10b981" style={{ marginBottom: 12 }} />
              <Text style={[styles.reportModalTitle, { textAlign: "center", fontSize: 20 }]}>
                Obrigado!
              </Text>
            </View>
            <Text style={[styles.reportModalSubtitle, { textAlign: "center", fontSize: 14, lineHeight: 20 }]}>
              {successMessage}
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  radarAlertContainer: {
    position: "absolute",
    // Acima do trip progress: quando o radar aparece a cmera sobe e o trip progress fica embaixo
    bottom: Platform.OS === "ios" ? 300 : 120,
    left: 70,
    right: 16,
    zIndex: 1000,
    elevation: 10,
    pointerEvents: "none",
  },
  radarAlertContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    width: "90%",
    height: "auto",
  },
  radarAlertIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  radarIconContainer: {
    marginRight: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  radarAlertIconLarge: {
    width: 65,
    height: 65,
    resizeMode: "contain",
  },
  radarAlertTextContainer: {
    flex: 1,
  },
  radarAlertTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    marginBottom: 2,
    opacity: 0.9,
  },
  radarAlertDistance: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#000",
  },
  radarAlertSpeed: {
    fontSize: 20,
    fontWeight: "500",
    color: "#000",
  },
  radarCount: {
    marginTop: 8,
    fontSize: 12,
    color: "#000",
    textAlign: "center",
  },
  stopButton: {
    backgroundColor: "#dc2626",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  stopButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  navigationBanner: {
    backgroundColor: "#1f2937",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  navigationInstruction: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  navigationDistance: {
    color: "#9ca3af",
    fontSize: 14,
  },
  mapContainer: {
    flex: 1,
    position: "relative",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    elevation: 9999,
  },
  loadingContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 40,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    minWidth: 200,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
    textAlign: "center",
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
  radarsOverlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: "box-none",
    zIndex: 1,
    elevation: 0, // Android
  },
  reportRadarButton: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 100 : 250,
    right: 20,
    backgroundColor: "#fff",
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 1000,
  },
  reportRadarButtonImage: {
    width: 65,
    height: 65,
  },

  reportModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  reportModalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 360,
  },
  reportModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 4,
  },
  reportModalSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 16,
  },
  reportModalLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 6,
  },
  reportModalInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
    color: "#000",
  },
  reportModalTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 20,
  },
  reportModalTypeCard: {
    width: "48%",
    minWidth: 130,
    maxWidth: 200,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    borderWidth: 2,
    borderColor: "transparent",
  },
  reportModalTypeCardActive: {
    backgroundColor: "#eff6ff",
    borderColor: "#3b82f6",
  },
  reportModalTypeIcon: {
    width: 36,
    height: 36,
    marginRight: 12,
  },
  reportModalTypeCardText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  reportModalTypeCardText2: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  reportModalTypeCardTextActive: {
    color: "#1d4ed8",
  },
  reportModalButtons: {
    flexDirection: "row",
    gap: 8,
  },
  reportModalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
  },
  reportModalCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  reportModalSubmit: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  reportModalSubmitText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },
  editorButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 48,
    right: 16,
    zIndex: 100,
    backgroundColor: "#1f2937",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  editorButtonText: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "600",
  },
});

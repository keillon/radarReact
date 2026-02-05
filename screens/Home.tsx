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
      throw new Error("react-native-geolocation-service não disponível");
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
// TTS: carregar só no primeiro uso para evitar "Requiring unknown module 'undefined'" no startup
let TtsCache: any = undefined; // undefined = ainda não tentou; null = tentou e falhou
function getTts(): any {
  if (TtsCache !== undefined) return TtsCache;
  try {
    const TtsModule = require("react-native-tts");
    TtsCache = TtsModule.default || TtsModule;
  } catch (error) {
    console.warn("react-native-tts não está disponível:", error);
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

// Função para calcular distância entre dois pontos (Haversine)
const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3; // Raio da Terra em metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

// Função auxiliar para calcular distância ponto-reta (Cross-Track Distance)
const getDistanceFromLine = (pt: any, v: any, w: any) => {
  const l2 = (w[0] - v[0]) ** 2 + (w[1] - v[1]) ** 2;
  if (l2 === 0) return Math.sqrt((pt[0] - v[0]) ** 2 + (pt[1] - v[1]) ** 2);
  let t = ((pt[0] - v[0]) * (w[0] - v[0]) + (pt[1] - v[1]) * (w[1] - v[1])) / l2;
  t = Math.max(0, Math.min(1, t));
  const projectionX = v[0] + t * (w[0] - v[0]);
  const projectionY = v[1] + t * (w[1] - v[1]);
  return Math.sqrt((pt[0] - projectionX) ** 2 + (pt[1] - projectionY) ** 2);
};

// Função para checar se o radar está na rota
const isRadarOnRoute = (radar: Radar, route: any) => {
  if (!route || !route.geometry || !route.geometry.coordinates) return true;

  // Reduced from 0.0003 (~30m) to 0.00015 (~15m) to filter parallel streets
  const MAX_DIST_DEG = 0.00015;
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


// Função para calcular distância perpendicular de um ponto a um segmento de linha
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

// Função para calcular distância de um ponto até a rota (distância perpendicular mais próxima)
const calculateDistanceToRoute = (
  point: LatLng,
  routePoints: LatLng[]
): number => {
  if (routePoints.length < 2) {
    // Se não há rota, retornar distância grande
    return Infinity;
  }

  let minDistance = Infinity;

  // Verificar distância perpendicular para cada segmento da rota
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

// --- Lógica robusta estilo Waze: distância ao longo da rota com projeção contínua ---

/** Distâncias cumulativas desde o início da rota (em metros). cumulative[0]=0, cumulative[i]=soma dos segmentos 0..i-1 */
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
 * Projeta um ponto na rota e retorna a distância cumulativa (em metros) até essa projeção.
 * Usa projeção no segmento mais próximo (não só vértices).
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
 * Distância ao longo da rota do usuário até o radar (em metros).
 * Positiva = radar à frente; negativa ou zero = já passou.
 * Estilo Waze: projeção contínua + cumulativas.
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
  // Histerese 5m: marcar "passou" quando < 5m para evitar flicker por ruído do GPS
  const hasPassed = distanceAlongRoute < 5;
  return {
    distance: hasPassed ? 0 : Math.max(0, distanceAlongRoute),
    hasPassed,
  };
};

/** Arredonda distância para múltiplo de 10m (ex.: 287 -> 290, 283 -> 280), mínimo 0. */
const roundDistanceTo10 = (meters: number): number => {
  if (meters <= 0) return 0;
  return Math.round(meters / 10) * 10;
};

// Função para filtrar radares próximos à rota
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

    // Verificar distância até cada segmento da rota
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
  const [nearbyRadarIds, setNearbyRadarIds] = useState<Set<string>>(new Set()); // IDs dos radares próximos para animação
  const [isReportingRadar, setIsReportingRadar] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showLocationErrorModal, setShowLocationErrorModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [reportSpeedLimit, setReportSpeedLimit] = useState("");
  const [reportRadarType, setReportRadarType] = useState<
    "reportado" | "fixo" | "móvel" | "semaforo"
  >("móvel");
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
    value: "reportado" | "fixo" | "móvel" | "semaforo";
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
        value: "móvel",
        label: "Radar Móvel",
        icon: require("../assets/images/radarMovel.png"),
      },
      {
        value: "semaforo",
        label: "Semáforo c/ Radar",
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
  const alertedRadarIds = useRef<Set<string>>(new Set()); // Rastrear radares já alertados (apenas uma vez)
  const passedRadarIds = useRef<Set<string>>(new Set()); // Rastrear radares que já foram passados
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

    // Configurar TTS se disponível (aguardar inicialização do módulo nativo) — carregado sob demanda
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
            "Permissão negada",
            "É necessário permitir acesso à localização para usar o app"
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
          console.log(`📍 Localização obtida:`, loc);
          setCurrentLocation(loc);
          setOrigin(loc); // Origem sempre será a localização atual

          // Buscar radares imediatamente quando obtém localização
          getRadarsNearLocation(loc.latitude, loc.longitude, 1000)
            .then((nearbyRadars) => {
              console.log(
                `✅ ${nearbyRadars.length} radares encontrados na inicialização`
              );
              setRadars(nearbyRadars);
            })
            .catch((error) => {
              console.error("Erro ao buscar radares na inicialização:", error);
            });
        },
        (error: unknown) => {
          console.error("Erro ao obter localização:", error);
          setShowLocationErrorModal(true);
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 5000,
        }
      );
    } catch (error) {
      console.error("Erro ao solicitar permissão:", error);
    }
  };

  const handleSearchRoute = async () => {
    if (!origin) {
      Alert.alert("Erro", "Aguardando localização atual...");
      return;
    }

    if (!destinationText.trim()) {
      Alert.alert("Erro", "Por favor, digite um endereço de destino");
      return;
    }

    // Mostrar loading imediatamente
    setLoading(true);
    setGeocoding(true);
    setIsPreparingNavigation(true);

    // Animação de entrada do loading (simplificada)
    Animated.timing(loadingOpacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();

    try {
      // Se já temos coordenadas de destino (selecionado do autocomplete), usar diretamente
      // Caso contrário, fazer geocode do texto digitado
      let destinationCoords = destination;
      if (!destinationCoords) {
        destinationCoords = await geocodeAddress(destinationText.trim());
        setDestination(destinationCoords);
      }

      // Buscar rota com instruções (o SDK vai calcular a rota internamente, mas buscamos para obter os pontos para radares)
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

      // Limpar estado de radares para nova navegação (cada viagem começa "limpa")
      passedRadarIds.current.clear();
      alertedRadarIds.current.clear();
      lastCalculatedDistance.current = 0;
      radarZeroTimeRef2.current = null;

      // Iniciar navegação IMEDIATAMENTE (não esperar radares)
      setIsNavigating(true);

      // NOVIDADE: Filtrar imediatamente os radares que já temos na memória para mostrar algo instantâneo
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

      // Buscar radares em BACKGROUND (não bloqueia navegação)
      getRadarsNearRoute({
        route: routePoints,
        radius: 250, // Aumentado para 250m para ser mais abrangente
      })
        .then((nearbyRadars) => {
          // Filtrar radares que estão realmente próximos da rota
          const filteredFromApi = filterRadarsNearRoute(nearbyRadars, routePoints, 250);

          // UNIR: Manter o que já temos localmente (especialmente reportes recentes) e adicionar os novos
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
            `✅ ${filteredFromApi.length} radares da API injetados na lista (total filtrado)`
          );
        })
        .catch((error: any) => {
          // Fallback simples: usar localização atual se busca falhar
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
              console.log(`✅ ${filtered.length} radares (fallback)`);
            })
            .catch((err) => {
              console.error("Erro no fallback de radares:", err);
            });
        });
    } catch (error: any) {
      console.error("Erro ao buscar rota:", error);
      // Resetar animação em caso de erro
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
        "Não foi possível calcular a rota. Verifique o endereço digitado."
      );
    } finally {
      setLoading(false);
      setGeocoding(false);
    }
  };

  // Buscar radares quando a localização muda (mapa normal)
  useEffect(() => {
    if (!currentLocation || isNavigating) return;

    // Buscar radares próximos à localização atual
    const fetchRadars = async () => {
      try {
        const nearbyRadars = await getRadarsNearLocation(
          currentLocation.latitude,
          currentLocation.longitude,
          1000 // raio de 1km
        );
        setRadars(nearbyRadars);
        console.log(`✅ ${nearbyRadars.length} radares encontrados próximos`);
      } catch (error) {
        console.error("Erro ao buscar radares:", error);
      }
    };

    fetchRadars();
  }, [currentLocation?.latitude, currentLocation?.longitude, isNavigating]);

  // Monitorar localização apenas quando não está navegando (o SDK cuida durante navegação)
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
        console.error("Erro ao monitorar localização:", error);
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

  // Reportar radar na localização atual (modal: velocidade + tipo).
  // Futuro: mesma lógica pode ser usada para reportar acidentes, trânsito, etc. (estilo Waze) — por ora só radar.
  const handleReportRadar = async (opts?: {
    speedLimit?: number;
    type?: "reportado" | "fixo" | "móvel" | "semaforo";
  }) => {

    const speedLimit =
      opts?.speedLimit ?? reportSelectedSpeed;
    const type = opts?.type ?? reportRadarType;

    // Validação: velocidade obrigatória e máximo 120 km/h
    if (!speedLimit || isNaN(speedLimit)) {
      Alert.alert("Atenção", "Por favor, selecione a velocidade do radar");
      return;
    }
    if (speedLimit > 120) {
      Alert.alert("Atenção", "A velocidade máxima permitida é 120 km/h");
      return;
    }

    setIsReportingRadar(true);
    setShowReportModal(false);

    try {
      // Define precisely which coordinate to use
      let reportCoords: LatLng | null = null;

      console.log("📍 [Report] Iniciando reporte. Modo:", reportLocationMode);

      if (reportLocationMode === "map") {
        if (reportCustomLocation) {
          reportCoords = reportCustomLocation;
          console.log("📍 [Report] USANDO PIN DO MAPA:", reportCoords);
        } else {
          Alert.alert("Erro", "Por favor, selecione uma localização no mapa primeiro");
          setIsReportingRadar(false);
          return;
        }
      } else {
        // Modo padrão: localização atual
        if (currentLocation) {
          reportCoords = { latitude: currentLocation.latitude, longitude: currentLocation.longitude };
          console.log("📍 [Report] USANDO GPS ATUAL:", reportCoords);
        } else {
          Alert.alert("Erro", "Sua localização atual não está disponível. Tente marcar no mapa.");
          setIsReportingRadar(false);
          return;
        }
      }

      if (!reportCoords) {
        Alert.alert("Erro", "Localização inválida para o reporte.");
        setIsReportingRadar(false);
        return;
      }

      console.log(`📡 [Report] Enviando para API: Tipo=${type}, Velocidade=${speedLimit}, Lat=${reportCoords.latitude}, Lon=${reportCoords.longitude}`);

      const newRadar = await reportRadar({
        latitude: reportCoords.latitude,
        longitude: reportCoords.longitude,
        speedLimit: speedLimit,
        type,
      });

      // Verificar se é um radar temporário (salvo localmente)
      const isLocalRadar = newRadar.id.startsWith("temp_");

      // Adicionar o radar reportado à lista local imediatamente (PREPOR para prioridade)
      setRadars((prev) => {
        // Verificar se já existe para evitar duplicatas
        const exists = prev.some((r) => r.id === newRadar.id);
        if (exists) return prev;
        return [newRadar, ...prev];
      });

      // Se estiver navegando, também adicionar aos radares filtrados (PREPOR para prioridade)
      if (isNavigating && routeData) {
        setFilteredRadars((prev) => {
          const exists = prev.some((r) => r.id === newRadar.id);
          if (exists) return prev;
          return [newRadar, ...prev];
        });
      }

      // Mostrar modal de sucesso (auto-dismiss 5s)
      if (isLocalRadar) {
        setSuccessMessage("Radar salvo localmente! ✅\n\nEle aparecerá no mapa e será sincronizado quando o servidor estiver disponível.");
      } else {
        setSuccessMessage("Radar reportado com sucesso! ✅\n\nOutros usuários já podem vê-lo no mapa.");
      }
      setShowSuccessModal(true);

      // Auto-dismiss após 5 segundos
      setTimeout(() => {
        setShowSuccessModal(false);
      }, 5000);

      setReportSpeedLimit("");
      setReportRadarType("móvel" as const);
    } catch (error: any) {
      console.error("Erro ao reportar radar:", error);

      // Radares somente via API - sem fallback local
      if (
        error?.message?.includes("404") ||
        error?.message?.includes("Network")
      ) {
        Alert.alert(
          "Servidor indisponível",
          "Não foi possível reportar o radar. Verifique sua conexão e tente novamente."
        );
        return;
      }

      Alert.alert(
        "Erro",
        error.message || "Não foi possível reportar o radar. Tente novamente."
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
        console.log(`🔄 ${recentRadars.length} novos radares sincronizados`);

        // Adicionar novos radares à lista
        setRadars((prev) => {
          const existingIds = new Set(prev.map((r) => r.id));
          const newRadars = recentRadars.filter((r) => !existingIds.has(r.id));

          if (newRadars.length > 0) {
            return [...prev, ...newRadars];
          }
          return prev;
        });

        // Se estiver navegando, também adicionar aos radares filtrados
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

  // Iniciar sincronização em tempo real quando começar a navegar
  useEffect(() => {
    if (isNavigating) {
      // Sincronizar imediatamente
      syncRecentRadars();

      // Sincronizar a cada 15 segundos
      syncIntervalRef.current = setInterval(() => {
        syncRecentRadars();
      }, 15000); // 15 segundos
    } else {
      // Parar sincronização quando parar de navegar
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

  // Carregar MapboxNavigation só quando entrar em navegação (evita "Requiring unknown module 'undefined'" no bundle)
  useEffect(() => {
    if (!isNavigating || MapboxNavComponent) return;
    try {
      const M = require("@pawan-pk/react-native-mapbox-navigation").default;
      setMapboxNavComponent(() => M);
      setMapboxNavError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMapboxNavError(msg);
      console.warn("MapboxNavigation não disponível:", e);
    }
  }, [isNavigating, MapboxNavComponent]);

  // Manter refs atualizados para o handler do Socket.IO (evitar closure obsoleta durante navegação)
  isNavigatingRef.current = isNavigating;
  routeDataRef.current = routeData;

  // Preparar radares para o MapboxNavigation (sempre calcular, mesmo quando não está navegando)
  const mapboxRadars = useMemo(() => {
    // Se filteredRadars estiver vazio (ex: carregando rota), usar radars globais como fallback instantâneo
    const list = filteredRadars.length > 0 ? filteredRadars : radars;
    return list.map((r) => ({
      id: r.id,
      latitude: r.latitude,
      longitude: r.longitude,
      speedLimit: r.speedLimit || 0, // Default to 0 if undefined
      type: r.type || "unknown", // Default to "unknown"
    }));
  }, [filteredRadars, radars]);

  // WebSocket nativo: radares em tempo real para todos (mapa e navegação), inclusive durante navegação
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
                `📡 WebSocket: Novo radar recebido durante ${isNavigatingRef.current ? "navegação" : "mapa"
                }:`,
                radar.id
              ); */

              // Sempre adicionar ao estado principal de radares
              setRadars((prev) => {
                if (prev.some((r) => r.id === radar.id)) {
                  return prev; // Já existe, não adicionar novamente
                }
                return [...prev, radar];
              });

              // Durante navegação: filtrar pela rota e adicionar ao filteredRadars
              const nav = isNavigatingRef.current;
              const rd = routeDataRef.current;
              if (nav && rd?.route?.geometry?.coordinates) {
                const routePoints = rd.route.geometry.coordinates.map(
                  (c: number[]) => ({ latitude: c[1], longitude: c[0] })
                );
                const near = filterRadarsNearRoute([radar], routePoints, 100);
                if (near.length > 0) {
                  /* console.log(
                    `✅ Radar ${radar.id} está próximo à rota, adicionando ao filteredRadars`
                  ); */
                  setFilteredRadars((prev) => {
                    if (prev.some((r) => r.id === radar.id)) {
                      return prev; // Já existe
                    }
                    const updated = [...prev, radar];
                    /* console.log(
                      `📊 filteredRadars atualizado: ${updated.length} radares`
                    ); */
                    return updated;
                  });
                } else {
                  /* console.log(
                    `⚠️ Radar ${radar.id} não está próximo à rota (distância > 100m)`
                  ); */
                }
              } else {
                // Não está navegando: adicionar diretamente ao filteredRadars
                /* console.log(
                  `✅ Adicionando radar ao filteredRadars (não está navegando)`
                ); */
                setFilteredRadars((prev) => {
                  if (prev.some((r) => r.id === radar.id)) {
                    return prev; // Já existe
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

              // console.log(`📡 WebSocket: Radar atualizado:`, radar.id);

              // Atualizar em ambos os estados
              setRadars((prev) =>
                prev.map((r) => (r.id === radar.id ? radar : r))
              );
              setFilteredRadars((prev) => {
                const updated = prev.map((r) =>
                  r.id === radar.id ? radar : r
                );
                /* console.log(
                  `📊 filteredRadars atualizado após update: ${updated.length} radares`
                ); */
                return updated;
              });
            } else if (eventName === "radar:delete") {
              const radarId = payload.id;
              // console.log(`📡 WebSocket: Radar deletado/inativado:`, radarId);

              // Remover de ambos os estados
              setRadars((prev) => {
                const updated = prev.filter((r) => r.id !== radarId);
                /* console.log(
                  `🗑️ Radar removido de radars: ${updated.length} radares restantes`
                ); */
                return updated;
              });
              setFilteredRadars((prev) => {
                const updated = prev.filter((r) => r.id !== radarId);
                /* console.log(
                  `🗑️ Radar removido de filteredRadars: ${updated.length} radares restantes`
                ); */
                return updated;
              });
            } else if (eventName === "connected") {
              console.log("✅ WebSocket conectado:", payload.message);
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
        console.warn("WebSocket não disponível para alertas em tempo real:", e);
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

  // Memoizar conversão de Set para Array para evitar nova referência a cada render
  const nearbyRadarIdsArray = useMemo(() => Array.from(nearbyRadarIds), [nearbyRadarIds]);

  // Handler para mudança de localização (memoizado)
  const handleLocationChange = useCallback((location: any) => {
    // Verificação de null para evitar NullPointerException
    if (
      !location ||
      location.latitude == null ||
      location.longitude == null
    ) {
      return;
    }

    try {
      const now = Date.now();

      // Debounce de atualização de localização para evitar movimentos erráticos
      if (locationUpdateDebounce.current) {
        clearTimeout(locationUpdateDebounce.current);
      }

      // Aumentar debounce para 1 segundo para evitar atualizações muito frequentes
      locationUpdateDebounce.current = setTimeout(() => {
        try {
          const newLocation = {
            latitude: location.latitude,
            longitude: location.longitude,
          };

          // Só atualizar se a localização mudou significativamente (mais de 20 metros)
          if (currentLocation) {
            const distance = calculateDistance(
              currentLocation.latitude,
              currentLocation.longitude,
              newLocation.latitude,
              newLocation.longitude
            );

            // Se a distância for muito pequena (< 20m), não atualizar
            if (distance < 20) {
              return;
            }

            // Verificar se a mudança é muito grande (possível erro do GPS)
            // Se mudou mais de 100m em menos de 2 segundos, provavelmente é erro
            if (
              distance > 100 &&
              now - lastLocationUpdate.current < 2000
            ) {
              console.warn(
                "⚠️ Mudança de localização muito grande, ignorando (possível erro GPS)"
              );
              return;
            }
          }

          setCurrentLocation(newLocation);
          lastLocationUpdate.current = now;
        } catch (error) {
          console.error("Erro ao processar localização:", error);
        }
      }, 1000);

      // Buscar radares próximos durante navegação REMOVIDO por solicitação
      // Apenas WebSocket ou carga inicial atualiza a lista


      // Função auxiliar para esconder modal com animações
      const hideModal = () => {
        Animated.parallel([
          Animated.timing(modalOpacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(modalScale, {
            toValue: 0.8,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setNearestRadar(null);
        });
      };

      // Verificar distância até cada radar e alertar (com debounce)
      const checkRadarDistance = () => {
        try {
          if (
            !location ||
            location.latitude == null ||
            location.longitude == null
          ) {
            return;
          }

          if (
            !routeDataRef.current ||
            !routeDataRef.current.route ||
            !routeDataRef.current.route.geometry ||
            !routeDataRef.current.route.geometry.coordinates
          ) {
            return;
          }

          if (filteredRadars.length > 0 && routeDataRef.current) {
            const checkLocation = {
              latitude: location.latitude,
              longitude: location.longitude,
            };

            const coordinates =
              routeDataRef.current.route.geometry.coordinates;
            if (
              !Array.isArray(coordinates) ||
              coordinates.length === 0
            ) {
              return;
            }

            const routePoints: LatLng[] = coordinates
              .map((coord: number[]) => {
                if (!Array.isArray(coord) || coord.length < 2) {
                  return null;
                }
                return {
                  latitude: coord[1],
                  longitude: coord[0],
                };
              })
              .filter(
                (point: LatLng | null): point is LatLng =>
                  point !== null
              );

            if (routePoints.length === 0) {
              return;
            }

            type NearestRadar = {
              radar: Radar;
              distance: number;
              routeDistance: number;
            };
            let nearest: NearestRadar | null = null;
            let minDistance = Infinity;

            filteredRadars.forEach((radar) => {
              if (passedRadarIds.current.has(radar.id)) {
                return;
              }

              const radarPoint: LatLng = {
                latitude: radar.latitude,
                longitude: radar.longitude,
              };
              const routeDistance = calculateDistanceToRoute(
                radarPoint,
                routePoints
              );
              if (routeDistance > 100) {
                return;
              }

              const routeDistanceResult =
                calculateDistanceAlongRoute(
                  checkLocation,
                  radarPoint,
                  routePoints
                );

              if (routeDistanceResult.hasPassed) {
                passedRadarIds.current.add(radar.id);
                return;
              }

              const distanceAlongRoute =
                routeDistanceResult.distance;
              if (
                distanceAlongRoute < 0 ||
                distanceAlongRoute >= 500
              ) {
                return;
              }

              if (distanceAlongRoute < minDistance) {
                // Verificar se está realmente na linha da rota (filtrar paralelas)
                if (!isRadarOnRoute(radar, routeData)) return;

                minDistance = distanceAlongRoute;
                nearest = {
                  radar,
                  distance: roundDistanceTo10(distanceAlongRoute),
                  routeDistance: Math.round(routeDistance),
                };
              }
            });

            if (nearest) {
              const nearestData: NearestRadar = nearest;
              const nearestDistance = nearestData.distance;
              const nearestRadarObj = nearestData.radar;

              if (
                nearestDistance ===
                lastCalculatedDistance.current &&
                lastCalculatedDistance.current > 0
              ) {
                return;
              }
              lastCalculatedDistance.current = nearestDistance;

              if (modalTimerRef.current) {
                clearTimeout(modalTimerRef.current);
                modalTimerRef.current = null;
              }

              const nearbyIds = new Set([nearestRadarObj.id]);
              setNearbyRadarIds(nearbyIds);

              if (nearestDistance <= 300) {
                if (nearestDistance < 10) {
                  passedRadarIds.current.add(nearestRadarObj.id);

                  if (radarZeroTimeRef2.current === null) {
                    radarZeroTimeRef2.current = Date.now();
                  }

                  const timeSinceZero =
                    Date.now() - (radarZeroTimeRef2.current || 0);
                  if (timeSinceZero < 3000) {
                    setNearestRadar({
                      radar: nearestRadarObj,
                      distance: 0,
                    });

                    Animated.parallel([
                      Animated.spring(modalOpacity, {
                        toValue: 1,
                        tension: 50,
                        friction: 7,
                        useNativeDriver: true,
                      }),
                      Animated.spring(modalScale, {
                        toValue: 1,
                        tension: 50,
                        friction: 7,
                        useNativeDriver: true,
                      }),
                    ]).start();
                  } else {
                    radarZeroTimeRef2.current = null;
                    hideModal();
                  }
                } else {
                  radarZeroTimeRef2.current = null;

                  setNearestRadar({
                    radar: nearestRadarObj,
                    distance: nearestDistance,
                  });

                  Animated.parallel([
                    Animated.spring(modalOpacity, {
                      toValue: 1,
                      tension: 50,
                      friction: 7,
                      useNativeDriver: true,
                    }),
                    Animated.spring(modalScale, {
                      toValue: 1,
                      tension: 50,
                      friction: 7,
                      useNativeDriver: true,
                    }),
                  ]).start();
                }
              } else {
                radarZeroTimeRef2.current = null;
                hideModal();
              }

              const radarId = nearestRadarObj.id;

              if (
                !alertedRadarIds.current.has(radarId) &&
                nearestDistance <= 300 &&
                nearestDistance > 0
              ) {
                alertedRadarIds.current.add(radarId);

                let radarType = "Radar";
                const type = nearestRadarObj.type ? nearestRadarObj.type.toLowerCase() : "";
                if (type.includes("semaforo") || type.includes("camera") || type.includes("fotografica")) {
                  radarType = "Radar Semafórico";
                } else if (type.includes("movel") || type.includes("mobile")) {
                  radarType = "Radar Móvel";
                } else if (type.includes("fixo") || type.includes("placa")) {
                  radarType = "Radar Fixo";
                }

                let message = "";
                if (nearestDistance > 200) {
                  message = `${radarType} a ${Math.round(
                    nearestDistance
                  )} metros`;
                } else if (nearestDistance > 100) {
                  message = `Atenção! ${radarType} a ${Math.round(
                    nearestDistance
                  )} metros`;
                } else if (nearestDistance > 30) {
                  message = `Cuidado! ${radarType} a ${Math.round(
                    nearestDistance
                  )} metros`;
                } else {
                  message = `Atenção! ${radarType} muito próximo`;
                }

                const speedLimit = nearestRadarObj.speedLimit;
                if (speedLimit) {
                  message += `. Limite ${speedLimit} quilômetros por hora`;
                }

                const Tts = getTts();
                if (Tts && typeof Tts.speak === "function") {
                  try {
                    Tts.speak(message);
                  } catch (error) {
                  }
                }
              }
            } else {
              radarZeroTimeRef2.current = null;
              lastCalculatedDistance.current = 0;
              setNearbyRadarIds(new Set());
              hideModal();
            }
          } else {
          }
        } catch (error) {
        }
      };

      if (radarCheckDebounce.current) {
        clearTimeout(radarCheckDebounce.current);
      }

      checkRadarDistance();
      radarCheckDebounce.current = setTimeout(
        checkRadarDistance,
        500
      );
    } catch (error) {
      console.error("Erro no callback onLocationChange:", error);
    }
  }, [filteredRadars, currentLocation, modalScale, modalOpacity, routeData]);

  // Callback para quando a rota for recalculada (ex: saiu da rota)
  const handleRouteChanged = useCallback(async (event: any) => {
    try {
      if (!event) return;
      // Defensive parsing for geometry
      const geometry = event.geometry || (event.items && event.items.length > 0 ? event.items[0].geometry : null);

      if (!geometry) {
        console.log("Evento routeChanged sem geometria válida:", event);
        return;
      }

      console.log("🛣️ Rota recalculada! Atualizando radares...");

      let coordinates = [];
      try {
        // O evento pode vir como string JSON (nossa conversão nativa) ou objeto direto
        // Tentamos parsear se for string, senão assumimos que é objeto ou array
        if (typeof geometry === 'string') {
          // Verificar se é Polyline (não começa com { ou [) - Fallback se a conversão nativa falhou
          if (!geometry.trim().startsWith("{") && !geometry.trim().startsWith("[")) {
            console.warn("⚠️ Recebido Polyline em vez de GeoJSON. A conversão nativa pode ter falhado.");
            // Aqui idealmente decodificaríamos Polyline no JS, mas melhor garantir o nativo.
            // A modificação no MapboxNavigationView.kt deve garantir que isso venha como GeoJSON.
            return;
          }
          const lineString = JSON.parse(geometry);
          coordinates = lineString.coordinates || lineString;
        } else {
          coordinates = geometry.coordinates || geometry;
        }
      } catch (e) {
        console.warn("Erro ao parsear geometria da rota:", e);
        return;
      }

      if (!Array.isArray(coordinates) || coordinates.length === 0) return;

      const newRoutePoints = coordinates.map((coord: number[]) => {
        if (Array.isArray(coord) && coord.length >= 2) {
          return {
            latitude: coord[1],
            longitude: coord[0],
          };
        }
        return null;
      }).filter((p): p is LatLng => p !== null);

      if (newRoutePoints.length === 0) return;

      // Atualizar dados da rota com type safety
      setRouteData(prev => {
        if (!prev || !prev.route) return prev;

        return {
          ...prev,
          route: {
            ...prev.route,
            type: "Feature",
            geometry: {
              ...prev.route.geometry,
              coordinates: coordinates
            }
          }
        };
      });

      // Refiltrar radares para a nova rota
      // Buscar radares próximos ao novo caminho (usando API se necessário ou cache local)
      const nearbyRadars = await getRadarsNearLocation(
        newRoutePoints[0].latitude,
        newRoutePoints[0].longitude,
        5000 // Busca ampla inicial
      );

      const filtered = filterRadarsNearRoute(nearbyRadars, newRoutePoints, 250);

      console.log(`✅ ${filtered.length} radares encontrados na nova rota`);

      setFilteredRadars(filtered);

      // Atualizar lista principal também para garantir consistência
      setRadars(prev => {
        const existingIds = new Set(prev.map(r => r.id));
        const newRadars = filtered.filter(r => !existingIds.has(r.id));
        return [...newRadars, ...prev];
      });

    } catch (error) {
      console.error("Erro ao processar mudança de rota:", error);
    }
  }, []);

  // Handlers memoizados para evitar re-creates
  const handleRouteProgressChange = useCallback((progress: any) => {
    try {
      if (!progress) return;
      // Implement logic if needed, currently empty
    } catch (e) {
      console.error("Erro em handleRouteProgressChange:", e);
    }
  }, []);

  const handleArrive = useCallback(() => {
    Alert.alert("Chegada", "Você chegou ao destino!");
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
      console.error("Erro na navegação:", error);
      const errorMessage =
        error?.message ||
        error?.toString() ||
        "Erro na navegação";
      Alert.alert("Erro", errorMessage);
    } catch (e) {
      console.error("Erro ao processar erro de navegação:", e);
    }
  }, []);

  // Handler para selecionar rota alternativa (vinda do evento nativo)
  const handleRouteAlternativeSelected = useCallback((event: any) => {
    try {
      if (!event) return;
      console.log("Rota alternativa selecionada via evento nativo!");
    } catch (e) {
      console.error("Erro em handleRouteAlternativeSelected:", e);
    }
  }, []);

  useEffect(() => {
    if (isNavigating && !isPreparingNavigation && mapboxRadars) {
      // Pré-aquecer ou validar dados se necessário
    }
  }, [isNavigating, isPreparingNavigation, mapboxRadars]);

  // Render do MapboxNavComponent com props memoizadas
  // Simplificado para evitar erros de renderização
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
        onRouteAlternativeSelected={handleRouteAlternativeSelected}
        onRouteChanged={handleRouteChanged}
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

      {/* Animação de loading durante preparação da navegação */}
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
            <Text style={styles.loadingText}>Preparando navegação...</Text>
            <Text style={styles.loadingSubtext}>Aguarde um momento</Text>
          </Animated.View>
        </Animated.View>
      )}

      {isNavigating && origin && destination && !isPreparingNavigation ? (
        <View style={styles.mapContainer}>
          {mapboxNavError ? (
            <View style={styles.loadingOverlay}>
              <Text style={styles.loadingText}>Erro ao carregar navegação</Text>
              <Text style={styles.loadingSubtext}>{mapboxNavError}</Text>
            </View>
          ) : MapboxNavComponent ? (
            <>
              {navigationView}

              {/* Botão de reportar radar - abre modal com velocidade e tipo */}
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
              <Text style={styles.loadingText}>Carregando navegação...</Text>
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
            `🎯 Renderizando modal: isNavigating=${isNavigating}, nearestRadar=${!!nearestRadar}, distance=${nearestRadar.distance
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
                    ? "rgba(255,255,255,1)" // Transparente quando muito próximo
                    : nearestRadar.distance <= 100
                      ? "rgba(255,255,255,1)" // Transparente quando próximo
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
                  if (type.includes("semaforo")) typeName = "Radar Semafórico";
                  else if (type.includes("movel")) typeName = "Radar Móvel";
                  else if (type.includes("fixo") || type.includes("placa")) typeName = "Radar Fixo";

                  return nearestRadar.distance <= 30
                    ? `${typeName} Próximo!`
                    : `${typeName} a frente`;
                })()}
              </Text>
              <Text style={styles.radarAlertDistance}>
                {nearestRadar.distance < 10
                  ? "0m"
                  : `${nearestRadar.distance}m`}
                {nearestRadar.radar.speedLimit && (
                  <Text style={styles.radarAlertSpeed}>
                    {" • "}
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
          setReportRadarType("móvel");
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
              {reportStep === 1 && "O que você está vendo?"}
              {reportStep === 2 && "Qual o limite de velocidade?"}
              {reportStep === 3 && "Onde está localizado?"}
            </Text>

            <Text style={styles.reportModalSubtitle}>
              {reportStep === 1 && "Selecione o tipo de radar"}
              {reportStep === 2 && "Toque no limite (km/h)"}
              {reportStep === 3 && "Escolha a localização"}
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
                      Usar Localização Atual
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
                  <Text style={styles.reportModalCancelText}>← Voltar</Text>
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
                  <Text style={styles.reportModalSubmitText}>Próximo →</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.reportModalSubmit, { flex: 1 }]}
                  onPress={() => handleReportRadar()}
                  disabled={isReportingRadar}
                >
                  <Text style={styles.reportModalSubmitText}>
                    {isReportingRadar ? "Enviando..." : "✓ Reportar"}
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
                    console.log("🗺️ [Home-MapPicker] Novo centro capturado:", coords);
                    setMapPickerCenter(coords);
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
                      console.log("🗺️ [Home-MapPicker] Confirmando localização:", mapPickerCenter);
                      setReportCustomLocation(mapPickerCenter);
                      setReportLocationMode("map");
                      setShowMapPicker(false);
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: "600", color: "#fff" }}>Confirmar Localização</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Modal: Erro ao obter localização */}
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
                Ops! Localização Indisponível
              </Text>
            </View>
            <Text style={[styles.reportModalSubtitle, { textAlign: "center", fontSize: 14, lineHeight: 20, marginBottom: 20 }]}>
              Não conseguimos obter sua posição atual. Por favor, verifique se o seu GPS está ligado e tente novamente.
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
    // Acima do trip progress: quando o radar aparece a câmera sobe e o trip progress fica embaixo
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

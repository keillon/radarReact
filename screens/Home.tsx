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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
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

  return R * c; // Distância em metros
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
          timeout: 15000,
          maximumAge: 10000,
          // Evita erro "interface but class was expected" do FusedLocationProviderClient
          forceLocationManager: true,
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
        radius: 100, // Reduzido para 100m (mais preciso)
      })
        .then((nearbyRadars) => {
          // Filtrar radares que estão realmente próximos da rota
          const filtered = filterRadarsNearRoute(nearbyRadars, routePoints, 100);
          setRadars(filtered);
          setFilteredRadars(filtered);
          console.log(
            `✅ ${filtered.length} radares encontrados na rota (filtrados de ${nearbyRadars.length})`
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
                100
              );
              setRadars(filtered);
              setFilteredRadars(filtered);
              console.log(`✅ ${filtered.length} radares (fallback)`);
            })
            .catch((err) => {
              console.error("Erro no fallback de radares:", err);
              // Continuar sem radares se tudo falhar
              setRadars([]);
              setFilteredRadars([]);
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
    if (!currentLocation) {
      Alert.alert("Erro", "Não foi possível obter sua localização atual");
      return;
    }

    const speedLimit =
      opts?.speedLimit ??
      (reportSpeedLimit ? parseInt(reportSpeedLimit, 10) : undefined);
    const type = opts?.type ?? reportRadarType;

    // Validação: velocidade obrigatória e máximo 120 km/h
    if (!speedLimit || isNaN(speedLimit)) {
      Alert.alert("Atenção", "Por favor, informe a velocidade do radar");
      return;
    }
    if (speedLimit > 120) {
      Alert.alert("Atenção", "A velocidade máxima permitida é 120 km/h");
      return;
    }

    setIsReportingRadar(true);
    setShowReportModal(false);
    try {
      const newRadar = await reportRadar({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        speedLimit: speedLimit,
        type,
      });

      // Verificar se é um radar temporário (salvo localmente)
      const isLocalRadar = newRadar.id.startsWith("temp_");

      // Adicionar o radar reportado à lista local imediatamente
      setRadars((prev) => {
        // Verificar se já existe para evitar duplicatas
        const exists = prev.some((r) => r.id === newRadar.id);
        if (exists) return prev;
        return [...prev, newRadar];
      });

      // Se estiver navegando, também adicionar aos radares filtrados
      if (isNavigating && routeData) {
        setFilteredRadars((prev) => {
          const exists = prev.some((r) => r.id === newRadar.id);
          if (exists) return prev;
          return [...prev, newRadar];
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
  const mapboxRadars = useMemo(
    () =>
      filteredRadars.map((r) => ({
        id: r.id,
        latitude: r.latitude,
        longitude: r.longitude,
        speedLimit: r.speedLimit,
        type: r.type, // Passar tipo do radar para o componente nativo
      })),
    [filteredRadars]
  );

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

              console.log(
                `📡 WebSocket: Novo radar recebido durante ${
                  isNavigatingRef.current ? "navegação" : "mapa"
                }:`,
                radar.id
              );

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
                  console.log(
                    `✅ Radar ${radar.id} está próximo à rota, adicionando ao filteredRadars`
                  );
                  setFilteredRadars((prev) => {
                    if (prev.some((r) => r.id === radar.id)) {
                      return prev; // Já existe
                    }
                    const updated = [...prev, radar];
                    console.log(
                      `📊 filteredRadars atualizado: ${updated.length} radares`
                    );
                    return updated;
                  });
                } else {
                  console.log(
                    `⚠️ Radar ${radar.id} não está próximo à rota (distância > 100m)`
                  );
                }
              } else {
                // Não está navegando: adicionar diretamente ao filteredRadars
                console.log(
                  `✅ Adicionando radar ao filteredRadars (não está navegando)`
                );
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

              console.log(`📡 WebSocket: Radar atualizado:`, radar.id);

              // Atualizar em ambos os estados
              setRadars((prev) =>
                prev.map((r) => (r.id === radar.id ? radar : r))
              );
              setFilteredRadars((prev) => {
                const updated = prev.map((r) =>
                  r.id === radar.id ? radar : r
                );
                console.log(
                  `📊 filteredRadars atualizado após update: ${updated.length} radares`
                );
                return updated;
              });
            } else if (eventName === "radar:delete") {
              const radarId = payload.id;
              console.log(`📡 WebSocket: Radar deletado/inativado:`, radarId);

              // Remover de ambos os estados
              setRadars((prev) => {
                const updated = prev.filter((r) => r.id !== radarId);
                console.log(
                  `🗑️ Radar removido de radars: ${updated.length} radares restantes`
                );
                return updated;
              });
              setFilteredRadars((prev) => {
                const updated = prev.filter((r) => r.id !== radarId);
                console.log(
                  `🗑️ Radar removido de filteredRadars: ${updated.length} radares restantes`
                );
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

                let message = "";
                if (nearestDistance > 200) {
                  message = `Radar a ${Math.round(
                    nearestDistance
                  )} metros`;
                } else if (nearestDistance > 100) {
                  message = `Atenção! Radar a ${Math.round(
                    nearestDistance
                  )} metros`;
                } else if (nearestDistance > 30) {
                  message = `Cuidado! Radar a ${Math.round(
                    nearestDistance
                  )} metros`;
                } else {
                  message = `Atenção! Radar próximo`;
                }

                const speedLimit = nearestRadarObj.speedLimit;
                if (speedLimit) {
                  message += `. Limite de velocidade ${speedLimit} quilômetros por hora`;
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
  }, [filteredRadars, currentLocation, modalScale, modalOpacity]); // Dependências mínimas

  // Handlers memoizados para evitar re-creates
  const handleRouteProgressChange = useCallback((progress: any) => {
    if (!progress) return;
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
     console.log("Rota alternativa selecionada via evento nativo!");
     // Adicionar log visual ou toast se necessário
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
                  <Text style={styles.reportRadarButtonText}>
                    <Image
                      source={require("../assets/images/radar.png")}
                      style={styles.reportRadarButtonImage}
                    />
                  </Text>
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
            `🎯 Renderizando modal: isNavigating=${isNavigating}, nearestRadar=${!!nearestRadar}, distance=${
              nearestRadar.distance
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
            <View>
              <Text style={styles.radarAlertIcon}>
                {nearestRadar.distance <= 30 ? "🚨" : "⚠️"}
              </Text>
            </View>
            <View style={styles.radarAlertTextContainer}>
              <Text style={styles.radarAlertTitle}>
                {nearestRadar.distance <= 30
                  ? "Radar Muito Próximo!"
                  : nearestRadar.distance <= 100
                  ? "Atenção! Radar Próximo"
                  : "Radar Próximo"}
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

      {/* Modal: Reportar radar (velocidade + tipo) — ícones + nomes, layout moderno */}
      <Modal
        visible={showReportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReportModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.reportModalOverlay}
          onPress={() => setShowReportModal(false)}
        >
          <View
            style={styles.reportModalContent}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.reportModalTitle}>Reportar radar</Text>
            <Text style={styles.reportModalSubtitle}>
              Na sua localização atual
            </Text>
            <Text style={styles.reportModalLabel}>
              Velocidade (km/h) — obrigatório (máx. 120)
            </Text>
            <TextInput
              style={styles.reportModalInput}
              placeholder="Ex: 60"
              keyboardType="number-pad"
              value={reportSpeedLimit}
              onChangeText={setReportSpeedLimit}
            />
            <Text style={styles.reportModalLabel}>Tipo de radar</Text>
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
                  activeOpacity={0.8}
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
            <View style={styles.reportModalButtons}>
              <TouchableOpacity
                style={styles.reportModalCancel}
                onPress={() => setShowReportModal(false)}
              >
                <Text style={styles.reportModalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.reportModalSubmit}
                onPress={() => handleReportRadar()}
                disabled={isReportingRadar}
              >
                <Text style={styles.reportModalSubmitText}>
                  {isReportingRadar ? "Enviando…" : "Reportar"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
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
              <Text style={{ fontSize: 48, marginBottom: 8 }}>📍</Text>
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
              <Text style={{ fontSize: 48, marginBottom: 8 }}>🎉</Text>
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
    left: 90,
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
    width: "80%",
    height: "auto",
  },
  radarAlertIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  radarAlertTextContainer: {
    flex: 1,
  },
  radarAlertTitle: {
    fontSize: 10,
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
    width: 42,
    height: 42,
  },
  reportRadarButtonText: {
    fontSize: 28,
    color: "#fff",
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
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#3b82f6",
    alignItems: "center",
  },
  reportModalSubmitText: {
    fontSize: 14,
    fontWeight: "600",
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

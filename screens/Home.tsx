import MapboxNavigation from "@pawan-pk/react-native-mapbox-navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Geolocation from "react-native-geolocation-service";

import Map from "../components/Map";
import SearchContainer from "../components/SearchContainer";
import {
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
// Importar TTS com tratamento de erro
let Tts: any = null;
try {
  const TtsModule = require("react-native-tts");
  // react-native-tts exporta uma instância diretamente
  Tts = TtsModule.default || TtsModule;
} catch (error) {
  console.warn("react-native-tts não está disponível:", error);
}

// Função para calcular distância entre dois pontos (Haversine)
const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
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
  lineEnd: LatLng,
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
  routePoints: LatLng[],
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
        routePoints[i].longitude,
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
  cumulative: number[],
): number {
  if (routePoints.length < 2 || cumulative.length !== routePoints.length) {
    return 0;
  }
  let bestCumulative = 0;
  let bestDist = Infinity;
  for (let i = 0; i < routePoints.length - 1; i++) {
    const segStart = routePoints[i];
    const segEnd = routePoints[i + 1];
    const segLen =
      cumulative[i + 1] - cumulative[i] || 1e-9;
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
      projLon,
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
  routePoints: LatLng[],
): { distance: number; hasPassed: boolean } => {
  if (routePoints.length < 2) {
    return { distance: Infinity, hasPassed: false };
  }
  const cumulative = getCumulativeDistances(routePoints);
  const userCum = projectPointOntoRoute(userLocation, routePoints, cumulative);
  const radarCum = projectPointOntoRoute(radarLocation, routePoints, cumulative);
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
  maxDistance: number = 100, // metros
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
        routePoints[i + 1],
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
  const lastSyncTimeRef = useRef<number>(Date.now());
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
    null,
  );
  const lastCalculatedDistance = useRef<number>(0);
  const radarZeroTimeRef2 = useRef<number | null>(null); // Timestamp quando chegou a 0 metros
  const modalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    initMapbox();
    requestLocationPermission();

    // Configurar TTS se disponível (aguardar inicialização do módulo nativo)
    if (Tts) {
      // Verificar se o módulo nativo está pronto antes de configurar
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
            // Se getInitStatus falhar, tentar configurar mesmo assim
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
        // Se getInitStatus não existir, tentar configurar diretamente
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
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(
            "Permissão negada",
            "É necessário permitir acesso à localização para usar o app",
          );
          return;
        }
      }

      Geolocation.getCurrentPosition(
        (position) => {
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
                `✅ ${nearbyRadars.length} radares encontrados na inicialização`,
              );
              setRadars(nearbyRadars);
            })
            .catch((error) => {
              console.error("Erro ao buscar radares na inicialização:", error);
            });
        },
        (error) => {
          console.error("Erro ao obter localização:", error);
          Alert.alert("Erro", "Não foi possível obter sua localização");
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
          // Evita erro "interface but class was expected" do FusedLocationProviderClient
          forceLocationManager: true,
        },
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

    // Animação de entrada do loading imediatamente
    Animated.parallel([
      Animated.timing(loadingOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(loadingScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

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

      // Extrair pontos da rota para enviar ao backend ANTES de iniciar navegação
      const routePoints = routeResponse.route.geometry.coordinates.map(
        (coord: number[]) => ({
          latitude: coord[1],
          longitude: coord[0],
        }),
      );

      // Buscar radares próximos à rota
      try {
        const nearbyRadars = await getRadarsNearRoute({
          route: routePoints,
          radius: 500, // Aumentado para 500m para capturar mais radares ao longo da rota
        });
        // Filtrar radares que estão realmente próximos da rota (distância perpendicular)
        const filtered = filterRadarsNearRoute(nearbyRadars, routePoints, 100);
        setRadars(filtered);
        setFilteredRadars(filtered);
        console.log(
          `✅ ${filtered.length} radares encontrados na rota (filtrados de ${nearbyRadars.length})`,
        );
      } catch (error: any) {
        // O erro já foi tratado dentro de getRadarsNearRoute com fallback
        // Apenas logar se não for o erro esperado de rota não encontrada
        if (
          !error?.message?.includes("ROUTE_NOT_FOUND") &&
          !error?.message?.includes("404")
        ) {
          console.error("Erro ao buscar radares:", error);
        }
        // O fallback já foi executado dentro de getRadarsNearRoute
        // Se chegou aqui, o fallback também falhou ou retornou vazio
        if (routePoints.length > 0) {
          try {
            const midPoint = routePoints[Math.floor(routePoints.length / 2)];
            const fallbackRadars = await getRadarsNearLocation(
              midPoint.latitude,
              midPoint.longitude,
              1000,
            );
            // Filtrar também no fallback
            const filtered = filterRadarsNearRoute(
              fallbackRadars,
              routePoints,
              100,
            );
            setRadars(filtered);
            setFilteredRadars(filtered);
            console.log(
              `✅ ${filtered.length} radares encontrados (fallback, filtrados de ${fallbackRadars.length})`,
            );
          } catch (fallbackError) {
            console.error("Erro no fallback de radares:", fallbackError);
          }
        }
      }

      // Loading já está sendo exibido desde o início
      // Aguardar um pouco para garantir que tudo está pronto antes de mostrar a navegação
      // Isso evita que o componente apareça se montando
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 500));

      // Limpar estado de radares para nova navegação (cada viagem começa "limpa")
      passedRadarIds.current.clear();
      alertedRadarIds.current.clear();
      lastCalculatedDistance.current = 0;
      radarZeroTimeRef2.current = null;

      // Iniciar navegação com o SDK
      setIsNavigating(true);

      // Aguardar mais um pouco para garantir que o MapboxNavigation está renderizado
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 300));

      // Animação de saída do loading
      Animated.parallel([
        Animated.timing(loadingOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(loadingScale, {
          toValue: 0.9,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Esconder animação de loading após animação
        setIsPreparingNavigation(false);
        loadingOpacity.setValue(0);
        loadingScale.setValue(0.9);
      });
    } catch (error: any) {
      console.error("Erro ao buscar rota:", error);
      // Resetar animações em caso de erro
      Animated.parallel([
        Animated.timing(loadingOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(loadingScale, {
          toValue: 0.9,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsPreparingNavigation(false);
        loadingOpacity.setValue(0);
        loadingScale.setValue(0.9);
      });
      Alert.alert(
        "Erro",
        error.message ||
          "Não foi possível calcular a rota. Verifique o endereço digitado.",
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
          1000, // raio de 1km
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
      Geolocation.clearWatch(locationWatchRef.current.watchId);
    }

    const watchId = Geolocation.watchPosition(
      (position) => {
        const currentPos: LatLng = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCurrentLocation(currentPos);
      },
      (error) => {
        console.error("Erro ao monitorar localização:", error);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 50,
        interval: 5000,
        fastestInterval: 3000,
        forceLocationManager: true,
      },
    );

    if (!locationWatchRef.current) {
      locationWatchRef.current = { watchId, lastRadarFetch: 0 };
    } else {
      locationWatchRef.current.watchId = watchId;
    }

    return () => {
      if (locationWatchRef.current?.watchId) {
        Geolocation.clearWatch(locationWatchRef.current.watchId);
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

  // Função para reportar radar na localização atual
  const handleReportRadar = async () => {
    if (!currentLocation) {
      Alert.alert("Erro", "Não foi possível obter sua localização atual");
      return;
    }

    setIsReportingRadar(true);
    try {
      const newRadar = await reportRadar({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        type: "reportado",
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

      // Mensagem diferente dependendo se foi salvo localmente ou no backend
      if (isLocalRadar) {
        Alert.alert(
          "Radar Reportado",
          "Radar salvo localmente! Ele aparecerá no mapa e será sincronizado quando o servidor estiver disponível.",
        );
      } else {
        Alert.alert(
          "Sucesso",
          "Radar reportado com sucesso! Outros usuários verão em breve.",
        );
      }
    } catch (error: any) {
      console.error("Erro ao reportar radar:", error);

      // Radares somente via API - sem fallback local
      if (
        error?.message?.includes("404") ||
        error?.message?.includes("Network")
      ) {
        Alert.alert(
          "Servidor indisponível",
          "Não foi possível reportar o radar. Verifique sua conexão e tente novamente.",
        );
        return;
      }

      Alert.alert(
        "Erro",
        error.message || "Não foi possível reportar o radar. Tente novamente.",
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
            }),
          );

          const filtered = filterRadarsNearRoute(
            recentRadars,
            routePoints,
            100,
          );

          if (filtered.length > 0) {
            setFilteredRadars((prev) => {
              const existingIds = new Set(prev.map((r) => r.id));
              const newFiltered = filtered.filter(
                (r) => !existingIds.has(r.id),
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
          {/* Renderizar MapboxNavigation primeiro (base) */}
          <MapboxNavigation
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
            // @ts-ignore - radars prop exists in MapboxNavigationProps
            radars={filteredRadars.map((r) => ({
              id: r.id,
              latitude: r.latitude,
              longitude: r.longitude,
              speedLimit: r.speedLimit,
            }))}
            // @ts-ignore - nearbyRadarIds prop exists in MapboxNavigationProps
            nearbyRadarIds={Array.from(nearbyRadarIds)}
            // @ts-ignore - bottomPadding prop exists in MapboxNavigationProps
            bottomPadding={
              nearestRadar ? (Platform.OS === "ios" ? 180 : 240) : 0
            }
            onLocationChange={(location: any) => {
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
                    // Aumentado de 10 para 20 metros para evitar movimentos erráticos
                    if (currentLocation) {
                      const distance = calculateDistance(
                        currentLocation.latitude,
                        currentLocation.longitude,
                        newLocation.latitude,
                        newLocation.longitude,
                      );

                      // Se a distância for muito pequena (< 20m), não atualizar
                      // Isso evita que a localização fique "pulando" por causa de ruído do GPS
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
                          "⚠️ Mudança de localização muito grande, ignorando (possível erro GPS)",
                        );
                        return;
                      }
                    }

                    setCurrentLocation(newLocation);
                    lastLocationUpdate.current = now;
                  } catch (error) {
                    console.error("Erro ao processar localização:", error);
                  }
                }, 1000); // Debounce de 1 segundo para evitar atualizações muito frequentes

                // Buscar radares próximos durante navegação (atualizar conforme se move)
                // Usar debounce para não fazer muitas requisições
                if (
                  !locationWatchRef.current?.lastRadarFetch ||
                  now - locationWatchRef.current.lastRadarFetch > 30000 // 30 segundos
                ) {
                  getRadarsNearLocation(
                    location.latitude,
                    location.longitude,
                    500, // raio de 500m durante navegação
                  )
                    .then((nearbyRadars) => {
                      try {
                        // Filtrar apenas radares próximos à rota
                        if (
                          routeData &&
                          routeData.route?.geometry?.coordinates
                        ) {
                          const routePoints =
                            routeData.route.geometry.coordinates.map(
                              (coord: number[]) => ({
                                latitude: coord[1],
                                longitude: coord[0],
                              }),
                            );
                          const filtered = filterRadarsNearRoute(
                            nearbyRadars,
                            routePoints,
                            100,
                          );
                          // Mesclar com radares existentes da rota
                          setRadars((prev) => {
                            const existingIds = new Set(prev.map((r) => r.id));
                            const newRadars = filtered.filter(
                              (r) => !existingIds.has(r.id),
                            );
                            const merged =
                              newRadars.length > 0
                                ? [...prev, ...newRadars]
                                : prev;
                            // Re-filtrar todos os radares
                            const allFiltered = filterRadarsNearRoute(
                              merged,
                              routePoints,
                              100,
                            );
                            setFilteredRadars(allFiltered);
                            return allFiltered;
                          });
                        }
                      } catch (error) {
                        console.error(
                          "Erro ao processar radares próximos:",
                          error,
                        );
                      }
                    })
                    .catch((error) => {
                      console.error(
                        "Erro ao buscar radares durante navegação:",
                        error,
                      );
                    });

                  if (!locationWatchRef.current) {
                    locationWatchRef.current = { lastRadarFetch: now };
                  } else {
                    locationWatchRef.current.lastRadarFetch = now;
                  }
                }

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
                // Usar debounce para evitar cálculos muito frequentes
                const checkRadarDistance = () => {
                  try {
                    // Verificações de null para evitar NullPointerException
                    if (
                      !location ||
                      location.latitude == null ||
                      location.longitude == null
                    ) {
                      return;
                    }

                    if (
                      !routeData ||
                      !routeData.route ||
                      !routeData.route.geometry ||
                      !routeData.route.geometry.coordinates
                    ) {
                      return;
                    }

                    console.log(
                      `🔍 Verificando radares: filteredRadars=${filteredRadars.length}, routeData=${!!routeData}`,
                    );

                    if (filteredRadars.length > 0 && routeData) {
                      // Usar a localização do callback diretamente
                      const checkLocation = {
                        latitude: location.latitude,
                        longitude: location.longitude,
                      };

                      // Obter pontos da rota para cálculo mais preciso
                      const coordinates = routeData.route.geometry.coordinates;
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
                            point !== null,
                        );

                      if (routePoints.length === 0) {
                        return;
                      }

                      // Encontrar o radar mais próximo
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
                          routePoints,
                        );
                        if (routeDistance > 100) {
                          return;
                        }

                        const routeDistanceResult = calculateDistanceAlongRoute(
                          checkLocation,
                          radarPoint,
                          routePoints,
                        );

                        if (routeDistanceResult.hasPassed) {
                          passedRadarIds.current.add(radar.id);
                          return;
                        }

                        const distanceAlongRoute = routeDistanceResult.distance;
                        if (distanceAlongRoute < 0 || distanceAlongRoute >= 500) {
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

                      // Verificar se há radar próximo
                      if (nearest) {
                        // Type guard explícito para ajudar TypeScript
                        const nearestData: NearestRadar = nearest;
                        const nearestDistance = nearestData.distance;
                        const nearestRadarObj = nearestData.radar;

                        console.log(
                          `📍 Radar próximo encontrado: ${nearestRadarObj.id}, distância: ${nearestDistance}m, routeDistance: ${nearestData.routeDistance}m`,
                        );
                        console.log(
                          `📊 Modal será ${nearestDistance <= 200 ? "exibido" : "oculto"} (distância: ${nearestDistance}m)`,
                        );

                        // Atualizar só quando a distância (em blocos de 10m) mudar
                        if (
                          nearestDistance === lastCalculatedDistance.current &&
                          lastCalculatedDistance.current > 0
                        ) {
                          return;
                        }
                        lastCalculatedDistance.current = nearestDistance;

                        // Limpar timer anterior se existir
                        if (modalTimerRef.current) {
                          clearTimeout(modalTimerRef.current);
                          modalTimerRef.current = null;
                        }

                        // Atualizar conjunto de radares próximos para animação no mapa
                        // Isso vai atualizar o CircleLayer pulsante no MapboxNavigationView.kt
                        const nearbyIds = new Set([nearestRadarObj.id]);
                        setNearbyRadarIds(nearbyIds);

                        // Atualizar propriedade isNearby no GeoJSON source do MapboxNavigation
                        // Isso é feito automaticamente quando setRadars é chamado novamente
                        // Por enquanto, apenas marcar como próximo para o filtro funcionar

                        // Mostrar modal se estiver entre 300m e 0m ao longo da rota (distância em blocos de 10m)
                        if (nearestDistance <= 300) {
                          // Chegou no radar (0m ou último passo 10m): marcar passado e manter modal 3s
                          if (nearestDistance < 10) {
                            passedRadarIds.current.add(nearestRadarObj.id);

                            if (radarZeroTimeRef2.current === null) {
                              radarZeroTimeRef2.current = Date.now();
                            }

                            // Manter modal visível por 3 segundos após chegar a 0m
                            const timeSinceZero =
                              Date.now() - (radarZeroTimeRef2.current || 0);
                            if (timeSinceZero < 3000) {
                              // Ainda dentro dos 3 segundos, manter modal em 0m
                              setNearestRadar({
                                radar: nearestRadarObj,
                                distance: 0,
                              });

                              // Animações normais (sem pulsação)
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
                              // Passou 3 segundos, esconder modal
                              radarZeroTimeRef2.current = null;
                              hideModal();
                            }
                          } else {
                            // Resetar contador se distância aumentou
                            radarZeroTimeRef2.current = null;

                            // Mostrar/atualizar modal com animações normais (sem pulsação)
                            setNearestRadar({
                              radar: nearestRadarObj,
                              distance: nearestDistance,
                            });

                            // Animações de entrada/atualização
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
                          // Radar muito distante, esconder modal
                          radarZeroTimeRef2.current = null;
                          hideModal();
                        }

                        // Alerta de voz quando radar está próximo - APENAS UMA VEZ por radar
                        const radarId = nearestRadarObj.id;

                        // Verificar se este radar já foi alertado
                        if (
                          !alertedRadarIds.current.has(radarId) &&
                          nearestDistance <= 300 &&
                          nearestDistance > 0
                        ) {
                          // Marcar como alertado IMEDIATAMENTE para evitar repetição
                          alertedRadarIds.current.add(radarId);

                          let message = "";
                          if (nearestDistance > 200) {
                            message = `Radar a ${Math.round(nearestDistance)} metros`;
                          } else if (nearestDistance > 100) {
                            message = `Atenção! Radar a ${Math.round(nearestDistance)} metros`;
                          } else if (nearestDistance > 30) {
                            message = `Cuidado! Radar a ${Math.round(nearestDistance)} metros`;
                          } else {
                            message = `Atenção! Radar próximo`;
                          }

                          const speedLimit = nearestRadarObj.speedLimit;
                          if (speedLimit) {
                            message += `. Limite de velocidade ${speedLimit} quilômetros por hora`;
                          }

                          if (Tts && typeof Tts.speak === "function") {
                            try {
                              Tts.speak(message);
                              console.log(
                                `🔊 Alerta de radar: ${message} (ID: ${radarId})`,
                              );
                            } catch (error) {
                              console.error(
                                "❌ Erro ao falar mensagem TTS:",
                                error,
                              );
                            }
                          }
                        }
                      } else {
                        // Esconder modal se não houver radar próximo
                        console.log(
                          `❌ Nenhum radar próximo encontrado (filteredRadars: ${filteredRadars.length})`,
                        );
                        radarZeroTimeRef2.current = null;
                        lastCalculatedDistance.current = 0;
                        setNearbyRadarIds(new Set()); // Limpar radares próximos
                        hideModal();
                      }
                    } else {
                      console.log(
                        `⚠️ Não há radares filtrados ou routeData não disponível`,
                      );
                    }
                  } catch (error) {
                    console.error(
                      "Erro ao verificar distância dos radares:",
                      error,
                    );
                  }
                };

                // Limpar timeout anterior se existir
                if (locationUpdateDebounce.current) {
                  clearTimeout(locationUpdateDebounce.current);
                }

                // Rodar uma vez imediatamente para atualização rápida do modal
                checkRadarDistance();
                // Agendar próximas verificações com debounce 500ms (contagem mais suave, menos pulos)
                locationUpdateDebounce.current = setTimeout(
                  checkRadarDistance,
                  500,
                );
              } catch (error) {
                console.error("Erro no callback onLocationChange:", error);
              }
            }}
            onRouteProgressChange={(progress: any) => {
              // Verificação de null para evitar NullPointerException
              if (!progress) {
                return;
              }
              try {
                // Progresso da rota atualizado pelo SDK
                // Logs removidos para evitar travamento - este callback é chamado muito frequentemente
                // progress.speedLimit contém o limite de velocidade em km/h (se disponível)
              } catch (error) {
                console.error("Erro ao processar progresso da rota:", error);
              }
            }}
            onArrive={() => {
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
            }}
            onCancelNavigation={() => {
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
            }}
            onError={(error: any) => {
              try {
                if (!error) {
                  console.error("Erro na navegação: erro desconhecido");
                  return;
                }
                console.error("Erro na navegação:", error);
                const errorMessage =
                  error?.message || error?.toString() || "Erro na navegação";
                Alert.alert("Erro", errorMessage);
              } catch (e) {
                console.error("Erro ao processar erro de navegação:", e);
              }
            }}
          />

          {/* Botão de reportar radar - estilo Waze */}
          <TouchableOpacity
            style={styles.reportRadarButton}
            onPress={handleReportRadar}
            disabled={isReportingRadar}
            activeOpacity={0.7}
          >
            {isReportingRadar ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.reportRadarButtonText}>
                <Image source={require("../assets/images/radar.png")} style={styles.reportRadarButtonImage} />
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.mapContainer} pointerEvents="box-none">
          <Map
            radars={radars}
            route={route}
            isNavigating={false}
            currentLocation={currentLocation}
            nearbyRadarIds={nearbyRadarIds}
          />
        </View>
      )}

      {/* Alerta de radar - Modal animado no topo */}
      {isNavigating &&
        nearestRadar &&
        (() => {
          console.log(
            `🎯 Renderizando modal: isNavigating=${isNavigating}, nearestRadar=${!!nearestRadar}, distance=${nearestRadar.distance}m`,
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
    bottom: Platform.OS === "ios" ? 300 : 140,
    left: 16,
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
  },
  radarAlertIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  radarAlertTextContainer: {
    flex: 1,
  },
  radarAlertTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 2,
    opacity: 0.9,
  },
  radarAlertDistance: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#ffff",
  },
  radarAlertSpeed: {
    fontSize: 46,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.85)",
  },
  radarCount: {
    marginTop: 8,
    fontSize: 12,
    color: "#6b7280",
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

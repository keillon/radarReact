import React, {
  startTransition,
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
  View,
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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getClosestPlacaName, radarImages, type MapHandle } from "../components/Map";
import SearchContainer from "../components/SearchContainer";
import { VignetteOverlay } from "../components/VignetteOverlay";
import { useRadarProximity } from "../hooks/useRadarProximity";
import {
  API_BASE_URL,
  confirmRadar,
  denyRadar,
  getRadarsNearLocation,
  Radar,
  reportRadar,
} from "../services/api";
import {
  geocodeAddress,
  getRoute,
  initMapbox,
  LatLng,
  reverseGeocode,
  RouteResponse,
} from "../services/mapbox";
import { areMapboxRadarArraysEqual } from "../utils/radarDiff";
import {
  calculateDistance,
  getCumulativeDistances,
} from "../utils/radarGeometry";
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

// Alerta sonoro: tocar alertRadar.mp3 3 vezes (ao chegar em 30m)
function playAlertRadar3Times(): void {
  try {
    const Sound = require("react-native-sound").default;
    Sound.setCategory("Playback", true);
    const s = new Sound(
      require("../assets/audios/alertRadar.mp3"),
      (error: any) => {
        if (error) {
          console.warn("Falha ao carregar alertRadar.mp3:", error);
          const Tts = getTts();
          if (Tts && typeof Tts.speak === "function") {
            try {
              Tts.speak("Atenção radar muito próximo");
            } catch {}
          }
          return;
        }
        const playOnce = (count: number) => {
          if (count <= 0) {
            s.release();
            return;
          }
          s.setCurrentTime(0);
          s.play((success: boolean) => {
            if (count > 1 && success) {
              setTimeout(() => playOnce(count - 1), 300);
            } else {
              if (!success) {
                console.warn("Falha ao reproduzir alertRadar.mp3");
              }
              s.release();
            }
          });
        };
        playOnce(3);
      },
    );
  } catch (e) {
    // react-native-sound pode não estar linkado
  }
}

const DEVICE_USER_ID_KEY = "radarbot_device_user_id";

// Array vazio estável para evitar "Maximum update depth" quando !isNavigating.
const EMPTY_MAPBOX_RADARS: Array<{
  id: string;
  latitude: number;
  longitude: number;
  speedLimit: number;
  type: string;
}> = [];

async function getOrCreateDeviceUserId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_USER_ID_KEY);
  if (existing && existing.trim().length > 0) return existing;

  const generated = `device-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  await AsyncStorage.setItem(DEVICE_USER_ID_KEY, generated);
  return generated;
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

const buildRouteSignature = (coordinates: number[][]): string => {
  const len = coordinates.length;
  if (len === 0) return "empty";
  const first = coordinates[0] ?? [0, 0];
  const mid = coordinates[Math.floor(len / 2)] ?? [0, 0];
  const last = coordinates[len - 1] ?? [0, 0];
  return `${len}|${first[0]},${first[1]}|${mid[0]},${mid[1]}|${last[0]},${last[1]}`;
};

interface HomeProps {
  onOpenEditor?: () => void;
}

const normalizeRadarType = (value?: string): string => {
  if (!value) return "unknown";
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

/** Formata "há X tempo" a partir de timestamp em ms */
const formatTimeAgo = (ms: number): string => {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (min < 1) return "Agora mesmo";
  if (min < 60) return `Há ${min} min`;
  if (h < 24) return `Há ${h}h`;
  if (d < 7) return `Há ${d} dia${d > 1 ? "s" : ""}`;
  return new Date(ms).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const normalizeRadarPayload = (raw: any): Radar | null => {
  if (!raw || raw.id == null) return null;
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  return {
    id: String(raw.id),
    latitude,
    longitude,
    speedLimit:
      raw.speedLimit ?? raw.velocidadeLeve ?? raw.velocidade ?? undefined,
    type: raw.type ?? raw.tipoRadar ?? raw.tipo ?? "unknown",
    situacao: raw.situacao ?? null,
    ativo: raw.ativo,
    confirms: raw.confirms,
    denies: raw.denies,
  };
};

export default function Home({ onOpenEditor }: HomeProps) {
  type RadarArrayUpdater = Radar[] | ((prev: Radar[]) => Radar[]);
  type RadarIdArrayUpdater = string[] | ((prev: string[]) => string[]);

  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [destinationText, setDestinationText] = useState<string>("");
  const [route, setRoute] = useState<any>(null);
  const [routeData, setRouteData] = useState<RouteResponse | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isPreparingNavigation, setIsPreparingNavigation] = useState(false);
  // Radares do CSV: 16k+ radares fixos, carregados 1x, NUNCA mudam
  const [csvRadarsMap, setCsvRadarsMap] = useState<Map<string, Radar>>(
    new Map(),
  );
  // Radares reportados: apenas radares criados por usuários, lista pequena e dinâmica
  const [reportedRadarsMap, setReportedRadarsMap] = useState<
    Map<string, Radar>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null);
  const [alertedRadars, setAlertedRadars] = useState<Set<string>>(new Set());
  const [nearestRadar, setNearestRadar] = useState<{
    radar: Radar;
    distance: number;
  } | null>(null);
  // REMOVED: filteredRadars - agora mostramos TODOS os radares sem filtro
  const [nearbyRadarIds, setNearbyRadarIds] = useState<Set<string>>(new Set()); // IDs dos radares próximos para animação
  const [isReportingRadar, setIsReportingRadar] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showLocationErrorModal, setShowLocationErrorModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [reportSpeedLimit, setReportSpeedLimit] = useState("");
  const [reportRadarType, setReportRadarType] = useState<
    "móvel" | "semaforo" | "placa"
  >("placa");
  const [MapboxNavComponent, setMapboxNavComponent] =
    useState<React.ComponentType<any> | null>(null);
  const [mapboxNavError, setMapboxNavError] = useState<string | null>(null);
  const [geoJsonRefreshKey, setGeoJsonRefreshKey] = useState(0);
  const refreshGeoJsonRef = useRef<() => void>(() => {});
  refreshGeoJsonRef.current = () => setGeoJsonRefreshKey((k) => k + 1);

  // Multi-step report modal states
  const [reportStep, setReportStep] = useState<1 | 2 | 3>(1);
  const [reportSelectedSpeed, setReportSelectedSpeed] = useState<number | null>(
    null,
  );
  const [reportLocationMode, setReportLocationMode] = useState<
    "current" | "map"
  >("current");
  const [reportCustomLocation, setReportCustomLocation] =
    useState<LatLng | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const [mapPickerCenter, setMapPickerCenter] = useState<LatLng | null>(null);
  const [pickerPreviewCoords, setPickerPreviewCoords] = useState<LatLng | null>(
    null,
  ); // Preview lat/lon durante marcação
  const pickerPreviewIntervalRef = useRef<ReturnType<
    typeof setInterval
  > | null>(null);
  const [radarPassedLoading, setRadarPassedLoading] = useState(false); // Loading 5s no modal após passar do radar
  const [deviceUserId, setDeviceUserId] = useState<string | null>(null);
  const [liveRadarOverlayMap, setLiveRadarOverlayMap] = useState<
    Map<string, Radar>
  >(new Map());
  const [liveDeletedRadarIdsSetState, setLiveDeletedRadarIdsSetState] =
    useState<Set<string>>(new Set());
  const [showRadarFeedbackCard, setShowRadarFeedbackCard] = useState(false);
  const [radarFeedbackTarget, setRadarFeedbackTarget] = useState<Radar | null>(
    null,
  );
  const [radarFeedbackSubmitting, setRadarFeedbackSubmitting] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: "info" | "success" | "error" | "confirm";
    onConfirm?: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
  }>({
    visible: false,
    title: "",
    message: "",
    type: "info",
  });

  // Radar selecionado ao clicar no mapa (destaque + modal no topo)
  const [selectedRadarDetail, setSelectedRadarDetail] = useState<Radar | null>(
    null,
  );
  const [radarDetailAddress, setRadarDetailAddress] = useState<string | null>(
    null,
  );
  const [vignetteCenter, setVignetteCenter] = useState<{ x: number; y: number } | null>(null);
  const mainMapRef = useRef<MapHandle | null>(null);
  const selectedRadarDetailRef = useRef<Radar | null>(null);

  // CSV radars: converter Map → Array apenas quando CSV muda (raro)
  const csvRadars = useMemo(
    () => Array.from(csvRadarsMap.values()),
    [csvRadarsMap],
  );

  // Reported radars: converter Map → Array quando reportados mudam (frequente, mas lista pequena)
  const reportedRadars = useMemo(
    () => Array.from(reportedRadarsMap.values()),
    [reportedRadarsMap],
  );

  // Combinar: concat é MUITO mais rápido que criar novo Map gigante
  // csvRadars raramente muda (16k array criado 1x), reportedRadars é pequeno
  const radars = useMemo(() => {
    // Dedup: se reported tem mesmo ID que CSV, reported ganha
    const reportedIds = new Set(reportedRadars.map((r) => r.id));
    const filtered = csvRadars.filter((r) => !reportedIds.has(r.id));
    return [...filtered, ...reportedRadars];
  }, [csvRadars, reportedRadars]);

  // setRadars: APENAS para radares CSV (carga inicial)
  const setCsvRadars = useCallback((nextValue: RadarArrayUpdater) => {
    const nextArray =
      typeof nextValue === "function" ? nextValue([]) : nextValue;
    const nextMap = new Map<string, Radar>();
    for (const radar of nextArray) {
      if (!radar?.id) continue;
      nextMap.set(radar.id, radar);
    }
    setCsvRadarsMap(nextMap);
  }, []);

  // Adicionar radar reportado (lista pequena, sempre rápido)
  const addReportedRadar = useCallback((radar: Radar) => {
    if (!radar?.id) return;
    setReportedRadarsMap((prev) => {
      const next = new Map(prev);
      next.set(radar.id, radar);
      return next;
    });
  }, []);

  // Remover radar reportado
  const removeReportedRadar = useCallback((radarId: string) => {
    if (!radarId) return;
    setReportedRadarsMap((prev) => {
      if (!prev.has(radarId)) return prev;
      const next = new Map(prev);
      next.delete(radarId);
      return next;
    });
  }, []);

  const liveRadarOverlay = useMemo(
    () => Array.from(liveRadarOverlayMap.values()),
    [liveRadarOverlayMap],
  );
  const setLiveRadarOverlay = useCallback((nextValue: RadarArrayUpdater) => {
    setLiveRadarOverlayMap((prevMap) => {
      const prevArray = Array.from(prevMap.values());
      const nextArray =
        typeof nextValue === "function"
          ? (nextValue as (prev: Radar[]) => Radar[])(prevArray)
          : nextValue;
      const nextMap = new Map<string, Radar>();
      for (const radar of nextArray) {
        if (!radar?.id) continue;
        nextMap.set(radar.id, radar);
      }
      return nextMap;
    });
  }, []);

  const liveDeletedRadarIds = useMemo(
    () => Array.from(liveDeletedRadarIdsSetState.values()),
    [liveDeletedRadarIdsSetState],
  );
  const setLiveDeletedRadarIds = useCallback(
    (nextValue: RadarIdArrayUpdater) => {
      setLiveDeletedRadarIdsSetState((prevSet) => {
        const prevArray = Array.from(prevSet.values());
        const nextArray =
          typeof nextValue === "function"
            ? (nextValue as (prev: string[]) => string[])(prevArray)
            : nextValue;
        return new Set(nextArray.filter(Boolean));
      });
    },
    [],
  );

  const REPORT_RADAR_TYPES: {
    value: "móvel" | "semaforo" | "placa";
    label: string;
    icon: number;
  }[] = [
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
    {
      value: "placa",
      label: "Placa de Velocidade",
      icon: require("../assets/images/placa60.png"),
    },
  ];

  const locationWatchRef = useRef<any>(null);
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalScale = useRef(new Animated.Value(0.8)).current;
  const loadingOpacity = useRef(new Animated.Value(0)).current;
  const loadingScale = useRef(new Animated.Value(0.9)).current;
  const alertedRadarIds = useRef<Set<string>>(new Set()); // Rastrear radares já alertados (apenas uma vez)
  const lastLocationUpdate = useRef<number>(0);
  const locationUpdateDebounce = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const radarZeroTimeRef2 = useRef<number | null>(null); // Timestamp quando chegou a 0 metros
  const isNavigatingRef = useRef(false);
  const currentLocationRef = useRef<any>(null);
  const isMountedRef = useRef(true);
  const postPassTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Timer 5s para modal pós-passagem
  const radarCriticalSoundPlayedIds = useRef<Set<string>>(new Set()); // Som crítico aos 10m (independente do som de 30m)
  const radarFeedbackDismissTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const radarFeedbackActionIds = useRef<Set<string>>(new Set()); // 1 confirmação/negação por usuário no app (sessão)
  const mapPickerCenterRef = useRef<LatLng | null>(null); // Fallback centro ao abrir picker
  const mapPickerMapRef = useRef<MapHandle | null>(null); // Ref do Map no picker para getCenter()
  const reportCustomLocationRef = useRef<LatLng | null>(null); // Backup da localização escolhida no mapa
  const hasInitialRadarLoadRef = useRef(false);
  const routePointsRef = useRef<LatLng[]>([]);
  const routeCumulativeRef = useRef<number[]>([]);
  // Rota do Mapbox durante navegação (handleRouteChanged) — força re-render para useRadarProximity
  const [routePointsFromNav, setRoutePointsFromNav] = useState<LatLng[] | null>(
    null,
  );
  const lastNearbyRadarIdRef = useRef<string | null>(null);
  const lastRouteSignatureRef = useRef<string>("");
  const lastRouteChangedHandledAtRef = useRef<number>(0);
  const lastRouteGeometryRawRef = useRef<string>("");
  const wsDeferredSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastPushedBaseRef = useRef<any[] | null>(null);
  const lastPushedOverlayRef = useRef<any[] | null>(null);
  const wsFlushScheduledRef = useRef(false);
  const overlayPushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const upsertLiveRadarOverlay = useCallback(
    (radar: Radar) => {
      if (!radar?.id) return;
      setLiveRadarOverlayMap((prevMap) => {
        const nextMap = new Map(prevMap);
        const current = nextMap.get(radar.id);
        nextMap.set(radar.id, current ? { ...current, ...radar } : radar);
        return nextMap;
      });
    },
    [setLiveRadarOverlayMap],
  );

  const removeLiveRadarOverlay = useCallback(
    (radarId: string) => {
      if (!radarId) return;
      setLiveRadarOverlayMap((prevMap) => {
        if (!prevMap.has(radarId)) return prevMap;
        const nextMap = new Map(prevMap);
        nextMap.delete(radarId);
        return nextMap;
      });
    },
    [setLiveRadarOverlayMap],
  );

  const syncAllRadarsFromCurrentLocation = useCallback(
    (clearOverlay: boolean = true) => {
      const loc = currentLocationRef.current;
      if (!loc?.latitude || !loc?.longitude) return;
      if (wsDeferredSyncTimeoutRef.current) {
        clearTimeout(wsDeferredSyncTimeoutRef.current);
      }
      wsDeferredSyncTimeoutRef.current = setTimeout(() => {
        wsDeferredSyncTimeoutRef.current = null;
        getRadarsNearLocation(loc.latitude, loc.longitude, 50000)
          .then((allRadars) => {
            if (!isMountedRef.current) return;
            // startTransition: não bloqueia UI durante sync
            startTransition(() => {
              // CSV sync: atualiza radares fixos do CSV
              setCsvRadarsMap(() => {
                const nextMap = new Map<string, Radar>();
                for (const radar of allRadars) {
                  if (!radar?.id) continue;
                  nextMap.set(radar.id, radar);
                }
                return nextMap;
              });
              if (clearOverlay) {
                setLiveRadarOverlayMap(new Map());
                setLiveDeletedRadarIdsSetState(new Set());
              }
            });
          })
          .catch((error) => {
            console.error("Erro ao sincronizar radares:", error);
          });
      }, 200);
    },
    [],
  );

  // Preview de lat/lon no picker: polling a cada 400ms para mostrar onde o pin está
  useEffect(() => {
    if (!showMapPicker) {
      if (pickerPreviewIntervalRef.current) {
        clearInterval(pickerPreviewIntervalRef.current);
        pickerPreviewIntervalRef.current = null;
      }
      setPickerPreviewCoords(null);
      return;
    }
    setPickerPreviewCoords(mapPickerCenter ?? null);
    pickerPreviewIntervalRef.current = setInterval(() => {
      mapPickerMapRef.current?.getCenter?.().then((center) => {
        if (center != null) setPickerPreviewCoords(center);
      });
    }, 400);
    return () => {
      if (pickerPreviewIntervalRef.current) {
        clearInterval(pickerPreviewIntervalRef.current);
        pickerPreviewIntervalRef.current = null;
      }
    };
  }, [showMapPicker, mapPickerCenter?.latitude, mapPickerCenter?.longitude]);

  // Buscar endereço via reverse geocode (lat/lon) — sempre, para todos os radares
  useEffect(() => {
    if (!selectedRadarDetail) {
      setRadarDetailAddress(null);
      return;
    }
    setRadarDetailAddress(null);
    const radarId = selectedRadarDetail.id;
    let cancelled = false;
    reverseGeocode(
      selectedRadarDetail.latitude,
      selectedRadarDetail.longitude
    ).then((place) => {
      if (!cancelled && isMountedRef.current && selectedRadarDetailRef.current?.id === radarId) {
        setRadarDetailAddress(place ?? "Endereço não disponível");
      }
    });
    return () => { cancelled = true; };
  }, [selectedRadarDetail?.id, selectedRadarDetail?.latitude, selectedRadarDetail?.longitude]);

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
      if (radarFeedbackDismissTimerRef.current) {
        clearTimeout(radarFeedbackDismissTimerRef.current);
        radarFeedbackDismissTimerRef.current = null;
      }
      if (wsDeferredSyncTimeoutRef.current) {
        clearTimeout(wsDeferredSyncTimeoutRef.current);
        wsDeferredSyncTimeoutRef.current = null;
      }
      isMountedRef.current = false;
    };
  }, []);

  // routePoints síncrono para useRadarProximity — evita race com refs que não disparam re-render
  const routePointsFromData = useMemo(() => {
    const coordinates = routeData?.route?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
    return coordinates
      .map((coord: number[]) => {
        if (!Array.isArray(coord) || coord.length < 2) return null;
        return { latitude: coord[1], longitude: coord[0] };
      })
      .filter((p: LatLng | null): p is LatLng => p !== null);
  }, [routeData?.route?.geometry?.coordinates]);

  const routeCumulativeFromData = useMemo(
    () =>
      routePointsFromData.length >= 2
        ? getCumulativeDistances(routePointsFromData)
        : [],
    [routePointsFromData],
  );

  const routePointsForProximity = useMemo(() => {
    if (
      isNavigating &&
      routePointsFromNav != null &&
      routePointsFromNav.length >= 2
    ) {
      return routePointsFromNav;
    }
    return routePointsFromData;
  }, [isNavigating, routePointsFromNav, routePointsFromData]);

  const routeCumulativeForProximity = useMemo(() => {
    if (
      isNavigating &&
      routePointsFromNav != null &&
      routePointsFromNav.length >= 2
    ) {
      return getCumulativeDistances(routePointsFromNav);
    }
    return routeCumulativeFromData;
  }, [isNavigating, routePointsFromNav, routeCumulativeFromData]);

  useEffect(() => {
    routePointsRef.current = routePointsFromData;
    routeCumulativeRef.current = routeCumulativeFromData;
  }, [routePointsFromData, routeCumulativeFromData]);

  useEffect(() => {
    let mounted = true;
    getOrCreateDeviceUserId()
      .then((id) => {
        if (mounted) setDeviceUserId(id);
      })
      .catch((error) => {
        console.warn("Erro ao inicializar deviceUserId:", error);
      });

    return () => {
      mounted = false;
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

      getGeolocation().getCurrentPosition(
        (position: { coords: { latitude: number; longitude: number } }) => {
          const loc: LatLng = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          console.log(`📍 Localização obtida:`, loc);
          setCurrentLocation(loc);
          setOrigin(loc); // Origem sempre será a localização atual

          // Carga inicial única de radares (sem polling/requisições repetidas)
          if (!hasInitialRadarLoadRef.current) {
            hasInitialRadarLoadRef.current = true;
            getRadarsNearLocation(loc.latitude, loc.longitude, 50000)
              .then((nearbyRadars) => {
                console.log(
                  `✅ ${nearbyRadars.length} radares encontrados na inicialização`,
                );
                // Carga inicial de radares CSV
                setCsvRadars(nearbyRadars);
              })
              .catch((error) => {
                console.error(
                  "Erro ao buscar radares na inicialização:",
                  error,
                );
              });
          }
        },
        (error: unknown) => {
          console.error("Erro ao obter localização:", error);
          setShowLocationErrorModal(true);
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 5000,
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

      // Limpar estado de radares para nova navegação (cada viagem começa "limpa")
      alertedRadarIds.current.clear();
      radarCriticalSoundPlayedIds.current.clear();
      resetProximityState();
      radarZeroTimeRef2.current = null;
      if (postPassTimerRef.current) {
        clearTimeout(postPassTimerRef.current);
        postPassTimerRef.current = null;
      }
      setRadarPassedLoading(false);

      // Iniciar navegação IMEDIATAMENTE (não esperar radares)
      setIsNavigating(true);

      // TODOS os radares já estão visíveis - não filtramos mais

      // Fechar loading rapidamente
      Animated.timing(loadingOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setIsPreparingNavigation(false);
        loadingOpacity.setValue(0);
      });

      // Sem chamada extra por rota: usa cache local + atualizações em tempo real via WebSocket.
      // Caso a lista ainda esteja vazia, faz uma única carga ampla.
      if (radars.length === 0 && !hasInitialRadarLoadRef.current) {
        hasInitialRadarLoadRef.current = true;
        getRadarsNearLocation(origin.latitude, origin.longitude, 50000)
          .then((initialRadars) => setCsvRadars(initialRadars))
          .catch((err) => {
            console.error(
              "Erro ao carregar radares iniciais na navegação:",
              err,
            );
          });
      }
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
          "Não foi possível calcular a rota. Verifique o endereço digitado.",
      );
    } finally {
      setLoading(false);
      setGeocoding(false);
    }
  };

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
      },
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

  const handleRadarPress = useCallback((radar: Radar) => {
    setSelectedRadarDetail(radar);
    setVignetteCenter(null);
    selectedRadarDetailRef.current = radar;
    mainMapRef.current?.focusOnCoord(radar.latitude, radar.longitude);
  }, []);

  // Reportar radar na localização atual (modal: velocidade + tipo).
  // Futuro: mesma lógica pode ser usada para reportar acidentes, trânsito, etc. (estilo Waze) — por ora só radar.
  const handleReportRadar = async (opts?: {
    speedLimit?: number;
    type?: "móvel" | "semaforo" | "placa";
    location?: LatLng;
  }) => {
    const speedLimit = opts?.speedLimit ?? reportSelectedSpeed;
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

    setShowReportModal(false);
    setShowMapPicker(false);

    // Resetar modal de reportar para estado inicial (evita ficar no último passo)
    setReportStep(1);
    setReportSelectedSpeed(null);
    setReportRadarType("placa");
    setReportLocationMode("current");
    setReportCustomLocation(null);
    reportCustomLocationRef.current = null;
    mapPickerCenterRef.current = null;

    // Determinar coordenadas de forma Síncrona.
    // IMPORTANTE: se existir ponto marcado no mapa, ele tem prioridade.
    let reportCoords: LatLng | null = null;
    if (opts?.location) {
      reportCoords = {
        latitude: opts.location.latitude,
        longitude: opts.location.longitude,
      };
    }
    const pickerPoint =
      reportCustomLocationRef.current ||
      reportCustomLocation ||
      mapPickerCenterRef.current ||
      mapPickerCenter;
    if (!reportCoords && reportLocationMode === "map") {
      if (reportCustomLocationRef.current) {
        reportCoords = reportCustomLocationRef.current;
      } else if (reportCustomLocation) {
        reportCoords = reportCustomLocation;
      } else if (pickerPoint) {
        reportCoords = {
          latitude: pickerPoint.latitude,
          longitude: pickerPoint.longitude,
        };
      } else {
        setModalConfig({
          visible: true,
          title: "Erro",
          message: "Selecione uma localização no mapa",
          type: "error",
        });
        return;
      }
    } else if (!reportCoords) {
      if (currentLocation) {
        reportCoords = {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        };
      } else {
        setModalConfig({
          visible: true,
          title: "Erro",
          message: "Localização atual indisponível",
          type: "error",
        });
        return;
      }
    }

    // INSTANT FEEDBACK: adiciona à lista reportedRadars (pequena, dinâmica, nunca crashará)
    // NUNCA toca na lista CSV de 16k+ radares
    const tempRadar: Radar = {
      id: `temp_${Date.now()}`,
      latitude: reportCoords.latitude,
      longitude: reportCoords.longitude,
      speedLimit: speedLimit,
      type: type,
    };

    // Feedback visual primeiro
    setSuccessMessage(
      "Radar reportado com sucesso! ✅\n\nObrigado por ajudar!",
    );
    setShowSuccessModal(true);
    setReportSpeedLimit("");
    setReportRadarType("móvel");

    // Atualização em baixa prioridade para não travar a UI (evita ANR ao reportar)
    startTransition(() => {
      addReportedRadar(tempRadar);
      if (isNavigating) {
        upsertLiveRadarOverlay(tempRadar);
      }
    });

    // Auto-dismiss modal
    setTimeout(() => {
      if (isMountedRef.current) setShowSuccessModal(false);
    }, 3000);

    // API em background
    reportRadar({
      latitude: reportCoords.latitude,
      longitude: reportCoords.longitude,
      speedLimit: speedLimit,
      type,
      reportedBy: deviceUserId || undefined,
    })
      .then((realRadar) => {
        console.log("✅ Radar confirmado pelo servidor");
        // Substituir temp pelo real
        startTransition(() => {
          if (!isMountedRef.current) return;
          removeReportedRadar(tempRadar.id);
          addReportedRadar(realRadar);
          if (isNavigating) {
            removeLiveRadarOverlay(tempRadar.id);
            upsertLiveRadarOverlay(realRadar);
          }
        });
      })
      .catch((err) => {
        console.error("❌ Erro ao reportar radar:", err);
        // Remover radar temporário
        startTransition(() => {
          if (isMountedRef.current) {
            removeReportedRadar(tempRadar.id);
            if (isNavigating) {
              removeLiveRadarOverlay(tempRadar.id);
            }
            setModalConfig({
              visible: true,
              title: "Erro ao Reportar",
              message:
                "Não foi possível enviar o radar. Verifique sua conexão e tente novamente.",
              type: "error",
            });
          }
        });
      });
  };

  // Atualizações de radares em tempo real: APENAS via WebSocket (radar:new, radar:update, radar:delete).
  // Sem polling: quando alguém reporta, o backend envia pelo WebSocket e o mapa atualiza uma vez.

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

  // Manter refs atualizados para os handlers (evitar closure obsoleta)
  isNavigatingRef.current = isNavigating;
  currentLocationRef.current = currentLocation;

  // Preparar radares para o MapboxNavigation
  const liveOverlayMapboxRadars = useMemo(() => {
    if (!isNavigating || liveRadarOverlay.length === 0) return [];
    return liveRadarOverlay.map((r: any) => ({
      id: r.id,
      latitude: r.latitude,
      longitude: r.longitude,
      speedLimit: r.speedLimit ?? r.velocidadeLeve ?? 0,
      type: normalizeRadarType(r.type ?? r.tipoRadar ?? "unknown"),
    }));
  }, [isNavigating, liveRadarOverlay]);

  const liveDeletedRadarIdsSet = useMemo(
    () => new Set(liveDeletedRadarIds),
    [liveDeletedRadarIds],
  );

  // Base vem do servidor via URL no nativo; mapboxRadars usado apenas para lógica JS (proximity)
  const mapboxRadars = useMemo(() => {
    if (!isNavigating) return EMPTY_MAPBOX_RADARS;
    const overlayIds = new Set(
      liveOverlayMapboxRadars
        .filter((r) => !liveDeletedRadarIdsSet.has(r.id))
        .map((r) => r.id),
    );
    const overlayFirst = liveOverlayMapboxRadars.filter(
      (r) => r?.id && !liveDeletedRadarIdsSet.has(r.id),
    );
    const rest = (
      csvRadars as Array<{
        id?: string;
        latitude?: number;
        longitude?: number;
        speedLimit?: number;
        type?: string;
      }>
    )
      .filter(
        (r) =>
          r?.id &&
          !liveDeletedRadarIdsSet.has(r.id) &&
          !overlayIds.has(r.id) &&
          r.latitude != null &&
          r.longitude != null,
      )
      .map((r) => ({
        id: r.id!,
        latitude: r.latitude!,
        longitude: r.longitude!,
        speedLimit: r.speedLimit ?? (r as any).velocidadeLeve ?? 0,
        type: normalizeRadarType(r.type ?? (r as any).tipoRadar ?? "unknown"),
      }));
    return [...overlayFirst, ...rest];
  }, [
    isNavigating,
    csvRadars,
    liveOverlayMapboxRadars,
    liveDeletedRadarIdsSet,
  ]);

  // Para cálculo do modal/metros, usamos base + overlay em tempo real (somente JS).
  const radarsForProximity = useMemo(() => {
    if (liveRadarOverlay.length === 0 && liveDeletedRadarIds.length === 0)
      return radars;
    const deletedIdsSet = new Set(liveDeletedRadarIds);
    const map = new Map<string, Radar>();
    for (const radar of radars) {
      if (!radar?.id) continue;
      if (deletedIdsSet.has(radar.id)) continue;
      map.set(radar.id, radar);
    }
    for (const overlay of liveRadarOverlay) {
      if (!overlay?.id) continue;
      if (deletedIdsSet.has(overlay.id)) {
        map.delete(overlay.id);
        continue;
      }
      const current = map.get(overlay.id);
      map.set(overlay.id, current ? { ...current, ...overlay } : overlay);
    }
    return Array.from(map.values());
  }, [radars, liveRadarOverlay, liveDeletedRadarIds]);

  const proximity = useRadarProximity({
    currentLocation,
    routePoints: routePointsForProximity,
    cumulativeDistances: routeCumulativeForProximity,
    radars: radarsForProximity,
  });
  const {
    radarAtivo,
    distanciaAtual,
    acabouDePassar,
    deveTocarAlerta,
    deveAbrirModal,
    nearbyRadarIds: proximityNearbyRadarIds,
    rearmRadarState,
    resetProximityState,
  } = proximity;

  const rearmRadarRuntimeState = useCallback(
    (radarIds: string[]) => {
      if (!radarIds || radarIds.length === 0) return;
      radarIds.forEach((id) => {
        if (!id) return;
        alertedRadarIds.current.delete(id);
        radarCriticalSoundPlayedIds.current.delete(id);
        radarFeedbackActionIds.current.delete(id);
        if (lastNearbyRadarIdRef.current === id)
          lastNearbyRadarIdRef.current = null;
      });
      rearmRadarState(radarIds);
    },
    [rearmRadarState],
  );

  // Base: CSV ao longo da rota — enviada UMA vez, nunca muda ao reportar
  const [mapboxBaseForNative, setMapboxBaseForNative] = useState<
    Array<{
      id: string;
      latitude: number;
      longitude: number;
      speedLimit: number;
      type: string;
    }>
  >([]);
  // Overlay: SOMENTE radares reportados — enviada ao reportar (lista pequena, 1–10 itens)
  const [mapboxOverlayForNative, setMapboxOverlayForNative] = useState<
    Array<{
      id: string;
      latitude: number;
      longitude: number;
      speedLimit: number;
      type: string;
    }>
  >([]);

  // Base: nativo carrega via URL GeoJSON (GET /radars/geojson) — sem bridge, otimizado
  useEffect(() => {
    if (!isNavigating) {
      setLiveDeletedRadarIds([]);
      lastPushedBaseRef.current = null;
      setMapboxBaseForNative([]);
      setMapboxOverlayForNative([]);
      return;
    }
    setMapboxBaseForNative([]);
  }, [isNavigating]);

  // Overlay: push SOMENTE quando reporta (lista pequena)
  const overlayToPush = useMemo(() => {
    if (!isNavigating) return [];
    return liveOverlayMapboxRadars.filter(
      (r) => r?.id && !liveDeletedRadarIdsSet.has(r.id),
    );
  }, [isNavigating, liveOverlayMapboxRadars, liveDeletedRadarIdsSet]);

  useEffect(() => {
    if (!isNavigating) return;
    if (overlayPushTimeoutRef.current)
      clearTimeout(overlayPushTimeoutRef.current);
    overlayPushTimeoutRef.current = setTimeout(() => {
      overlayPushTimeoutRef.current = null;
      if (
        areMapboxRadarArraysEqual(
          lastPushedOverlayRef.current as typeof overlayToPush | null,
          overlayToPush,
        )
      )
        return;
      lastPushedOverlayRef.current = overlayToPush;
      setMapboxOverlayForNative(overlayToPush);
    }, 0);
    return () => {
      if (overlayPushTimeoutRef.current)
        clearTimeout(overlayPushTimeoutRef.current);
    };
  }, [isNavigating, overlayToPush]);

  // WebSocket: única fonte de atualizações em tempo real (sem polling).
  // Alguém reporta radar → backend emite radar:new → cliente recebe e atualiza o mapa uma vez.
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    const queuedEvents: Array<{ event: string; payload: any }> = [];

    const flushQueuedWsEvents = () => {
      if (!isMountedRef.current || queuedEvents.length === 0) return;
      try {
        const batch = queuedEvents.splice(0, Math.min(queuedEvents.length, 15));
        const overlayUpserts = new Map<string, Radar>();
        const overlayDeletes = new Set<string>();
        const baseUpserts = new Map<string, Radar>();
        const baseDeletes = new Set<string>();
        let shouldRefreshAll = false;

        for (const { event, payload } of batch) {
          switch (event) {
            case "radar:new":
            case "radar:created":
            case "radar:update":
            case "radar:updated": {
              const normalized = normalizeRadarPayload(payload);
              if (!normalized) break;
              overlayDeletes.delete(normalized.id);
              overlayUpserts.set(normalized.id, normalized);
              if (!isNavigatingRef.current) {
                baseDeletes.delete(normalized.id);
                baseUpserts.set(normalized.id, normalized);
              }
              break;
            }
            case "radar:delete":
            case "radar:removed": {
              const deletedId = String(payload?.id ?? "");
              if (!deletedId) break;
              overlayUpserts.delete(deletedId);
              overlayDeletes.add(deletedId);
              if (!isNavigatingRef.current) {
                baseUpserts.delete(deletedId);
                baseDeletes.add(deletedId);
              }
              break;
            }
            case "radar:refresh": {
              shouldRefreshAll = true;
              break;
            }
          }
        }

        if (overlayUpserts.size > 0 || overlayDeletes.size > 0) {
          rearmRadarRuntimeState(Array.from(overlayUpserts.keys()));
        }

        if (overlayDeletes.size > 0 || baseDeletes.size > 0) {
          refreshGeoJsonRef.current();
        }
        if (overlayUpserts.size > 0 || overlayDeletes.size > 0) {
          setLiveDeletedRadarIdsSetState((prevSet) => {
            const nextSet = new Set(prevSet);
            overlayUpserts.forEach((_, id) => nextSet.delete(id));
            overlayDeletes.forEach((id) => nextSet.add(id));
            return nextSet;
          });
          setLiveRadarOverlayMap((prevMap) => {
            if (prevMap.size === 0 && overlayUpserts.size === 0) return prevMap;
            const nextMap = new Map(prevMap);
            overlayDeletes.forEach((id) => nextMap.delete(id));
            overlayUpserts.forEach((radar, id) => {
              const current = nextMap.get(id);
              nextMap.set(id, current ? { ...current, ...radar } : radar);
            });
            return nextMap;
          });
        }

        if (baseUpserts.size > 0 || baseDeletes.size > 0) {
          setCsvRadarsMap((prevMap) => {
            const nextMap = new Map(prevMap);
            baseDeletes.forEach((id) => nextMap.delete(id));
            baseUpserts.forEach((radar, id) => {
              const current = nextMap.get(id);
              nextMap.set(id, current ? { ...current, ...radar } : radar);
            });
            return nextMap;
          });
        }

        if (baseDeletes.size > 0) {
          setNearbyRadarIds((prev) => {
            let changed = false;
            const nextSet = new Set(prev);
            baseDeletes.forEach((id) => {
              if (nextSet.delete(id)) changed = true;
            });
            return changed ? nextSet : prev;
          });
        }

        if (shouldRefreshAll && !isNavigatingRef.current) {
          syncAllRadarsFromCurrentLocation(true);
        }

        if (
          queuedEvents.length > 0 &&
          isMountedRef.current &&
          !wsFlushScheduledRef.current
        ) {
          wsFlushScheduledRef.current = true;
          setTimeout(() => {
            wsFlushScheduledRef.current = false;
            flushQueuedWsEvents();
          }, 0);
        }
      } catch (err) {
        console.error("Erro ao processar WebSocket:", err);
      }
    };

    const connect = () => {
      try {
        if (!API_BASE_URL) {
          console.warn(
            "⚠️ WebSocket: API_BASE_URL não definida, aguardando...",
          );
          reconnectTimeout = setTimeout(connect, 2000);
          return;
        }

        // Converter http://72.60.247.18:3000 para ws://72.60.247.18:3000/ws
        const wsUrl = API_BASE_URL.replace(/^http/, "ws") + "/ws";
        console.log(`🔌 Conectando ao WebSocket: ${wsUrl}`);
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log("✅ WebSocket conectado");
        };

        ws.onmessage = (e) => {
          if (!isMountedRef.current) return;
          let parsed: any;
          try {
            parsed = JSON.parse(e.data);
          } catch {
            return;
          }
          const event = parsed?.event;
          const payload = parsed?.data ?? parsed?.radar ?? parsed;
          if (typeof event !== "string") return;
          queuedEvents.push({ event, payload });
          if (wsFlushScheduledRef.current) return;
          wsFlushScheduledRef.current = true;
          const delay = 16;
          setTimeout(() => {
            wsFlushScheduledRef.current = false;
            flushQueuedWsEvents();
          }, delay);
        };

        ws.onclose = () => {
          console.log("❌ WebSocket desconectado");
          if (isMountedRef.current) {
            reconnectTimeout = setTimeout(connect, 5000);
          }
        };

        ws.onerror = (e) => {
          console.error("❌ Erro no WebSocket:", e);
        };
      } catch (err) {
        console.error("Erro ao iniciar WebSocket:", err);
      }
    };

    connect();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [rearmRadarRuntimeState, syncAllRadarsFromCurrentLocation]);

  // Durante navegação, manter highlight/pulse no nativo em sync com proximidade
  useEffect(() => {
    if (!isNavigating) return;
    setNearbyRadarIds(proximityNearbyRadarIds);
  }, [isNavigating, proximityNearbyRadarIds]);

  // Memoizar conversão de Set para Array para evitar nova referência a cada render
  const nearbyRadarIdsArray = useMemo(
    () => Array.from(nearbyRadarIds),
    [nearbyRadarIds],
  );

  const closeRadarFeedbackCard = useCallback(() => {
    if (radarFeedbackDismissTimerRef.current) {
      clearTimeout(radarFeedbackDismissTimerRef.current);
      radarFeedbackDismissTimerRef.current = null;
    }
    setShowRadarFeedbackCard(false);
    setRadarFeedbackTarget(null);
    setRadarFeedbackSubmitting(false);
  }, []);

  const openRadarFeedbackCard = useCallback(
    (radar: Radar) => {
      if (!radar?.id) return;
      if (radarFeedbackActionIds.current.has(radar.id)) return;

      if (radarFeedbackDismissTimerRef.current) {
        clearTimeout(radarFeedbackDismissTimerRef.current);
        radarFeedbackDismissTimerRef.current = null;
      }

      setRadarFeedbackTarget(radar);
      setShowRadarFeedbackCard(true);
      radarFeedbackDismissTimerRef.current = setTimeout(() => {
        closeRadarFeedbackCard();
      }, 12000);
    },
    [closeRadarFeedbackCard],
  );

  const applyRadarUpdateLocally = useCallback((updated: Radar) => {
    // Atualiza radar existente (pode ser CSV ou reportado)
    setCsvRadarsMap((prev: Map<string, Radar>) => {
      if (!prev.has(updated.id)) return prev;
      const next = new Map(prev);
      const existing = prev.get(updated.id);
      next.set(updated.id, existing ? { ...existing, ...updated } : updated);
      return next;
    });
    setReportedRadarsMap((prev: Map<string, Radar>) => {
      if (!prev.has(updated.id)) return prev;
      const next = new Map(prev);
      const existing = prev.get(updated.id);
      next.set(updated.id, existing ? { ...existing, ...updated } : updated);
      return next;
    });
  }, []);

  const handleRadarFeedbackAction = useCallback(
    async (action: "confirm" | "deny") => {
      if (!radarFeedbackTarget?.id || !deviceUserId) {
        closeRadarFeedbackCard();
        return;
      }

      setRadarFeedbackSubmitting(true);
      const radarId = radarFeedbackTarget.id;
      const updated =
        action === "confirm"
          ? await confirmRadar(radarId, deviceUserId)
          : await denyRadar(radarId, deviceUserId);

      radarFeedbackActionIds.current.add(radarId);
      if (updated) {
        applyRadarUpdateLocally(updated);
      }

      closeRadarFeedbackCard();
    },
    [
      applyRadarUpdateLocally,
      closeRadarFeedbackCard,
      deviceUserId,
      radarFeedbackTarget?.id,
    ],
  );

  const handleLocationChange = useCallback((location: any) => {
    if (!location || location.latitude == null || location.longitude == null) {
      return;
    }

    const now = Date.now();
    if (locationUpdateDebounce.current) {
      clearTimeout(locationUpdateDebounce.current);
    }

    locationUpdateDebounce.current = setTimeout(() => {
      const newLocation = {
        latitude: location.latitude,
        longitude: location.longitude,
      };

      if (currentLocationRef.current) {
        const distance = calculateDistance(
          currentLocationRef.current.latitude,
          currentLocationRef.current.longitude,
          newLocation.latitude,
          newLocation.longitude,
        );
        if (distance > 200 && now - lastLocationUpdate.current < 2000) {
          return;
        }
      }

      setCurrentLocation(newLocation);
      lastLocationUpdate.current = now;
    }, 200);
  }, []);

  const hideRadarModal = useCallback(() => {
    if (postPassTimerRef.current) return;
    setRadarPassedLoading(false);
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
  }, [modalOpacity, modalScale]);

  useEffect(() => {
    if (!isNavigating) return;

    const activeRadar = radarAtivo;
    const activeDistance = distanciaAtual;
    if (!activeRadar || activeDistance == null) {
      if (!postPassTimerRef.current) {
        radarZeroTimeRef2.current = null;
        if (lastNearbyRadarIdRef.current != null) {
          lastNearbyRadarIdRef.current = null;
          setNearbyRadarIds(new Set());
        }
        hideRadarModal();
      }
      return;
    }

    if (lastNearbyRadarIdRef.current !== activeRadar.id) {
      lastNearbyRadarIdRef.current = activeRadar.id;
      setNearbyRadarIds(proximityNearbyRadarIds);
    }

    if (deveTocarAlerta) {
      playAlertRadar3Times();
    }

    if (acabouDePassar) {
      if (!radarCriticalSoundPlayedIds.current.has(activeRadar.id)) {
        radarCriticalSoundPlayedIds.current.add(activeRadar.id);
        playAlertRadar3Times();
      }

      if (radarZeroTimeRef2.current === null) {
        radarZeroTimeRef2.current = Date.now();
        setRadarPassedLoading(true);
        if (postPassTimerRef.current) clearTimeout(postPassTimerRef.current);
        postPassTimerRef.current = setTimeout(() => {
          postPassTimerRef.current = null;
          radarZeroTimeRef2.current = null;
          setRadarPassedLoading(false);
          hideRadarModal();
          openRadarFeedbackCard(activeRadar);
        }, 5000);
      }
      setNearestRadar({ radar: activeRadar, distance: 0 });
    } else if (deveAbrirModal) {
      radarZeroTimeRef2.current = null;
      setRadarPassedLoading(false);
      setNearestRadar({ radar: activeRadar, distance: activeDistance });
    } else if (!postPassTimerRef.current) {
      radarZeroTimeRef2.current = null;
      hideRadarModal();
    }

    if (
      !alertedRadarIds.current.has(activeRadar.id) &&
      activeDistance <= 300 &&
      activeDistance > 0
    ) {
      alertedRadarIds.current.add(activeRadar.id);
      let radarType = "Radar";
      const type = normalizeRadarType(activeRadar.type);
      if (
        type.includes("semaforo") ||
        type.includes("camera") ||
        type.includes("fotografica")
      ) {
        radarType = "Radar Semafórico";
      } else if (type.includes("movel") || type.includes("mobile")) {
        radarType = "Radar Móvel";
      } else if (type.includes("fixo") || type.includes("placa")) {
        radarType = "Radar Fixo";
      }

      let message = "";
      if (activeDistance > 200) {
        message = `${radarType} a ${Math.round(activeDistance)} metros`;
      } else if (activeDistance > 100) {
        message = `Atenção! ${radarType} a ${Math.round(activeDistance)} metros`;
      } else if (activeDistance > 30) {
        message = `Cuidado! ${radarType} a ${Math.round(activeDistance)} metros`;
      } else {
        message = `Atenção! ${radarType} muito próximo`;
      }
      if (activeRadar.speedLimit) {
        message += `. Limite ${activeRadar.speedLimit} quilômetros por hora`;
      }

      const Tts = getTts();
      if (Tts && typeof Tts.speak === "function") {
        try {
          Tts.speak(message);
        } catch {
          // ignore
        }
      }
    }

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
  }, [
    acabouDePassar,
    deveAbrirModal,
    deveTocarAlerta,
    distanciaAtual,
    hideRadarModal,
    isNavigating,
    modalOpacity,
    modalScale,
    openRadarFeedbackCard,
    proximityNearbyRadarIds,
    radarAtivo,
  ]);

  // Callback para quando a rota for recalculada (ex: saiu da rota)
  const handleRouteChanged = useCallback((event: any) => {
    try {
      if (!event) return;
      // Corrigir acesso ao nativeEvent (RN Bridge envia dentro de nativeEvent)
      const nativeEvent = event.nativeEvent || event;
      const geometry =
        nativeEvent.geometry ||
        (nativeEvent.items && nativeEvent.items.length > 0
          ? nativeEvent.items[0].geometry
          : null);

      if (!geometry) {
        console.log(
          "Evento routeChanged sem geometria válida:",
          JSON.stringify(nativeEvent).substring(0, 200),
        );
        return;
      }

      let coordinates = [];
      try {
        // O evento pode vir como string JSON (nossa conversão nativa) ou objeto direto
        // Tentamos parsear se for string, senão assumimos que é objeto ou array
        if (typeof geometry === "string") {
          const nowRaw = Date.now();
          if (
            geometry === lastRouteGeometryRawRef.current &&
            nowRaw - lastRouteChangedHandledAtRef.current < 1500
          ) {
            return;
          }
          lastRouteGeometryRawRef.current = geometry;
          // Verificar se é Polyline (não começa com { ou [) - Fallback se a conversão nativa falhou
          if (
            !geometry.trim().startsWith("{") &&
            !geometry.trim().startsWith("[")
          ) {
            console.warn(
              "⚠️ Recebido Polyline em vez de GeoJSON. A conversão nativa pode ter falhado.",
            );
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
      const signature = buildRouteSignature(coordinates as number[][]);
      const now = Date.now();
      if (
        signature === lastRouteSignatureRef.current &&
        now - lastRouteChangedHandledAtRef.current < 1500
      ) {
        return;
      }
      lastRouteSignatureRef.current = signature;
      lastRouteChangedHandledAtRef.current = now;
      // Somente atualizar refs usadas no cálculo de radar (sem setState para não travar layout)
      const points: LatLng[] = (coordinates as number[][])
        .map((coord: number[]) => {
          if (!Array.isArray(coord) || coord.length < 2) return null;
          return { latitude: coord[1], longitude: coord[0] };
        })
        .filter((p: LatLng | null): p is LatLng => p !== null);
      if (points.length < 2) return;
      routePointsRef.current = points;
      routeCumulativeRef.current = getCumulativeDistances(points);
      setRoutePointsFromNav(points);
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
    setRoutePointsFromNav(null);
    if (locationUpdateDebounce.current) {
      clearTimeout(locationUpdateDebounce.current);
      locationUpdateDebounce.current = null;
    }
    alertedRadarIds.current.clear();
    radarCriticalSoundPlayedIds.current.clear();
    resetProximityState();
    if (postPassTimerRef.current) {
      clearTimeout(postPassTimerRef.current);
      postPassTimerRef.current = null;
    }
    if (radarFeedbackDismissTimerRef.current) {
      clearTimeout(radarFeedbackDismissTimerRef.current);
      radarFeedbackDismissTimerRef.current = null;
    }
    setRadarPassedLoading(false);
    setShowRadarFeedbackCard(false);
    setRadarFeedbackTarget(null);
    setRadarFeedbackSubmitting(false);
    setNearestRadar(null);
    setLiveRadarOverlay([]);
    setLiveDeletedRadarIds([]);
    lastNearbyRadarIdRef.current = null;
    setNearbyRadarIds(new Set());
    setIsNavigating(false);
    setIsPreparingNavigation(false);
    setRouteData(null);
    setRoute(null);
  }, [resetProximityState]);

  const handleCancelNavigation = useCallback(() => {
    setRoutePointsFromNav(null);
    if (locationUpdateDebounce.current) {
      clearTimeout(locationUpdateDebounce.current);
      locationUpdateDebounce.current = null;
    }
    alertedRadarIds.current.clear();
    radarCriticalSoundPlayedIds.current.clear();
    resetProximityState();
    if (postPassTimerRef.current) {
      clearTimeout(postPassTimerRef.current);
      postPassTimerRef.current = null;
    }
    if (radarFeedbackDismissTimerRef.current) {
      clearTimeout(radarFeedbackDismissTimerRef.current);
      radarFeedbackDismissTimerRef.current = null;
    }
    setRadarPassedLoading(false);
    setShowRadarFeedbackCard(false);
    setRadarFeedbackTarget(null);
    setRadarFeedbackSubmitting(false);
    setNearestRadar(null);
    setLiveRadarOverlay([]);
    setLiveDeletedRadarIds([]);
    lastNearbyRadarIdRef.current = null;
    setNearbyRadarIds(new Set());
    setIsNavigating(false);
    setIsPreparingNavigation(false);
    setRouteData(null);
    setRoute(null);
  }, [resetProximityState]);

  const handleError = useCallback((error: any) => {
    try {
      if (!error) {
        return;
      }
      console.error("Erro na navegação:", error);
      const errorMessage =
        error?.message || error?.toString() || "Erro na navegação";
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
    if (!MapboxNavComponent || !isNavigating || !origin || !destination)
      return null;

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
        // @ts-ignore — base via GeoJSON URL (GET /radars/geojson), otimizado
        radarsGeoJsonUrl={
          isNavigating && API_BASE_URL
            ? `${API_BASE_URL}/radars/geojson?t=${geoJsonRefreshKey}`
            : undefined
        }
        // @ts-ignore
        radars={mapboxBaseForNative}
        // @ts-ignore
        overlayRadars={mapboxOverlayForNative}
        // @ts-ignore
        nearbyRadarIds={nearbyRadarIdsArray}
        // @ts-ignore
        bottomPadding={nearestRadar ? (Platform.OS === "ios" ? 180 : 240) : 0}
        onLocationChange={handleLocationChange}
        onRouteProgressChange={handleRouteProgressChange}
        onArrive={handleArrive}
        onCancelNavigation={handleCancelNavigation}
        onError={handleError}
        onRouteAlternativeSelected={handleRouteAlternativeSelected}
        onRouteChanged={handleRouteChanged}
        onRadarTap={(
          e: { nativeEvent?: { id: string; latitude: number; longitude: number; speedLimit?: number; type?: string } }
        ) => {
          const ev = e?.nativeEvent ?? e;
          if (ev && typeof ev === "object" && "id" in ev && ev.latitude != null && ev.longitude != null) {
            setSelectedRadarDetail({
              id: String(ev.id),
              latitude: Number(ev.latitude),
              longitude: Number(ev.longitude),
              speedLimit: ev.speedLimit,
              type: ev.type ?? "unknown",
            });
          }
        }}
      />
    );
  }, [
    MapboxNavComponent,
    isNavigating,
    origin,
    destination,
    destinationText,
    mapboxBaseForNative,
    mapboxOverlayForNative,
    nearbyRadarIdsArray,
    nearestRadar,
    handleLocationChange,
    handleRouteProgressChange,
    handleArrive,
    handleCancelNavigation,
    handleError,
    handleRouteAlternativeSelected,
    handleRouteChanged,
    API_BASE_URL,
    geoJsonRefreshKey,
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
              ref={mainMapRef}
              radars={radars}
              route={route}
              isNavigating={false}
              currentLocation={currentLocation}
              nearbyRadarIds={nearbyRadarIds}
              onRadarPress={handleRadarPress}
              onMapPress={(coords: any) => {
                setReportCustomLocation(coords);
                setReportLocationMode("map");
                setShowReportModal(true);
              }}
              onMapIdle={() => {
                const r = selectedRadarDetailRef.current;
                if (!r || !mainMapRef.current?.getPointInView) return;
                mainMapRef.current
                  .getPointInView(r.longitude, r.latitude)
                  .then((pt) => {
                    if (pt && pt.length >= 2)
                      setVignetteCenter({ x: pt[0], y: pt[1] });
                  });
              }}
            />
          </Suspense>

          {/* Botão de reportar em modo mapa livre */}
          <TouchableOpacity
            style={[styles.reportRadarButton, { bottom: 100 }]}
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
        </View>
      )}

      {/* Vignette (tudo escuro exceto centro onde está o radar) + Modal */}
      {selectedRadarDetail && (
        <>
          {/* Vignette: foco circular em volta do ícone do radar */}
          <VignetteOverlay
            onPress={() => {
              setSelectedRadarDetail(null);
              setVignetteCenter(null);
              selectedRadarDetailRef.current = null;
            }}
            centerX={vignetteCenter?.x ?? null}
            centerY={vignetteCenter?.y ?? null}
          />
        <View
          style={{
            position: "absolute",
            top: Platform.OS === "ios" ? 56 : 40,
            left: 16,
            right: 16,
            zIndex: 1000,
            elevation: 1000,
            backgroundColor: '#fff',
            borderRadius: 12,
          
          }}
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.radarAlertContent,
              {
                width: "100%",
                maxWidth: 420,
                alignSelf: "center",
                flexDirection: "column",
                alignItems: "stretch",
              
              },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12,  }}>
              <View style={styles.radarIconContainer}>
                <Image
                  source={
                    (() => {
                      const t = normalizeRadarType(selectedRadarDetail.type);
                      if (t.includes("semaforo") || t.includes("camera") || t.includes("fotografica"))
                        return radarImages.radarSemaforico;
                      if (t.includes("movel") || t.includes("mobile"))
                        return radarImages.radarMovel;
                      return (
                        radarImages[getClosestPlacaName(selectedRadarDetail.speedLimit)] ||
                        radarImages.placa60
                      );
                    })()
                  }
                  style={styles.radarAlertIconLarge}
                  resizeMode="contain"
                />
              </View>
              <View style={[styles.radarAlertTextContainer, { flex: 1 }]}>
                <Text style={[styles.radarAlertTitle, { marginBottom: 4 }]}>
                  {(() => {
                    const t = normalizeRadarType(selectedRadarDetail.type);
                    if (t.includes("semaforo")) return "Radar Semafórico";
                    if (t.includes("movel")) return "Radar Móvel";
                    if (t.includes("fixo") || t.includes("placa")) return "Placa de Velocidade";
                    return "Radar";
                  })()}
                </Text>
                <Text style={[styles.radarAlertDistance, { fontSize: 20 }]}>
                  {selectedRadarDetail.speedLimit
                    ? `${selectedRadarDetail.speedLimit} km/h`
                    : "Sem limite"}
                </Text>
              </View>
              <TouchableOpacity
                style={{ padding: 12, backgroundColor: "#e5e7eb", borderRadius: 8 }}
                onPress={() => {
                  setSelectedRadarDetail(null);
                  setVignetteCenter(null);
                  selectedRadarDetailRef.current = null;
                }}
                activeOpacity={0.8}
              >
                <Text style={{ fontWeight: "600", color: "#374151" }}>Fechar</Text>
              </TouchableOpacity>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 12, gap: 6 , }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="location" size={16} color="#6b7280" />
                <Text style={{ fontSize: 14, color: "#374151", flex: 1 }} numberOfLines={2}>
                  {radarDetailAddress ?? "Carregando endereço..."}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="people" size={16} color="#6b7280" />
                <Text style={{ fontSize: 14, color: "#374151" }}>
                  {selectedRadarDetail.source === "user" || selectedRadarDetail.source === "reportado"
                    ? "Reportado pela comunidade"
                    : "Dados locais"}
                </Text>
              </View>
              {(selectedRadarDetail.createdAt ?? selectedRadarDetail.reportedAt) && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="time" size={16} color="#6b7280" />
                  <Text style={{ fontSize: 14, color: "#374151" }}>
                    {formatTimeAgo(
                      selectedRadarDetail.createdAt ?? selectedRadarDetail.reportedAt ?? 0
                    )}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
        </>
      )}

      {/* Alerta de radar - Modal animado no topo */}
      {isNavigating &&
        nearestRadar &&
        (() => {
          console.log(
            `🎯 Renderizando modal: isNavigating=${isNavigating}, nearestRadar=${!!nearestRadar}, distance=${
              nearestRadar.distance
            }m`,
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
                    ? "rgba(255,255,255,1)"
                    : nearestRadar.distance <= 100
                      ? "rgba(255,255,255,1)"
                      : "rgba(255,255,255,1)",
              },
            ]}
          >
            {radarPassedLoading ? (
              <>
                <View style={styles.radarAlertTextContainer}>
                  <ActivityIndicator
                    size="large"
                    color="#0ea5e9"
                    style={{ marginVertical: 8 }}
                  />
                  <Text style={styles.radarAlertTitle}>Passou do radar</Text>
                  <Text style={styles.radarAlertDistance}>Aguarde...</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.radarIconContainer}>
                  {(() => {
                    const type = normalizeRadarType(nearestRadar.radar.type);
                    let iconSource = radarImages.radarMovel;

                    if (
                      type.includes("semaforo") ||
                      type.includes("camera") ||
                      type.includes("fotografica")
                    ) {
                      iconSource = radarImages.radarSemaforico;
                    } else if (
                      type.includes("movel") ||
                      type.includes("mobile")
                    ) {
                      iconSource = radarImages.radarMovel;
                    } else if (
                      type.includes("fixo") ||
                      type.includes("placa") ||
                      type.includes("velocidade")
                    ) {
                      iconSource =
                        radarImages[
                          getClosestPlacaName(nearestRadar.radar.speedLimit)
                        ] || radarImages.placa60;
                    }

                    return (
                      <Image
                        source={iconSource}
                        style={styles.radarAlertIconLarge}
                      />
                    );
                  })()}
                </View>
                <View style={styles.radarAlertTextContainer}>
                  <Text style={styles.radarAlertTitle}>
                    {(() => {
                      const type = normalizeRadarType(nearestRadar.radar.type);
                      let typeName = "Radar";
                      if (type.includes("semaforo"))
                        typeName = "Radar Semafórico";
                      else if (type.includes("movel")) typeName = "Radar Móvel";
                      else if (type.includes("fixo") || type.includes("placa"))
                        typeName = "Placa de Velocidade";

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
              </>
            )}
          </Animated.View>
        </Animated.View>
      )}

      {isNavigating && showRadarFeedbackCard && radarFeedbackTarget && (
        <View style={styles.radarFeedbackOverlay} pointerEvents="box-none">
          <View style={styles.radarFeedbackCard}>
            <Text style={styles.radarFeedbackTitle}>
              Esse radar ainda existe?
            </Text>
            <Text style={styles.radarFeedbackSubtitle}>
              Responda para melhorar o mapa (crowdsourcing).
            </Text>
            <View style={styles.radarFeedbackActions}>
              <TouchableOpacity
                style={[
                  styles.radarFeedbackButton,
                  styles.radarFeedbackConfirm,
                ]}
                onPress={() => handleRadarFeedbackAction("confirm")}
                disabled={radarFeedbackSubmitting}
                activeOpacity={0.8}
              >
                <Text style={styles.radarFeedbackButtonText}>
                  {radarFeedbackSubmitting ? "Enviando..." : "Sim, existe"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.radarFeedbackButton, styles.radarFeedbackDeny]}
                onPress={() => handleRadarFeedbackAction("deny")}
                disabled={radarFeedbackSubmitting}
                activeOpacity={0.8}
              >
                <Text style={styles.radarFeedbackButtonText}>
                  {radarFeedbackSubmitting ? "Enviando..." : "Não existe"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
          setReportRadarType("placa");
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
                      source={
                        t.value === "placa"
                          ? radarImages[
                              getClosestPlacaName(reportSelectedSpeed || 60)
                            ]
                          : t.icon
                      }
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
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 12,
                  marginVertical: 16,
                }}
              >
                {[30, 40, 50, 60, 70, 80, 90, 100, 110, 120].map((speed) => (
                  <TouchableOpacity
                    key={speed}
                    style={{
                      width: "30%",
                      padding: 16,
                      backgroundColor:
                        reportSelectedSpeed === speed ? "#3b82f6" : "#f3f4f6",
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor:
                        reportSelectedSpeed === speed ? "#3b82f6" : "#e5e7eb",
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
                        color:
                          reportSelectedSpeed === speed ? "#fff" : "#1f2937",
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
                    backgroundColor:
                      reportLocationMode === "current" ? "#3b82f6" : "#f3f4f6",
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor:
                      reportLocationMode === "current" ? "#3b82f6" : "#e5e7eb",
                  }}
                  onPress={() => {
                    setReportLocationMode("current");
                    setReportCustomLocation(null);
                    reportCustomLocationRef.current = null;
                    mapPickerCenterRef.current = null;
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons
                      name="location"
                      size={20}
                      color={
                        reportLocationMode === "current" ? "#fff" : "#3b82f6"
                      }
                    />
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "600",
                        color:
                          reportLocationMode === "current" ? "#fff" : "#1f2937",
                      }}
                    >
                      Usar Localização Atual
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Map Pin */}
                <TouchableOpacity
                  style={{
                    padding: 16,
                    backgroundColor:
                      reportLocationMode === "map" ? "#3b82f6" : "#f3f4f6",
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor:
                      reportLocationMode === "map" ? "#3b82f6" : "#e5e7eb",
                  }}
                  onPress={() => {
                    setReportLocationMode("map");
                    setShowMapPicker(true);
                    const initialLoc = currentLocation
                      ? {
                          latitude: currentLocation.latitude,
                          longitude: currentLocation.longitude,
                        }
                      : { latitude: -23.55052, longitude: -46.633308 };
                    setMapPickerCenter(initialLoc);
                    mapPickerCenterRef.current = initialLoc;
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons
                      name="map"
                      size={20}
                      color={reportLocationMode === "map" ? "#fff" : "#3b82f6"}
                    />
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "600",
                        color:
                          reportLocationMode === "map" ? "#fff" : "#1f2937",
                      }}
                    >
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
                  onPress={() =>
                    setReportStep((prev) => Math.max(1, prev - 1) as 1 | 2 | 3)
                  }
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
                  disabled={
                    reportStep === 1 ? !reportRadarType : !reportSelectedSpeed
                  }
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
        onRequestClose={() => {
          setShowMapPicker(false);
          mapPickerCenterRef.current = null;
        }}
      >
        <View style={{ flex: 1 }}>
          {mapPickerCenter && (
            <View style={{ flex: 1, position: "relative" }}>
              {/* Map View for picking location */}
              <Suspense
                fallback={
                  <View
                    style={{
                      flex: 1,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <ActivityIndicator size="large" color="#3b82f6" />
                  </View>
                }
              >
                <MapComponent
                  ref={mapPickerMapRef}
                  radars={[]}
                  interactive={true}
                  currentLocation={mapPickerCenter}
                  hideUserLocation={true}
                />
              </Suspense>

              {/* Pin fixo no centro: usuário arrasta o mapa; o pin marca o local que será reportado */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <View style={{ marginTop: -48 }}>
                  <Ionicons name="location" size={48} color="#ef4444" />
                </View>
              </View>

              {/* Preview lat/lon: mostra em tempo real onde o pin está (atualizado a cada 400ms) */}
              {pickerPreviewCoords != null && (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: 56,
                    left: 12,
                    right: 12,
                    backgroundColor: "rgba(255,255,255,0.95)",
                    padding: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                  }}
                >
                  <Text
                    style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}
                  >
                    Posição do pin (será reportada)
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                      color: "#111827",
                    }}
                    numberOfLines={1}
                  >
                    lat: {pickerPreviewCoords.latitude.toFixed(6)} lon:{" "}
                    {pickerPreviewCoords.longitude.toFixed(6)}
                  </Text>
                </View>
              )}

              {/* Control Overlay */}
              <View
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  backgroundColor: "#fff",
                  padding: 20,
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: -2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 8,
                  elevation: 5,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: "#6b7280",
                    marginBottom: 12,
                    textAlign: "center",
                  }}
                >
                  Arraste o mapa para posicionar o pin no local do radar. Depois
                  toque em Confirmar.
                </Text>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: 16,
                      backgroundColor: "#f3f4f6",
                      borderRadius: 12,
                      alignItems: "center",
                    }}
                    onPress={() => {
                      setShowMapPicker(false);
                      mapPickerCenterRef.current = null;
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "600",
                        color: "#374151",
                      }}
                    >
                      Cancelar
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: 16,
                      backgroundColor: "#3b82f6",
                      borderRadius: 12,
                      alignItems: "center",
                    }}
                    onPress={async () => {
                      const center =
                        await mapPickerMapRef.current?.getCenter?.();
                      const selected = center ?? mapPickerCenterRef.current;
                      if (!selected) {
                        Alert.alert(
                          "Erro",
                          "Não foi possível obter a posição do mapa. Tente novamente.",
                        );
                        return;
                      }
                      const picked = {
                        latitude: selected.latitude,
                        longitude: selected.longitude,
                      };
                      reportCustomLocationRef.current = picked;
                      setReportCustomLocation(picked);
                      setReportLocationMode("map");
                      handleReportRadar({ location: picked });
                      setShowMapPicker(false);
                      mapPickerCenterRef.current = null;
                    }}
                  >
                    <Text
                      style={{ fontSize: 16, fontWeight: "600", color: "#fff" }}
                    >
                      Confirmar Localização
                    </Text>
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
              <Ionicons
                name="location-outline"
                size={64}
                color="#ef4444"
                style={{ marginBottom: 12 }}
              />
              <Text
                style={[
                  styles.reportModalTitle,
                  { textAlign: "center", fontSize: 20 },
                ]}
              >
                Ops! Localização Indisponível
              </Text>
            </View>
            <Text
              style={[
                styles.reportModalSubtitle,
                {
                  textAlign: "center",
                  fontSize: 14,
                  lineHeight: 20,
                  marginBottom: 20,
                },
              ]}
            >
              Não conseguimos obter sua posição atual. Por favor, verifique se o
              seu GPS está ligado e tente novamente.
            </Text>
            <TouchableOpacity
              style={[
                styles.reportModalSubmit,
                { width: "100%", marginHorizontal: 0 },
              ]}
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
              <Ionicons
                name="checkmark-circle-outline"
                size={64}
                color="#10b981"
                style={{ marginBottom: 12 }}
              />
              <Text
                style={[
                  styles.reportModalTitle,
                  { textAlign: "center", fontSize: 20 },
                ]}
              >
                Obrigado!
              </Text>
            </View>
            <Text
              style={[
                styles.reportModalSubtitle,
                { textAlign: "center", fontSize: 14, lineHeight: 20 },
              ]}
            >
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
    bottom: Platform.OS === "ios" ? 300 : 80,
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
  radarFeedbackOverlay: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: Platform.OS === "ios" ? 120 : 90,
    zIndex: 1200,
    elevation: 12,
    pointerEvents: "box-none",
  },
  radarFeedbackCard: {
    backgroundColor: "rgba(17, 24, 39, 0.95)",
    borderRadius: 14,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
  },
  radarFeedbackTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  radarFeedbackSubtitle: {
    color: "#d1d5db",
    fontSize: 12,
    marginTop: 4,
    marginBottom: 10,
  },
  radarFeedbackActions: {
    flexDirection: "row",
    gap: 8,
  },
  radarFeedbackButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  radarFeedbackConfirm: {
    backgroundColor: "#16a34a",
  },
  radarFeedbackDeny: {
    backgroundColor: "#dc2626",
  },
  radarFeedbackButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
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

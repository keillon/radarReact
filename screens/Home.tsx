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
  AppState,
  AppStateStatus,
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
import { useIAP } from "../context/IAPContext";
import { useSettings } from "../context/SettingsContext";
import { VignetteOverlay } from "../components/VignetteOverlay";
import { useRadarAudio } from "../hooks/useRadarAudio";
import { useRadarProximity } from "../hooks/useRadarProximity";
import {
  API_BASE_URL,
  confirmRadar,
  denyRadar,
  getRadarsFromGeoJson,
  getRadarsLastUpdated,
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
import { colors } from "../utils/theme";
import { AdBanner } from "../components/AdBanner";
import { AppModal } from "../components/AppModal";

const VOTED_RADAR_IDS_KEY = "radarZone_votedRadarIds";
const RADARS_LAST_FETCH_AT_KEY = "radarZone_radarsLastFetchAt";
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

const DEVICE_USER_ID_KEY = "radarzone_device_user_id";

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

export default function Home() {
  const { soundEnabled, volume, updateSettings, ttsVoiceId } = useSettings();
  const { isSubscribed, isInFreePeriod, hasFullAccess, isLoading: iapLoading } = useIAP();
  type RadarArrayUpdater = Radar[] | ((prev: Radar[]) => Radar[]);
  type RadarIdArrayUpdater = string[] | ((prev: string[]) => string[]);

  const { playRadarAlert, speakRadarAlert } = useRadarAudio();
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [destinationText, setDestinationText] = useState<string>("");
  const [route, setRoute] = useState<any>(null);
  const [routeData, setRouteData] = useState<RouteResponse | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isPreparingNavigation, setIsPreparingNavigation] = useState(false);
  const [recenterTrigger, setRecenterTrigger] = useState(0);
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
  const [showUpdateRadarsModal, setShowUpdateRadarsModal] = useState(false);
  const [isUpdatingRadars, setIsUpdatingRadars] = useState(false);

  const [mapPickerCenter, setMapPickerCenter] = useState<LatLng | null>(null);
  const [pickerPreviewCoords, setPickerPreviewCoords] = useState<LatLng | null>(
    null,
  ); // Preview lat/lon durante marcação (atualizado via onCameraChanged throttled)
  const [radarPassedLoading, setRadarPassedLoading] = useState(false); // Loading 5s no modal após passar do radar
  const [radarPassedPhase, setRadarPassedPhase] = useState<'loading' | 'passed' | null>(null); // 'loading' 5s, depois 'passed' no próprio modal
  const [deviceUserId, setDeviceUserId] = useState<string | null>(null);
  const [liveRadarOverlayMap, setLiveRadarOverlayMap] = useState<
    Map<string, Radar>
  >(new Map());
  const overlayRadarIdsRef = useRef<Set<string>>(new Set()); // IDs no overlay (para radar:update não duplicar base→overlay)
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

  // Modal genérico (substitui Alert.alert)
  const [appModal, setAppModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: "alert" | "confirm";
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  }>({
    visible: false,
    title: "",
    message: "",
    type: "alert",
  });

  const closeAppModal = useCallback(() => {
    setAppModal((s) => ({ ...s, visible: false }));
  }, []);

  const showAppAlert = useCallback(
    (title: string, message: string) => {
      setAppModal({
        visible: true,
        title,
        message,
        type: "alert",
        onConfirm: closeAppModal,
      });
    },
    [closeAppModal],
  );

  const showAppConfirm = useCallback(
    (
      title: string,
      message: string,
      opts: {
        confirmText?: string;
        cancelText?: string;
        onConfirm: () => void;
        onCancel?: () => void;
      },
    ) => {
      setAppModal({
        visible: true,
        title,
        message,
        type: "confirm",
        confirmText: opts.confirmText ?? "Confirmar",
        cancelText: opts.cancelText ?? "Cancelar",
        onConfirm: () => {
          closeAppModal();
          opts.onConfirm();
        },
        onCancel: () => {
          closeAppModal();
          opts.onCancel?.();
        },
      });
    },
    [closeAppModal],
  );

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
  // Ambos aparecem: CSV (oficial) e reportados (comunidade) são lógicas distintas
  const radars = useMemo(() => {
    // Dedup por ID: se reported tem mesmo ID que CSV, reported ganha
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
  useEffect(() => {
    overlayRadarIdsRef.current = new Set(liveRadarOverlay.map((r) => r.id));
  }, [liveRadarOverlay]);
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
  const radar30mSoundPlayedIds = useRef<Set<string>>(new Set()); // Som de alerta aos 30m (uma vez por aproximação)
  const radarFeedbackDismissTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const radarFeedbackActionIds = useRef<Set<string>>(new Set()); // 1 confirmação/negação por usuário (sessão + persistido)
  const mapPickerCenterRef = useRef<LatLng | null>(null); // Fallback centro ao abrir picker
  const mapPickerMapRef = useRef<MapHandle | null>(null); // Ref do Map no picker para getCenter()
  const pickerGetCenterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestRadarsForTapRef = useRef<Radar[]>([]); // Para onRadarTap (navegação) resolver radar completo e abrir modal
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
  const prevIsNavigatingRef = useRef(false);
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
      const debounceMs = 50;
      wsDeferredSyncTimeoutRef.current = setTimeout(() => {
        wsDeferredSyncTimeoutRef.current = null;
        getRadarsFromGeoJson()
          .then((allRadars) => {
            if (!isMountedRef.current) return;
            startTransition(() => {
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
      }, debounceMs);
    },
    [],
  );

  // Atualização manual de radares (modal ou menu) — obrigatória quando há atualização
  const fetchRadarsManually = useCallback(() => {
    setIsUpdatingRadars(true);
    const timeoutMs = 25000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("A requisição demorou demais. Verifique sua conexão.")), timeoutMs),
    );
    Promise.race([getRadarsFromGeoJson(), timeoutPromise])
      .then((allRadars) => {
        if (!isMountedRef.current) return;
        hasInitialRadarLoadRef.current = true;
        const now = Date.now();
        AsyncStorage.setItem(RADARS_LAST_FETCH_AT_KEY, String(now)).catch(
          () => {},
        );
        startTransition(() => {
          setCsvRadarsMap(() => {
            const nextMap = new Map<string, Radar>();
            for (const radar of allRadars) {
              if (!radar?.id) continue;
              nextMap.set(radar.id, radar);
            }
            return nextMap;
          });
          setLiveRadarOverlayMap(new Map());
          setLiveDeletedRadarIdsSetState(new Set());
        });
        setShowUpdateRadarsModal(false);
      })
      .catch((error) => {
        console.error("Erro ao atualizar radares:", error);
        if (isMountedRef.current) {
          showAppAlert(
            "Erro ao atualizar",
            error instanceof Error ? error.message : "Não foi possível buscar os radares. Tente novamente.",
          );
        }
      })
      .finally(() => {
        if (isMountedRef.current) setIsUpdatingRadars(false);
      });
  }, [showAppAlert]);

  // Preview de lat/lon no picker: valor inicial; atualizações via onCameraChanged (throttled) + fallback getCenter a cada 600ms
  useEffect(() => {
    if (!showMapPicker) {
      if (pickerGetCenterIntervalRef.current) {
        clearInterval(pickerGetCenterIntervalRef.current);
        pickerGetCenterIntervalRef.current = null;
      }
      setPickerPreviewCoords(null);
      return;
    }
    setPickerPreviewCoords(mapPickerCenter ?? null);
    const delay = setTimeout(() => {
      const tick = () => {
        mapPickerMapRef.current?.getCenter?.()?.then((center) => {
          if (center?.latitude != null && center?.longitude != null) {
            setPickerPreviewCoords({ latitude: center.latitude, longitude: center.longitude });
          }
        });
      };
      tick();
      pickerGetCenterIntervalRef.current = setInterval(tick, 600);
    }, 400);
    return () => {
      clearTimeout(delay);
      if (pickerGetCenterIntervalRef.current) {
        clearInterval(pickerGetCenterIntervalRef.current);
        pickerGetCenterIntervalRef.current = null;
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

    // Buscar radares imediatamente (não espera GPS) — GeoJSON retorna todos os radares
    if (!hasInitialRadarLoadRef.current) {
      hasInitialRadarLoadRef.current = true;
      getRadarsFromGeoJson()
        .then((allRadars) => {
          if (!isMountedRef.current) return;
          const now = Date.now();
          AsyncStorage.setItem(RADARS_LAST_FETCH_AT_KEY, String(now)).catch(
            () => {},
          );
          startTransition(() => {
            setCsvRadarsMap(() => {
              const nextMap = new Map<string, Radar>();
              for (const radar of allRadars) {
                if (!radar?.id) continue;
                nextMap.set(radar.id, radar);
              }
              return nextMap;
            });
          });
        })
        .catch((error) => {
          console.error("Erro ao buscar radares na inicialização:", error);
          hasInitialRadarLoadRef.current = false;
        });
    }

    // Configurar TTS: pt-BR e voz escolhida nas configurações (uma só voz para alertas e navegação)
    const Tts = getTts();
    if (Tts) {
      const applyTtsSettings = () => {
        try {
          if (Tts.setDefaultLanguage) Tts.setDefaultLanguage("pt-BR");
          if (Tts.setDefaultRate) Tts.setDefaultRate(0.5);
          if (Tts.setDefaultPitch) Tts.setDefaultPitch(1.0);
          const { ttsVoiceId: storedVoiceId } = require("../utils/settingsStore").getStoredSettings();
          if (storedVoiceId && typeof Tts.setDefaultVoice === "function") {
            Tts.setDefaultVoice(storedVoiceId).catch(() => {});
          }
        } catch (error) {
          console.warn("Erro ao configurar TTS:", error);
        }
      };
      if (Tts.getInitStatus && typeof Tts.getInitStatus === "function") {
        Tts.getInitStatus()
          .then((status: boolean) => {
            if (status) applyTtsSettings();
          })
          .catch(() => applyTtsSettings());
      } else {
        applyTtsSettings();
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

  // Manter voz única: aplicar voz escolhida nas configurações sempre que mudar (alertas + navegação)
  useEffect(() => {
    const Tts = getTts();
    if (Tts && typeof Tts.setDefaultVoice === "function" && ttsVoiceId) {
      Tts.setDefaultVoice(ttsVoiceId).catch(() => {});
    }
  }, [ttsVoiceId]);

  // Ao iniciar navegação, reaplicar voz selecionada (instruções de rota + radar usam a mesma voz)
  useEffect(() => {
    if (!isNavigating) return;
    const voiceId = ttsVoiceId ?? require("../utils/settingsStore").getStoredSettings().ttsVoiceId;
    if (!voiceId) return;
    const Tts = getTts();
    if (Tts && typeof Tts.setDefaultVoice === "function") {
      Tts.setDefaultVoice(voiceId).catch(() => {});
    }
  }, [isNavigating, ttsVoiceId]);

  // Carregar IDs de radares já confirmados/negados (único por usuário, não mostrar modal de novo)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(VOTED_RADAR_IDS_KEY);
        if (cancelled || !raw) return;
        const ids = JSON.parse(raw);
        if (Array.isArray(ids)) {
          ids.forEach((id: string) => radarFeedbackActionIds.current.add(id));
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
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

  // Checar atualizações quando app volta para foreground (só mostra modal se houver update)
  useEffect(() => {
    const sub = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (nextState !== "active") return;
        if (!hasInitialRadarLoadRef.current || isNavigating) return;
        if (csvRadarsMap.size === 0) return;

        getRadarsLastUpdated()
          .then((serverLastUpdated) => {
            if (!isMountedRef.current) return;
            if (serverLastUpdated <= 0) return;

            AsyncStorage.getItem(RADARS_LAST_FETCH_AT_KEY).then((stored) => {
              if (!isMountedRef.current) return;
              const clientLastFetch = Number(stored ?? 0) || 0;
              if (serverLastUpdated > clientLastFetch) {
                setShowUpdateRadarsModal(true);
              }
            });
          })
          .catch(() => {});
      },
    );
    return () => sub.remove();
  }, [csvRadarsMap.size, isNavigating]);

  const requestLocationPermission = async () => {
    try {
      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          showAppAlert(
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
          currentLocationRef.current = loc;
          setCurrentLocation(loc);
          setOrigin(loc);
          // Radares já carregados em paralelo no mount
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
      showAppAlert("Erro", "Aguardando localização atual...");
      return;
    }

    if (!destinationText.trim()) {
      showAppAlert("Erro", "Por favor, digite um endereço de destino");
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
      radar30mSoundPlayedIds.current.clear();
      resetProximityState();
      radarZeroTimeRef2.current = null;
      if (postPassTimerRef.current) {
        clearTimeout(postPassTimerRef.current);
        postPassTimerRef.current = null;
      }
      setRadarPassedLoading(false);
      setRadarPassedPhase(null);

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

      // Usa cache local + WebSocket em tempo real. Sem busca automática por rota.
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
      showAppAlert(
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
    // Obter posição após animação da câmera — evita onMapIdle (causa NPE no Mapbox)
    setTimeout(() => {
      if (selectedRadarDetailRef.current?.id !== radar.id) return;
      mainMapRef.current
        ?.getPointInView?.(radar.longitude, radar.latitude)
        ?.then((pt) => {
          if (pt && pt.length >= 2 && selectedRadarDetailRef.current?.id === radar.id)
            setVignetteCenter({ x: pt[0], y: pt[1] });
        })
        ?.catch(() => {});
    }, 900);
  }, []);

  const handleMapPressForReport = useCallback((coords: { latitude: number; longitude: number }) => {
    setReportCustomLocation(coords);
    setReportLocationMode("map");
    setShowReportModal(true);
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
      showAppAlert("Atenção", "Por favor, selecione a velocidade do radar");
      return;
    }
    if (speedLimit > 120) {
      showAppAlert("Atenção", "A velocidade máxima permitida é 120 km/h");
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
        // Substituir temp pelo real (marcar quem reportou para não pedir confirmação ao próprio usuário)
        const radarWithReporter = { ...realRadar, reportedBy: deviceUserId || realRadar.reportedBy };
        startTransition(() => {
          if (!isMountedRef.current) return;
          removeReportedRadar(tempRadar.id);
          addReportedRadar(radarWithReporter);
          if (isNavigating) {
            removeLiveRadarOverlay(tempRadar.id);
            upsertLiveRadarOverlay(radarWithReporter);
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

  useEffect(() => {
    latestRadarsForTapRef.current = radarsForProximity;
  }, [radarsForProximity]);

  const rearmRadarRuntimeState = useCallback(
    (radarIds: string[]) => {
      if (!radarIds || radarIds.length === 0) return;
      radarIds.forEach((id) => {
        if (!id) return;
        alertedRadarIds.current.delete(id);
        radarCriticalSoundPlayedIds.current.delete(id);
        radar30mSoundPlayedIds.current.delete(id);
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
            case "radar:created": {
              const normalized = normalizeRadarPayload(payload);
              if (!normalized) break;
              overlayDeletes.delete(normalized.id);
              overlayUpserts.set(normalized.id, normalized);
              if (!isNavigatingRef.current) {
                baseDeletes.delete(normalized.id);
                baseUpserts.set(normalized.id, normalized);
              }
              // Substituir temp por real: evita duplicar ícone quando reportamos e WS confirma
              const isNewFromReport = event === "radar:new" || event === "radar:created";
              if (isNewFromReport && normalized.latitude != null && normalized.longitude != null) {
                setReportedRadarsMap((prev) => {
                  const match = Array.from(prev.entries()).find(
                    ([id, r]) =>
                      id.startsWith("temp_") &&
                      Math.abs((r.latitude ?? 0) - normalized.latitude!) < 0.0001 &&
                      Math.abs((r.longitude ?? 0) - normalized.longitude!) < 0.0001
                  );
                  if (!match) return prev;
                  const [tempId] = match;
                  const next = new Map(prev);
                  next.delete(tempId);
                  next.set(normalized.id, normalized);
                  return next;
                });
              }
              break;
            }
            case "radar:update":
            case "radar:updated": {
              const normalized = normalizeRadarPayload(payload);
              if (!normalized) break;
              baseDeletes.delete(normalized.id);
              baseUpserts.set(normalized.id, normalized);
              if (overlayRadarIdsRef.current.has(normalized.id)) {
                overlayDeletes.delete(normalized.id);
                overlayUpserts.set(normalized.id, normalized);
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

        // Só forçar refetch GeoJSON ao adicionar/remover radares — NÃO em radar:update (confirm/deny)
        // Evita piscar/desaparecer radares quando usuário confirma/nega (já temos merge local)
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
          // CSV atualizado: mostrar modal obrigatório para atualizar
          setShowUpdateRadarsModal(true);
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
          setTimeout(() => {
            wsFlushScheduledRef.current = false;
            flushQueuedWsEvents();
          }, 0);
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

  // Highlight só durante navegação: um radar por vez (o ativo). Ao passar, remove pulse.
  // SEMPRE incluir o radar do modal (radarAtivo/nearestRadar) para evitar highlight ausente até "alguma atualização"
  const nearbyRadarIdsForMap = useMemo(() => {
    if (!isNavigating) return new Set<string>();
    const base = new Set(proximityNearbyRadarIds);
    const activeId = radarAtivo?.id ?? nearestRadar?.radar?.id;
    if (activeId) base.add(activeId);
    return base;
  }, [isNavigating, proximityNearbyRadarIds, radarAtivo?.id, nearestRadar?.radar?.id]);

  useEffect(() => {
    setNearbyRadarIds(nearbyRadarIdsForMap);
  }, [nearbyRadarIdsForMap]);

  // Ao sair da navegação: atualizar localização e recentrar mapa
  useEffect(() => {
    const wasNav = prevIsNavigatingRef.current;
    prevIsNavigatingRef.current = isNavigating;
    if (wasNav && !isNavigating) {
      getGeolocation().getCurrentPosition(
        (position: { coords: { latitude: number; longitude: number } }) => {
          const loc: LatLng = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          currentLocationRef.current = loc;
          setCurrentLocation(loc);
          setOrigin(loc);
          setTimeout(() => {
            mainMapRef.current?.focusOnCoord?.(loc.latitude, loc.longitude);
          }, 300);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
      );
    }
  }, [isNavigating]);

  // Array ordenado para animação pulsante no Mapbox (ordem consistente = hash estável no nativo)
  const nearbyRadarIdsArray = useMemo(
    () => Array.from(nearbyRadarIds).sort(),
    [nearbyRadarIds],
  );

  // Durante navegação: passar nearbyRadarIdsForMap (inclui radar do modal) ao nativo
  const nearbyRadarIdsArrayForNav = useMemo(
    () => (isNavigating ? Array.from(nearbyRadarIdsForMap).sort() : []),
    [isNavigating, nearbyRadarIdsForMap],
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
    async (radar: Radar) => {
      if (!radar?.id) return;
      if (radarFeedbackActionIds.current.has(radar.id)) return;
      // Não pedir confirmação de quem reportou — somente de outros usuários
      if (deviceUserId && radar.reportedBy && radar.reportedBy === deviceUserId) return;
      // Verificar AsyncStorage (usuário já votou em sessão anterior)
      try {
        const raw = await AsyncStorage.getItem(VOTED_RADAR_IDS_KEY);
        const ids: string[] = raw ? JSON.parse(raw) : [];
        if (ids.includes(radar.id)) {
          radarFeedbackActionIds.current.add(radar.id);
          return;
        }
      } catch {}

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
    [closeRadarFeedbackCard, deviceUserId],
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
      try {
        const updated =
          action === "confirm"
            ? await confirmRadar(radarId, deviceUserId)
            : await denyRadar(radarId, deviceUserId);

        radarFeedbackActionIds.current.add(radarId);
        try {
          const raw = await AsyncStorage.getItem(VOTED_RADAR_IDS_KEY);
          const ids: string[] = raw ? JSON.parse(raw) : [];
          if (!ids.includes(radarId)) {
            ids.push(radarId);
            await AsyncStorage.setItem(VOTED_RADAR_IDS_KEY, JSON.stringify(ids));
          }
        } catch {}
        if (updated) {
          applyRadarUpdateLocally(updated);
        }
        closeRadarFeedbackCard();
      } catch (err: any) {
        const msg = String(err?.message ?? "");
        const alreadyVoted =
          /já negou|já confirmou|alreadyDenied|alreadyConfirmed/i.test(msg);
        if (alreadyVoted) {
          radarFeedbackActionIds.current.add(radarId);
          try {
            const raw = await AsyncStorage.getItem(VOTED_RADAR_IDS_KEY);
            const ids: string[] = raw ? JSON.parse(raw) : [];
            if (!ids.includes(radarId)) {
              ids.push(radarId);
              await AsyncStorage.setItem(VOTED_RADAR_IDS_KEY, JSON.stringify(ids));
            }
          } catch {}
        }
        closeRadarFeedbackCard();
      } finally {
        setRadarFeedbackSubmitting(false);
      }
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
    setRadarPassedPhase(null);
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
      // nearbyRadarIdsForMap (via useEffect) já inclui radarAtivo/nearestRadar — highlight sincronizado
    }

    // Alerta sonoro entre 40m e 5m: dispara uma vez quando na faixa (usa soundEnabled reativo)
    const shouldPlay30mAlert =
      activeDistance != null &&
      activeDistance <= 40 &&
      activeDistance >= 5 &&
      !radar30mSoundPlayedIds.current.has(activeRadar.id);
    if (soundEnabled && (deveTocarAlerta || shouldPlay30mAlert)) {
      if (shouldPlay30mAlert) radar30mSoundPlayedIds.current.add(activeRadar.id);
      playRadarAlert();
    }

    if (acabouDePassar) {
      radar30mSoundPlayedIds.current.delete(activeRadar.id); // Permitir tocar de novo na próxima aproximação
      if (soundEnabled && !radarCriticalSoundPlayedIds.current.has(activeRadar.id)) {
        radarCriticalSoundPlayedIds.current.add(activeRadar.id);
        playRadarAlert();
      }

      if (radarZeroTimeRef2.current === null) {
        radarZeroTimeRef2.current = Date.now();
        const passedRadar = activeRadar; // Capturar em closure para o callback
        // Fecha modal imediatamente e mostra feedback (sem loading "Passou do radar")
        hideRadarModal();
        setTimeout(() => {
          radarZeroTimeRef2.current = null;
          openRadarFeedbackCard(passedRadar);
        }, 350);
      }
      setNearestRadar({ radar: activeRadar, distance: 0 });
    } else if (deveAbrirModal) {
      radarZeroTimeRef2.current = null;
      setRadarPassedLoading(false);
      setRadarPassedPhase(null);
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

      speakRadarAlert(message);
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
    playRadarAlert,
    proximityNearbyRadarIds,
    radarAtivo,
    soundEnabled,
    speakRadarAlert,
  ]);

  // Fechar modal de alerta/feedback assim que o radar em destaque for excluído (WebSocket)
  const liveDeletedRadarIdsSetForEffect = useMemo(
    () => new Set(liveDeletedRadarIds),
    [liveDeletedRadarIds],
  );
  useEffect(() => {
    if (!isNavigating || liveDeletedRadarIdsSetForEffect.size === 0) return;
    const deletedId =
      nearestRadar?.radar?.id ??
      radarAtivo?.id ??
      (showRadarFeedbackCard ? radarFeedbackTarget?.id ?? null : null);
    if (!deletedId || !liveDeletedRadarIdsSetForEffect.has(deletedId)) return;

    if (postPassTimerRef.current) {
      clearTimeout(postPassTimerRef.current);
      postPassTimerRef.current = null;
    }
    radarZeroTimeRef2.current = null;
    setRadarPassedLoading(false);
    setRadarPassedPhase(null);
    if (showRadarFeedbackCard && radarFeedbackTarget?.id === deletedId) {
      closeRadarFeedbackCard();
    }
    rearmRadarRuntimeState([deletedId]);
    hideRadarModal();
  }, [
    isNavigating,
    liveDeletedRadarIdsSetForEffect,
    nearestRadar?.radar?.id,
    radarAtivo?.id,
    showRadarFeedbackCard,
    radarFeedbackTarget?.id,
    hideRadarModal,
    closeRadarFeedbackCard,
    rearmRadarRuntimeState,
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
    showAppAlert("Chegada", "Você chegou ao destino!");
    setRoutePointsFromNav(null);
    if (locationUpdateDebounce.current) {
      clearTimeout(locationUpdateDebounce.current);
      locationUpdateDebounce.current = null;
    }
    alertedRadarIds.current.clear();
    radarCriticalSoundPlayedIds.current.clear();
    radar30mSoundPlayedIds.current.clear();
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
    setRadarPassedPhase(null);
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
  }, [resetProximityState, showAppAlert]);

  const doCancelNavigation = useCallback(() => {
    setRoutePointsFromNav(null);
    if (locationUpdateDebounce.current) {
      clearTimeout(locationUpdateDebounce.current);
      locationUpdateDebounce.current = null;
    }
    alertedRadarIds.current.clear();
    radarCriticalSoundPlayedIds.current.clear();
    radar30mSoundPlayedIds.current.clear();
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
    setRadarPassedPhase(null);
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
    showAppConfirm("Sair da navegação?", "Deseja realmente encerrar a navegação?", {
      cancelText: "Não",
      confirmText: "Sim, sair",
      onConfirm: doCancelNavigation,
    });
  }, [showAppConfirm, doCancelNavigation]);

  const handleError = useCallback((error: any) => {
    try {
      if (!error) {
        return;
      }
      console.error("Erro na navegação:", error);
      const errorMessage =
        error?.message || error?.toString() || "Erro na navegação";
      showAppAlert("Erro", errorMessage);
    } catch (e) {
      console.error("Erro ao processar erro de navegação:", e);
    }
  }, [showAppAlert]);

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
        mute={!soundEnabled}
        volume={Math.max(0, Math.min(1, volume))}
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
        nearbyRadarIds={nearbyRadarIdsArrayForNav}
        // @ts-ignore
        bottomPadding={nearestRadar ? (Platform.OS === "ios" ? 180 : 240) : 0}
        onLocationChange={handleLocationChange}
        onRouteProgressChange={handleRouteProgressChange}
        onArrive={handleArrive}
        onCancelNavigation={handleCancelNavigation}
        onError={handleError}
        onRouteAlternativeSelected={handleRouteAlternativeSelected}
        onRouteChanged={handleRouteChanged}
        onMuteChange={(e: { muted: boolean; soundEnabled: boolean }) => {
          const enabled = e?.soundEnabled ?? !e?.muted;
          updateSettings({ soundEnabled: enabled });
        }}
        onRadarTap={(
          e: { nativeEvent?: { id: string; latitude: number; longitude: number; speedLimit?: number; type?: string } }
        ) => {
          const ev = e?.nativeEvent ?? e;
          if (ev && typeof ev === "object" && "id" in ev && ev.latitude != null && ev.longitude != null) {
            const idStr = String(ev.id);
            const fullRadar = latestRadarsForTapRef.current.find((r) => r && String(r.id) === idStr);
            if (fullRadar) {
              setSelectedRadarDetail(fullRadar);
              selectedRadarDetailRef.current = fullRadar;
            } else {
              const minimal: Radar = {
                id: idStr,
                latitude: Number(ev.latitude),
                longitude: Number(ev.longitude),
                speedLimit: ev.speedLimit,
                type: ev.type ?? "unknown",
              };
              setSelectedRadarDetail(minimal);
              selectedRadarDetailRef.current = minimal;
            }
          }
        }}
        recenterTrigger={recenterTrigger}
        ttsVoiceId={ttsVoiceId ?? require("../utils/settingsStore").getStoredSettings().ttsVoiceId ?? undefined}
        onVoiceInstructionText={(e: { nativeEvent?: { text: string }; text?: string }) => {
          const text = (e?.nativeEvent?.text ?? e?.text ?? "").replace(/<[^>]+>/g, "").trim();
          if (!text) return;
          const Tts = getTts();
          if (!Tts || typeof Tts.speak !== "function") return;
          const voiceId = ttsVoiceId ?? require("../utils/settingsStore").getStoredSettings().ttsVoiceId;
          (async () => {
            if (voiceId && typeof Tts.setDefaultVoice === "function") {
              await Tts.setDefaultVoice(voiceId);
            }
            await Tts.speak(text, { androidParams: { KEY_PARAM_VOLUME: volume } });
          })().catch(() => {});
        }}
      />
    );
  }, [
    MapboxNavComponent,
    isNavigating,
    origin,
    destination,
    destinationText,
    soundEnabled,
    volume,
    updateSettings,
    mapboxBaseForNative,
    mapboxOverlayForNative,
    nearbyRadarIdsArrayForNav,
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
    recenterTrigger,
    ttsVoiceId,
  ]);

  return (
    <View style={styles.container}>
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
            <ActivityIndicator size="large" color={colors.primary} />
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
                  <ActivityIndicator size="small" color={colors.text} />
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
              <ActivityIndicator size="large" color={colors.primary} />
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
                <ActivityIndicator size="large" color={colors.primary} />
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
              onMapPress={handleMapPressForReport}
              onRefreshRadars={fetchRadarsManually}
            />
          </Suspense>

          {/* Botão de reportar em modo mapa livre */}
          <TouchableOpacity
            style={[styles.reportRadarButton, { bottom: 150 }]}
            onPress={() => setShowReportModal(true)}
            disabled={isReportingRadar}
            activeOpacity={0.7}
          >
            {isReportingRadar ? (
              <ActivityIndicator size="small" color={colors.text} />
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
              if (isNavigating) setRecenterTrigger((t) => t + 1);
            }}
            centerX={vignetteCenter?.x ?? null}
            centerY={vignetteCenter?.y ?? null}
            radarIconSource={
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
          />
        <View
          style={{
            position: "absolute",
            top: Platform.OS === "ios" ? 56 : 40,
            left: 16,
            right: 16,
            zIndex: 1000,
            elevation: 1000,
            backgroundColor: colors.backgroundLight,
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
                style={{ padding: 12, backgroundColor: colors.borderLight, borderRadius: 8 }}
                onPress={() => {
                  setSelectedRadarDetail(null);
                  setVignetteCenter(null);
                  selectedRadarDetailRef.current = null;
                  if (isNavigating) setRecenterTrigger((t) => t + 1);
                }}
                activeOpacity={0.8}
              >
                <Text style={{ fontWeight: "600", color: colors.textDarkSecondary }}>Fechar</Text>
              </TouchableOpacity>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: 12, gap: 6 , }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="location" size={16} color={colors.textSecondary} />
                <Text style={{ fontSize: 14, color: colors.textDarkSecondary, flex: 1 }} numberOfLines={2}>
                  {radarDetailAddress ?? "Carregando endereço..."}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="people" size={16} color={colors.textSecondary} />
                <Text style={{ fontSize: 14, color: colors.textDarkSecondary }}>
                  {selectedRadarDetail.source === "user" || selectedRadarDetail.source === "reportado"
                    ? "Reportado pela comunidade"
                    : "Dados locais"}
                </Text>
              </View>
              {(selectedRadarDetail.createdAt ?? selectedRadarDetail.reportedAt) && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="time" size={16} color={colors.textSecondary} />
                  <Text style={{ fontSize: 14, color: colors.textDarkSecondary }}>
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

      {/* Alerta de radar - View com elevation alta (evita Modal que bloqueia toques no Android) */}
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
                <>
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
                </>
              </View>
            </>
          </Animated.View>
        </Animated.View>
      )}

      {isNavigating && showRadarFeedbackCard && radarFeedbackTarget && (
        <Modal
          visible={true}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={closeRadarFeedbackCard}
        >
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <TouchableOpacity
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: "rgba(0,0,0,0.5)" },
              ]}
              activeOpacity={1}
              onPress={closeRadarFeedbackCard}
            />
            <View style={styles.radarFeedbackOverlay} pointerEvents="box-none">
              <View style={styles.radarFeedbackCard}>
                <Text style={styles.radarFeedbackTitle}>
                  Esse radar ainda existe?
                </Text>
                <Text style={styles.radarFeedbackSubtitle}>
                  Responda para melhorar o mapa
                </Text>
                <View style={styles.radarFeedbackActions}>
                  <TouchableOpacity
                    style={[
                      styles.radarFeedbackButton,
                      styles.radarFeedbackConfirm,
                    ]}
                    onPress={() => {handleRadarFeedbackAction("confirm")}}
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
          </View>
        </Modal>
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
                    backgroundColor: reportStep >= step ? colors.primary : colors.borderLight,
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
                        reportSelectedSpeed === speed ? colors.primary : colors.backgroundLightSecondary,
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor:
                        reportSelectedSpeed === speed ? colors.primary : colors.borderLight,
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
                          reportSelectedSpeed === speed ? colors.text : colors.textDark,
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
                      reportLocationMode === "current" ? colors.primary : colors.backgroundLightSecondary,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor:
                      reportLocationMode === "current" ? colors.primary : colors.borderLight,
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
                        reportLocationMode === "current" ? colors.text : colors.primary
                      }
                    />
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "600",
                        color:
                          reportLocationMode === "current" ? colors.text : colors.textDark,
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
                      reportLocationMode === "map" ? colors.primary : colors.backgroundLightSecondary,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor:
                      reportLocationMode === "map" ? colors.primary : colors.borderLight,
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
                      color={reportLocationMode === "map" ? colors.text : colors.primary}
                    />
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "600",
                        color:
                          reportLocationMode === "map" ? colors.text : colors.textDark,
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
                    <ActivityIndicator size="large" color={colors.primary} />
                  </View>
                }
              >
                <MapComponent
                  ref={mapPickerMapRef}
                  radars={[]}
                  interactive={true}
                  currentLocation={mapPickerCenter}
                  hideUserLocation={true}
                  onCameraChanged={(coords: { latitude: number; longitude: number }) => setPickerPreviewCoords(coords)}
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
                  <Ionicons name="location" size={48} color={colors.error} />
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
                    borderColor: colors.borderLight,
                  }}
                >
                  <Text
                    style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }}
                  >
                    Posição do pin (será reportada)
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                      color: colors.textDark,
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
                  backgroundColor: colors.backgroundLight,
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
                    color: colors.textSecondary,
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
                      backgroundColor: colors.backgroundLightSecondary,
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
                        color: colors.textDarkSecondary,
                      }}
                    >
                      Cancelar
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: 16,
                      backgroundColor: colors.primary,
                      borderRadius: 12,
                      alignItems: "center",
                    }}
                    onPress={async () => {
                      const center =
                        await mapPickerMapRef.current?.getCenter?.();
                      const selected = center ?? mapPickerCenterRef.current;
                      if (!selected) {
                        showAppAlert(
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
                      style={{ fontSize: 16, fontWeight: "600", color: colors.text }}
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
                color={colors.error}
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

      {/* Modal: Atualizar lista de radares — só quando há update; obrigatório */}
      <Modal
        visible={showUpdateRadarsModal}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.reportModalOverlay} pointerEvents="box-none">
          <View
            style={[styles.reportModalContent, { maxWidth: 320 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={{ alignItems: "center", marginBottom: 12 }}>
              <Ionicons
                name="radio-outline"
                size={48}
                color={colors.primary}
                style={{ marginBottom: 12 }}
              />
              <Text
                style={[
                  styles.reportModalTitle,
                  { textAlign: "center", fontSize: 18 },
                ]}
              >
                Atualizações disponíveis
              </Text>
            </View>
            <Text
              style={[
                styles.reportModalSubtitle,
                {
                  textAlign: "center",
                  fontSize: 14,
                  lineHeight: 20,
                  marginBottom: 24,
                  color: colors.textSecondary,
                },
              ]}
            >
              Novos radares ou atualizações no mapa. É necessário atualizar para
              continuar.
            </Text>
            <TouchableOpacity
              style={[
                styles.reportModalSubmit,
                { width: "100%", marginHorizontal: 0 },
                isUpdatingRadars && { opacity: 0.8 },
              ]}
              onPress={() => fetchRadarsManually()}
              disabled={isUpdatingRadars}
            >
              {isUpdatingRadars ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.reportModalSubmitText}>Atualizar radares</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal genérico (substitui Alert.alert) */}
      <AppModal
        visible={appModal.visible}
        title={appModal.title}
        message={appModal.message}
        buttons={
          appModal.type === "alert"
            ? [
                {
                  text: "OK",
                  onPress: () => appModal.onConfirm?.(),
                },
              ]
            : [
                {
                  text: appModal.cancelText ?? "Cancelar",
                  style: "cancel",
                  onPress: () => appModal.onCancel?.(),
                },
                {
                  text: appModal.confirmText ?? "Confirmar",
                  style: "default",
                  onPress: () => appModal.onConfirm?.(),
                },
              ]
        }
        onRequestClose={closeAppModal}
      />

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
                color={colors.success}
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

      {/* Banner de anúncio no plano grátis (escondido para PRO) — fixo no rodapé */}
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, alignItems: "center" }} pointerEvents="box-none">
        <AdBanner visible={isInFreePeriod && !isSubscribed} />
      </View>

      {/* Bloqueio: período grátis encerrado, só PRO libera */}
      {!iapLoading && !hasFullAccess && (
        <View style={styles.blockOverlay} pointerEvents="box-none">
          <View style={styles.blockOverlayCard}>
            <Text style={styles.blockOverlayTitle}>Período grátis encerrado</Text>
            <Text style={styles.blockOverlayText}>
              Assine o RadarZone PRO para continuar usando alertas de radares, navegação com voz e todas as funcionalidades sem anúncios.
            </Text>
            <TouchableOpacity
              style={styles.blockOverlayButton}
              onPress={() => mainMapRef.current?.openMenuToSubscription?.()}
              activeOpacity={0.8}
            >
              <Text style={styles.blockOverlayButtonText}>Assinar PRO</Text>
            </TouchableOpacity>
          </View>
        </View>
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
    backgroundColor: colors.errorDark,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  stopButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  navigationBanner: {
    backgroundColor: colors.backgroundCard,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  navigationInstruction: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  navigationDistance: {
    color: colors.textTertiary,
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
  blockOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10000,
    elevation: 10000,
    padding: 24,
    pointerEvents: "none",
  },
  blockOverlayCard: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 16,
    padding: 28,
    maxWidth: 340,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 12,
  },
  blockOverlayTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textDark,
    marginBottom: 12,
    textAlign: "center",
  },
  blockOverlayText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  blockOverlayButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    minHeight: 48,
    justifyContent: "center",
  },
  blockOverlayButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111111",
  },
  loadingContainer: {
    backgroundColor: colors.backgroundLight,
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
    color: colors.textDark,
    textAlign: "center",
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: colors.textSecondary,
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
    bottom: Platform.OS === "ios" ? 100 : 280,
    right: 20,
    backgroundColor: colors.backgroundLight,
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
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  radarFeedbackSubtitle: {
    color: colors.borderLight,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 10,
    fontWeight: "900",
  },
  radarFeedbackActions: {
    flexDirection: "row",
    gap: 8,
  },
  radarFeedbackButton: {
    marginTop: 15,
    flex: 1,
    borderRadius: 10,
    paddingVertical: 20,
    alignItems: "center",
  },
  radarFeedbackConfirm: {
    backgroundColor: colors.successDark,
  },
  radarFeedbackDeny: {
    backgroundColor: colors.errorDark,
  },
  radarFeedbackButtonText: {
    color: colors.text,
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
    backgroundColor: colors.backgroundLight,
    borderRadius: 16,
    padding: 36,
  
    width: "100%",
    maxWidth: 360,
  },
  reportModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textDark,
    marginBottom: 4,
  },
  reportModalSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  reportModalLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textDarkSecondary,
    marginBottom: 6,
  },
  reportModalInput: {
    borderWidth: 1,
    borderColor: colors.borderLight,
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
    backgroundColor: colors.backgroundLightSecondary,
    borderWidth: 2,
    borderColor: "transparent",
  },
  reportModalTypeCardActive: {
    backgroundColor: "rgba(255,193,7,0.1)",
    borderColor: colors.primary,
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
    color: colors.textDarkSecondary,
  },
  reportModalTypeCardText2: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.textDarkSecondary,
  },
  reportModalTypeCardTextActive: {
    color: colors.primaryDark,
  },
  reportModalButtons: {
    flexDirection: "row",
    gap: 8,
  },
  reportModalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.borderLight,
    alignItems: "center",
  },
  reportModalCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textDarkSecondary,
  },
  reportModalSubmit: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  reportModalSubmitText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111111",
  },
});

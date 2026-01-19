import MapboxNavigation from "@pawan-pk/react-native-mapbox-navigation";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import Geolocation from "react-native-geolocation-service";
import DebugPanel from "../components/DebugPanel";
import Map from "../components/Map";
import {
  getRadarsNearLocation,
  getRadarsNearRoute,
  Radar,
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

export default function Home() {
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [destinationText, setDestinationText] = useState<string>("");
  const [route, setRoute] = useState<any>(null);
  const [routeData, setRouteData] = useState<RouteResponse | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
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
  const [showDebug, setShowDebug] = useState(true); // Mostrar em dev, ocultar em release (pode mudar para true para sempre mostrar)
  const locationWatchRef = useRef<any>(null);
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const lastTtsTime = useRef<{ [key: string]: number }>({});
  const alertedRadarIds = useRef<Set<string>>(new Set()); // Rastrear radares já alertados (apenas uma vez)
  const lastLocationUpdate = useRef<number>(0);
  const locationUpdateDebounce = useRef<NodeJS.Timeout | null>(null);
  const lastCalculatedDistance = useRef<number>(0);

  useEffect(() => {
    initMapbox();
    requestLocationPermission();
    
    // Configurar TTS se disponível (aguardar inicialização do módulo nativo)
    if (Tts) {
      // Verificar se o módulo nativo está pronto antes de configurar
      if (Tts.getInitStatus && typeof Tts.getInitStatus === 'function') {
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
                `✅ ${nearbyRadars.length} radares encontrados na inicialização`
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
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
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

    setLoading(true);
    setGeocoding(true);
    try {
      // Converter endereço em coordenadas
      const destinationCoords = await geocodeAddress(destinationText.trim());
      setDestination(destinationCoords);

      // Buscar rota com instruções (o SDK vai calcular a rota internamente, mas buscamos para obter os pontos para radares)
      const routeResponse = await getRoute(origin, destinationCoords);
      setRouteData(routeResponse);
      setRoute(routeResponse.route);

      // Extrair pontos da rota para enviar ao backend ANTES de iniciar navegação
      const routePoints = routeResponse.route.geometry.coordinates.map(
        (coord: number[]) => ({
          latitude: coord[1],
          longitude: coord[0],
        })
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
        console.log(`✅ ${filtered.length} radares encontrados na rota (filtrados de ${nearbyRadars.length})`);
      } catch (error: any) {
        // O erro já foi tratado dentro de getRadarsNearRoute com fallback
        // Apenas logar se não for o erro esperado de rota não encontrada
        if (!error?.message?.includes("ROUTE_NOT_FOUND") && !error?.message?.includes("404")) {
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
              1000
            );
            // Filtrar também no fallback
            const filtered = filterRadarsNearRoute(fallbackRadars, routePoints, 100);
            setRadars(filtered);
            setFilteredRadars(filtered);
            console.log(
              `✅ ${filtered.length} radares encontrados (fallback, filtrados de ${fallbackRadars.length})`
            );
          } catch (fallbackError) {
            console.error("Erro no fallback de radares:", fallbackError);
          }
        }
      }

      // Iniciar navegação com o SDK
      setIsNavigating(true);
    } catch (error: any) {
      console.error("Erro ao buscar rota:", error);
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
        distanceFilter: 50, // Aumentado para evitar muitas requisições
        interval: 5000,
        fastestInterval: 3000,
      }
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

  return (
    <View style={styles.container}>
      {!isNavigating && (
        <View style={styles.inputContainer}>
          <View style={styles.inputRow}>
            <Text style={styles.label}>Origem:</Text>
            <View style={styles.locationDisplay}>
              <Text style={styles.locationText}>
                {origin
                  ? `📍 Localização atual (${origin.latitude.toFixed(
                      4
                    )}, ${origin.longitude.toFixed(4)})`
                  : "📍 Obtendo localização..."}
              </Text>
            </View>
          </View>
          <View style={styles.inputRow}>
            <Text style={styles.label}>Destino:</Text>
            <TextInput
              style={styles.input}
              placeholder="Digite o endereço de destino (ex: Av. Paulista, 1000, São Paulo)"
              value={destinationText}
              onChangeText={setDestinationText}
              editable={true}
              clearButtonMode="while-editing"
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>
          <TouchableOpacity
            style={[
              styles.button,
              (loading || !origin) && styles.buttonDisabled,
            ]}
            onPress={handleSearchRoute}
            disabled={loading || !origin}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonText}>
              {geocoding
                ? "Buscando endereço..."
                : loading
                ? "Calculando rota..."
                : "Buscar Rota"}
            </Text>
          </TouchableOpacity>
          {radars.length > 0 && (
            <Text style={styles.radarCount}>
              {radars.length} radar(es) encontrado(s) na rota
            </Text>
          )}
        </View>
      )}
      {isNavigating && origin && destination ? (
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
            onLocationChange={(location: any) => {
              const now = Date.now();
              
              // Debounce de atualização de localização para evitar movimentos erráticos
              if (locationUpdateDebounce.current) {
                clearTimeout(locationUpdateDebounce.current);
              }
              
              // Aumentar debounce para 1 segundo para evitar atualizações muito frequentes
              locationUpdateDebounce.current = setTimeout(() => {
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
                    newLocation.longitude
                  );
                  
                  // Se a distância for muito pequena (< 20m), não atualizar
                  // Isso evita que a localização fique "pulando" por causa de ruído do GPS
                  if (distance < 20) {
                    return;
                  }
                  
                  // Verificar se a mudança é muito grande (possível erro do GPS)
                  // Se mudou mais de 100m em menos de 2 segundos, provavelmente é erro
                  if (distance > 100 && now - lastLocationUpdate.current < 2000) {
                    console.warn("⚠️ Mudança de localização muito grande, ignorando (possível erro GPS)");
                    return;
                  }
                }
                
                setCurrentLocation(newLocation);
                lastLocationUpdate.current = now;
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
                  500 // raio de 500m durante navegação
                )
                  .then((nearbyRadars) => {
                    // Filtrar apenas radares próximos à rota
                    if (routeData) {
                      const routePoints = routeData.route.geometry.coordinates.map(
                        (coord: number[]) => ({
                          latitude: coord[1],
                          longitude: coord[0],
                        })
                      );
                      const filtered = filterRadarsNearRoute(nearbyRadars, routePoints, 100);
                      // Mesclar com radares existentes da rota
                      setRadars((prev) => {
                        const existingIds = new Set(prev.map((r) => r.id));
                        const newRadars = filtered.filter(
                          (r) => !existingIds.has(r.id)
                        );
                        const merged = newRadars.length > 0
                          ? [...prev, ...newRadars]
                          : prev;
                        // Re-filtrar todos os radares
                        const allFiltered = filterRadarsNearRoute(merged, routePoints, 100);
                        setFilteredRadars(allFiltered);
                        return allFiltered;
                      });
                    }
                  })
                  .catch((error) => {
                    console.error(
                      "Erro ao buscar radares durante navegação:",
                      error
                    );
                  });

                if (!locationWatchRef.current) {
                  locationWatchRef.current = { lastRadarFetch: now };
                } else {
                  locationWatchRef.current.lastRadarFetch = now;
                }
              }

              // Verificar distância até cada radar e alertar (com debounce)
              // Usar debounce para evitar cálculos muito frequentes
              const checkRadarDistance = () => {
                if (filteredRadars.length > 0 && routeData) {
                  // Usar a localização do callback diretamente
                  const checkLocation = {
                    latitude: location.latitude,
                    longitude: location.longitude,
                  };
                  
                  // Encontrar o radar mais próximo
                  let nearest: { radar: Radar; distance: number } | null = null;
                  let minDistance = Infinity;

                  filteredRadars.forEach((radar) => {
                    const distance = calculateDistance(
                      checkLocation.latitude,
                      checkLocation.longitude,
                      radar.latitude,
                      radar.longitude
                    );

                    // Só considerar radares a menos de 300m
                    if (distance < minDistance && distance < 300) {
                      minDistance = distance;
                      nearest = { radar, distance };
                    }
                  });

                  // Só atualizar se a distância mudou significativamente (mais de 5 metros)
                  if (nearest !== null) {
                    const nearestDistance = nearest.distance;
                    const nearestRadarObj = nearest.radar;
                    
                    // Evitar atualizações muito frequentes se a distância não mudou muito
                    if (Math.abs(nearestDistance - lastCalculatedDistance.current) < 5 && 
                        lastCalculatedDistance.current > 0) {
                      return;
                    }
                    lastCalculatedDistance.current = nearestDistance;
                    
                    setNearestRadar(nearest);
                    
                    // Mostrar modal se estiver entre 200m e 30m (reduzido de 50m para 30m)
                    if (nearestDistance <= 200 && nearestDistance > 30) {
                      Animated.timing(modalOpacity, {
                        toValue: 1,
                        duration: 300,
                        useNativeDriver: true,
                      }).start();
                    } else if (nearestDistance <= 30) {
                      // Esconder modal quando passar 30m
                      Animated.timing(modalOpacity, {
                        toValue: 0,
                        duration: 300,
                        useNativeDriver: true,
                      }).start(() => {
                        setNearestRadar(null);
                      });
                    }

                    // Alerta de voz quando radar está próximo - APENAS UMA VEZ por radar
                    const radarId = nearestRadarObj.id;
                    
                    // Verificar se este radar já foi alertado
                    if (!alertedRadarIds.current.has(radarId) && nearestDistance <= 300 && nearestDistance > 30) {
                      // Marcar como alertado IMEDIATAMENTE para evitar repetição
                      alertedRadarIds.current.add(radarId);
                      
                      let message = "";
                      if (nearestDistance > 200) {
                        message = `Radar a ${Math.round(nearestDistance)} metros`;
                      } else if (nearestDistance > 100) {
                        message = `Atenção! Radar a ${Math.round(nearestDistance)} metros`;
                      } else {
                        message = `Cuidado! Radar muito próximo, ${Math.round(nearestDistance)} metros`;
                      }
                      
                      if (nearestRadarObj.speedLimit) {
                        message += `. Limite de velocidade ${nearestRadarObj.speedLimit} quilômetros por hora`;
                      }

                      if (Tts && typeof Tts.speak === 'function') {
                        try {
                          Tts.speak(message);
                          console.log(`🔊 Alerta de radar: ${message} (ID: ${radarId})`);
                        } catch (error) {
                          console.error("❌ Erro ao falar mensagem TTS:", error);
                        }
                      }
                    }
                  } else {
                    // Esconder modal se não houver radar próximo
                    lastCalculatedDistance.current = 0;
                    Animated.timing(modalOpacity, {
                      toValue: 0,
                      duration: 300,
                      useNativeDriver: true,
                    }).start(() => {
                      setNearestRadar(null);
                    });
                  }
                }
              };
              
              // Limpar timeout anterior se existir
              if (locationUpdateDebounce.current) {
                clearTimeout(locationUpdateDebounce.current);
              }
              
              // Agendar verificação com debounce
              locationUpdateDebounce.current = setTimeout(checkRadarDistance, 1000); // Debounce de 1 segundo para cálculos de distância
            }}
            onRouteProgressChange={(progress: any) => {
              // Progresso da rota atualizado pelo SDK
              // Logs removidos para evitar travamento - este callback é chamado muito frequentemente
              // progress.speedLimit contém o limite de velocidade em km/h (se disponível)
            }}
            onArrive={() => {
              Alert.alert("Chegada", "Você chegou ao destino!");
              setIsNavigating(false);
              setRouteData(null);
              setRoute(null);
            }}
            onCancelNavigation={() => {
              setIsNavigating(false);
              setRouteData(null);
              setRoute(null);
            }}
            onError={(error: any) => {
              console.error("Erro na navegação:", error);
              Alert.alert("Erro", error.message || "Erro na navegação");
            }}
          />
        </View>
      ) : (
        <View style={styles.mapContainer} pointerEvents="box-none">
          <Map
            radars={radars}
            route={route}
            isNavigating={false}
            currentLocation={currentLocation}
          />
        </View>
      )}

      {/* Painel de Debug - mostra logs na tela */}
      <DebugPanel visible={showDebug} />
      
      {/* Botão para mostrar/ocultar debug (triple tap no canto superior direito) */}
      <TouchableOpacity
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          backgroundColor: showDebug ? 'rgba(255, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)',
          padding: 8,
          borderRadius: 20,
          zIndex: 1000,
        }}
        onPress={() => setShowDebug(!showDebug)}
      >
        <Text style={{ color: 'white', fontSize: 10 }}>📊</Text>
      </TouchableOpacity>

      {/* Alerta de radar - não modal, mas overlay compacto no topo */}
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
              ],
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.radarAlertContent}>
            <Text style={styles.radarAlertIcon}>⚠️</Text>
            <View style={styles.radarAlertTextContainer}>
              <Text style={styles.radarAlertTitle}>Radar Próximo</Text>
              <Text style={styles.radarAlertDistance}>
                {Math.round(nearestRadar.distance)}m
                {nearestRadar.radar.speedLimit && (
                  <Text style={styles.radarAlertSpeed}>
                    {" • "}
                    {nearestRadar.radar.speedLimit} km/h
                  </Text>
                )}
              </Text>
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inputContainer: {
    backgroundColor: "#fff",
    padding: 16,
    paddingTop: Platform.OS === "ios" ? 50 : 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    zIndex: 1,
    position: "relative",
  },
  inputRow: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
    color: "#374151",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: "#fff",
    color: "#000",
  },
  locationDisplay: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#f3f4f6",
  },
  locationText: {
    fontSize: 14,
    color: "#374151",
  },
  button: {
    backgroundColor: "#3b82f6",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: "#9ca3af",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  radarAlertContainer: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 60 : 80,
    left: 16,
    right: 16,
    zIndex: 1000,
    pointerEvents: "none",
  },
  radarAlertContent: {
    backgroundColor: "rgba(0, 0, 0, 0.75)", // Fundo mais escuro e transparente
    borderRadius: 8,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 8,
    borderLeftColor: "#FFFF00", // Borda vermelha à esquerda
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  radarAlertIcon: {
    fontSize: 36,
    marginRight: 10,
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
    color: "#FFFF00",
  },
  radarAlertSpeed: {
    fontSize: 12,
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
  radarsOverlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: "box-none",
    zIndex: 1,
    elevation: 0, // Android
  },
});

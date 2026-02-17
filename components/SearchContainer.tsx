import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { LatLng, MAPBOX_TOKEN } from "../services/mapbox";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const COLLAPSED_HEIGHT = 100;
const EXPANDED_HEIGHT = Math.min(SCREEN_HEIGHT * 0.52, 380);
const DRAG_THRESHOLD = 12;

interface SearchContainerProps {
  origin: LatLng | null;
  destinationText: string;
  onDestinationChange: (text: string) => void;
  onDestinationSelect: (address: string, coords: LatLng) => void;
  onSearchRoute: () => void;
  loading: boolean;
  geocoding: boolean;
  radarsCount: number;
}

interface GeocodeResult {
  id: string;
  placeName: string;
  coordinates: LatLng;
}

export default function SearchContainer({
  destinationText,
  onDestinationChange,
  onDestinationSelect,
  onSearchRoute,
  loading,
  geocoding,
}: SearchContainerProps) {
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sheetHeight = useRef(new Animated.Value(COLLAPSED_HEIGHT)).current;
  const heightRef = useRef(COLLAPSED_HEIGHT);

  useEffect(() => {
    const id = sheetHeight.addListener(({ value }) => {
      heightRef.current = value;
    });
    return () => sheetHeight.removeListener(id);
  }, [sheetHeight]);

  useEffect(() => {
    const sub1 = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        const kbHeight = e?.endCoordinates?.height ?? 280;
        const targetHeight = Math.min(SCREEN_HEIGHT - kbHeight - 20, EXPANDED_HEIGHT);
        Animated.timing(sheetHeight, {
          toValue: Math.max(targetHeight, COLLAPSED_HEIGHT),
          duration: 250,
          useNativeDriver: false,
        }).start();
      }
    );
    const sub2 = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => snapToNearest()
    );
    return () => {
      sub1.remove();
      sub2.remove();
    };
  }, [sheetHeight]);

  const snapToNearest = () => {
    const val = heightRef.current;
    const mid = (COLLAPSED_HEIGHT + EXPANDED_HEIGHT) / 2;
    if (val > mid) {
      Animated.spring(sheetHeight, {
        toValue: EXPANDED_HEIGHT,
        useNativeDriver: false,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.spring(sheetHeight, {
        toValue: COLLAPSED_HEIGHT,
        useNativeDriver: false,
        tension: 65,
        friction: 11,
      }).start();
    }
  };

  const gestureStartHeight = useRef(COLLAPSED_HEIGHT);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > DRAG_THRESHOLD,
      onPanResponderGrant: () => {
        gestureStartHeight.current = heightRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const newH = gestureStartHeight.current - gestureState.dy;
        const clamped = Math.max(COLLAPSED_HEIGHT, Math.min(EXPANDED_HEIGHT, newH));
        sheetHeight.setValue(clamped);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (Math.abs(gestureState.vy) > 0.25) {
          if (gestureState.vy < 0) {
            Animated.spring(sheetHeight, {
              toValue: EXPANDED_HEIGHT,
              useNativeDriver: false,
              tension: 65,
              friction: 11,
            }).start();
          } else {
            Animated.spring(sheetHeight, {
              toValue: COLLAPSED_HEIGHT,
              useNativeDriver: false,
              tension: 65,
              friction: 11,
            }).start();
          }
        } else {
          snapToNearest();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!destinationText.trim() || destinationText.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceTimer.current = setTimeout(async () => {
      try {
        const encodedQuery = encodeURIComponent(destinationText.trim());
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?access_token=${MAPBOX_TOKEN}&limit=5&country=BR&language=pt`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("Erro ao buscar sugestões");
        const json = await response.json();
        const results: GeocodeResult[] = (json.features || []).map(
          (feature: any) => ({
            id: feature.id,
            placeName: feature.place_name || feature.text,
            coordinates: {
              latitude: feature.geometry.coordinates[1],
              longitude: feature.geometry.coordinates[0],
            },
          })
        );
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [destinationText]);

  const handleSelectSuggestion = (suggestion: GeocodeResult) => {
    onDestinationSelect(suggestion.placeName, suggestion.coordinates);
    setShowSuggestions(false);
    setSuggestions([]);
    Keyboard.dismiss();
  };

  const expandSheet = () => {
    Animated.spring(sheetHeight, {
      toValue: EXPANDED_HEIGHT,
      useNativeDriver: false,
      tension: 65,
      friction: 11,
    }).start();
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
      pointerEvents="box-none"
    >
      <Animated.View
        style={[
          styles.container,
          {
            height: sheetHeight,
          },
        ]}
      >
        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={styles.dragHandle}>
          <View style={styles.dragBar} />
        </View>

        <View style={styles.content}>
          <View style={styles.inputRow}>
            <View style={styles.inputWrap}>
              <Ionicons
                name="search"
                size={20}
                color="#6b7280"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Vai para onde?"
                placeholderTextColor="#9ca3af"
                value={destinationText}
                onChangeText={onDestinationChange}
                onFocus={expandSheet}
                editable={!loading && !geocoding}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {(loading || geocoding) && (
                <View style={styles.loadingIndicator}>
                  <ActivityIndicator size="small" color="#3b82f6" />
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.searchButton,
                (loading || geocoding) && styles.searchButtonDisabled,
              ]}
              onPress={onSearchRoute}
              disabled={loading || geocoding || !destinationText.trim()}
            >
              {(loading || geocoding) ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="navigate" size={22} color="#fff" />
              )}
            </TouchableOpacity>
          </View>

          {showSuggestions && suggestions.length > 0 && (
            <View style={styles.suggestionsContainer}>
              <FlatList
                data={suggestions}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.suggestionItem}
                    onPress={() => handleSelectSuggestion(item)}
                  >
                    <Ionicons
                      name="location-outline"
                      size={18}
                      color="#6b7280"
                    />
                    <Text style={styles.suggestionText} numberOfLines={1}>
                      {item.placeName}
                    </Text>
                  </TouchableOpacity>
                )}
                style={styles.suggestionsList}
                keyboardShouldPersistTaps="handled"
              />
            </View>
          )}
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  container: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
  },
  dragHandle: {
    alignItems: "center",
    paddingVertical: 10,
  },
  dragBar: {
    width: 40,
    height: 4,
    backgroundColor: "#d1d5db",
    borderRadius: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#111827",
    paddingVertical: 12,
  },
  loadingIndicator: {
    marginLeft: 8,
  },
  searchButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#3b82f6",
    justifyContent: "center",
    alignItems: "center",
  },
  searchButtonDisabled: {
    backgroundColor: "#9ca3af",
    opacity: 0.6,
  },
  suggestionsContainer: {
    flex: 1,
    marginTop: 8,
    minHeight: 0,
  },
  suggestionsList: {
    flex: 1,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  suggestionText: {
    flex: 1,
    fontSize: 15,
    color: "#374151",
  },
});

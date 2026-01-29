import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LatLng, MAPBOX_TOKEN } from "../services/mapbox";

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
  radarsCount,
}: SearchContainerProps) {
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Buscar sugestões de endereço quando o texto muda
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

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
        if (!response.ok) {
          throw new Error("Erro ao buscar sugestões");
        }

        const json = await response.json();
        const results: GeocodeResult[] = (json.features || []).map(
          (feature: any) => ({
            id: feature.id,
            placeName: feature.place_name || feature.text,
            coordinates: {
              latitude: feature.geometry.coordinates[1],
              longitude: feature.geometry.coordinates[0],
            },
          }),
        );

        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch (error) {
        console.error("Erro ao buscar sugestões:", error);
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300); // Debounce de 300ms

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [destinationText]);

  const handleSelectSuggestion = (suggestion: GeocodeResult) => {
    onDestinationSelect(suggestion.placeName, suggestion.coordinates);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Destino</Text>
          <TextInput
            style={styles.input}
            placeholder="Digite o endereço de destino"
            placeholderTextColor="#9ca3af"
            value={destinationText}
            onChangeText={onDestinationChange}
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
          {loading || geocoding ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.searchButtonText}>Buscar Rota</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Lista de sugestões */}
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
                <Text style={styles.suggestionText}>{item.placeName}</Text>
              </TouchableOpacity>
            )}
            style={styles.suggestionsList}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      )}

      {/* Contador de radares */}
      {radarsCount > 0 && (
        <View style={styles.radarCountContainer}>
          <Text style={styles.radarCountText}>
            📍 {radarsCount} {radarsCount === 1 ? "radar" : "radares"} próximo
            {radarsCount === 1 ? "" : "s"}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingHorizontal: 16,
  },
  searchContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  inputContainer: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#f9fafb",
  },
  loadingIndicator: {
    position: "absolute",
    right: 12,
    top: 40,
  },
  searchButton: {
    backgroundColor: "#3b82f6",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  searchButtonDisabled: {
    backgroundColor: "#9ca3af",
    opacity: 0.6,
  },
  searchButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  suggestionsContainer: {
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    maxHeight: 200,
  },
  suggestionsList: {
    maxHeight: 200,
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  suggestionText: {
    fontSize: 14,
    color: "#111827",
  },
  radarCountContainer: {
    marginTop: 8,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderRadius: 8,
    padding: 8,
    alignItems: "center",
  },
  radarCountText: {
    fontSize: 12,
    color: "#3b82f6",
    fontWeight: "500",
  },
});

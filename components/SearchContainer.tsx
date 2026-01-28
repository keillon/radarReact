import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';

interface SearchContainerProps {
  origin: { latitude: number; longitude: number } | null;
  destinationText: string;
  onDestinationChange: (text: string) => void;
  onDestinationSelect: (location: { latitude: number; longitude: number }, address: string) => void;
  onSearchRoute: () => void;
  loading: boolean;
  geocoding: boolean;
  radarsCount: number;
}

const SearchContainer: React.FC<SearchContainerProps> = ({
  origin,
  destinationText,
  onDestinationChange,
  onDestinationSelect,
  onSearchRoute,
  loading,
  geocoding,
  radarsCount
}) => {
  const [inputText, setInputText] = useState(destinationText);

  const handleSearchPress = () => {
    if (inputText.trim()) {
      onDestinationChange(inputText);
      onSearchRoute();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <TextInput
          style={styles.input}
          placeholder="Para onde você vai?"
          value={inputText}
          onChangeText={setInputText}
          editable={!loading && !geocoding}
          onSubmitEditing={handleSearchPress}
        />
        <TouchableOpacity
          style={[styles.searchButton, (loading || geocoding) && styles.disabledButton]}
          onPress={handleSearchPress}
          disabled={loading || geocoding}
        >
          {loading || geocoding ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.searchButtonText}>Buscar</Text>
          )}
        </TouchableOpacity>
      </View>
      
      {radarsCount > 0 && (
        <View style={styles.radarsInfo}>
          <Text style={styles.radarsText}>
            {radarsCount} radar{radarsCount !== 1 ? 's' : ''} próximo{radarsCount !== 1 ? 's' : ''}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    zIndex: 1000,
  },
  searchBox: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  input: {
    flex: 1,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
  },
  searchButton: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#CCCCCC',
  },
  searchButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  radarsInfo: {
    marginTop: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  radarsText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default SearchContainer;
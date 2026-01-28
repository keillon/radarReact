import MapboxGL from '@rnmapbox/maps';
import React, { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Token do Mapbox
const MAPBOX_ACCESS_TOKEN = 'sk.eyJ1Ijoia2VpbGxvbiIsImEiOiJjbWsxZ3RwYnIwNjJ3M2NuNmtxdzFmbWk0In0.xQW5C9eE6JG4HBVkuEBLxg';

// Configurar token do Mapbox
MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

interface SimpleNavigationProps {
  origin?: [number, number]; // [longitude, latitude]
  destination?: [number, number];
  onNavigationStart?: () => void;
  onNavigationEnd?: () => void;
}

const SimpleNavigation: React.FC<SimpleNavigationProps> = ({
  origin,
  destination,
  onNavigationStart,
  onNavigationEnd
}) => {
  const [isNavigating, setIsNavigating] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<any[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const mapViewRef = useRef<MapboxGL.MapView>(null);

  const calculateRoute = async () => {
    if (!origin || !destination) return;
    
    try {
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?geometries=geojson&access_token=${MAPBOX_ACCESS_TOKEN}`
      );
      
      const data = await response.json();
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coordinates = route.geometry.coordinates;
        setRouteCoordinates(coordinates);
        setIsNavigating(true);
        onNavigationStart?.();
      }
    } catch (error) {
      console.error('Erro ao calcular rota:', error);
      Alert.alert('Erro', 'Não foi possível calcular a rota');
    }
  };

  const startNavigation = () => {
    if (!origin || !destination) {
      Alert.alert('Erro', 'Origem e destino são necessários');
      return;
    }
    calculateRoute();
  };

  const stopNavigation = () => {
    setIsNavigating(false);
    setRouteCoordinates([]);
    onNavigationEnd?.();
  };

  const onUserLocationUpdate = (location: any) => {
    const coords = location.coords;
    setUserLocation([coords.longitude, coords.latitude]);
  };

  return (
    <View style={styles.container}>
      <MapboxGL.MapView
        ref={mapViewRef}
        style={styles.map}
        styleURL={MapboxGL.StyleURL.Street}
        onUserLocationUpdate={onUserLocationUpdate}
      >
        <MapboxGL.UserLocation
          animated={true}
          visible={true}
          androidRenderMode="gps"
        />
        
        {/* Rota */}
        {routeCoordinates.length > 0 && (
          <MapboxGL.ShapeSource id="routeSource" shape={{
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: routeCoordinates
            }
          }}>
            <MapboxGL.LineLayer
              id="routeLayer"
              style={{
                lineColor: '#4285F4',
                lineWidth: 6,
                lineCap: 'round',
                lineJoin: 'round'
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* Origem */}
        {origin && (
          <MapboxGL.PointAnnotation
            id="origin-marker"
            coordinate={origin}
          >
            <View style={[styles.marker, styles.originMarker]}>
              <Text style={styles.markerText}>O</Text>
            </View>
          </MapboxGL.PointAnnotation>
        )}

        {/* Destino */}
        {destination && (
          <MapboxGL.PointAnnotation
            id="destination-marker"
            coordinate={destination}
          >
            <View style={[styles.marker, styles.destinationMarker]}>
              <Text style={styles.markerText}>D</Text>
            </View>
          </MapboxGL.PointAnnotation>
        )}
      </MapboxGL.MapView>

      {/* Controles de Navegação */}
      <View style={styles.controls}>
        {!isNavigating ? (
          <TouchableOpacity
            style={[styles.button, styles.startButton]}
            onPress={startNavigation}
            disabled={!origin || !destination}
          >
            <Text style={styles.buttonText}>Iniciar Navegação</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.stopButton]}
            onPress={stopNavigation}
          >
            <Text style={styles.buttonText}>Parar Navegação</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Informações de navegação */}
      {isNavigating && userLocation && routeCoordinates.length > 0 && (
        <View style={styles.infoPanel}>
          <Text style={styles.infoText}>
            Navegando... {routeCoordinates.length} pontos na rota
          </Text>
          <Text style={styles.infoText}>
            Sua posição: {userLocation[1].toFixed(6)}, {userLocation[0].toFixed(6)}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  controls: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  button: {
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButton: {
    backgroundColor: '#4CAF50',
  },
  stopButton: {
    backgroundColor: '#F44336',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  marker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  originMarker: {
    backgroundColor: '#4CAF50',
  },
  destinationMarker: {
    backgroundColor: '#F44336',
  },
  markerText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  infoPanel: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 10,
  },
  infoText: {
    color: 'white',
    fontSize: 14,
    marginBottom: 5,
  },
});

export default SimpleNavigation;
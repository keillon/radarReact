import MapboxGL from "@rnmapbox/maps";

export const MAPBOX_TOKEN =
  "pk.eyJ1Ijoia2VpbGxvbiIsImEiOiJjbWpld2g0dnkwN3FyM2txMTY4aGN3aTlvIn0.CwcSIMVWiMyt_z9tRwi6WQ";

export const initMapbox = () => {
  MapboxGL.setAccessToken(MAPBOX_TOKEN);
};

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface RouteFeature {
  type: "Feature";
  properties: Record<string, any>;
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
}

export interface NavigationStep {
  distance: number; // em metros
  duration: number; // em segundos
  instruction: string;
  maneuver: {
    type: string;
    instruction: string;
    modifier?: string;
  };
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
}

export interface RouteResponse {
  route: RouteFeature;
  steps: NavigationStep[];
  distance: number; // distância total em metros
  duration: number; // duração total em segundos
}

/**
 * Converte um endereço em coordenadas (geocodificação)
 */
export const geocodeAddress = async (address: string): Promise<LatLng> => {
  const encodedAddress = encodeURIComponent(address);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=BR`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Falha ao buscar endereço no Mapbox Geocoding");
  }

  const json = await response.json();
  const feature = json?.features?.[0];
  if (!feature || !feature.geometry || !feature.geometry.coordinates) {
    throw new Error("Endereço não encontrado");
  }

  const [longitude, latitude] = feature.geometry.coordinates;
  return { latitude, longitude };
};

export const getRoute = async (
  origin: LatLng,
  destination: LatLng
): Promise<RouteResponse> => {
  const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&overview=full&steps=true&language=pt&access_token=${MAPBOX_TOKEN}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Falha ao buscar rota no Mapbox Directions");
  }

  const json = await response.json();
  const route = json?.routes?.[0];
  if (!route || !route.geometry || route.geometry.type !== "LineString") {
    throw new Error("Rota inválida retornada pela API do Mapbox");
  }

  // Extrair steps (instruções de navegação)
  const steps: NavigationStep[] = [];
  if (route.legs && route.legs[0] && route.legs[0].steps) {
    route.legs[0].steps.forEach((step: any) => {
      steps.push({
        distance: step.distance,
        duration: step.duration,
        instruction: step.maneuver?.instruction || "",
        maneuver: {
          type: step.maneuver?.type || "",
          instruction: step.maneuver?.instruction || "",
          modifier: step.maneuver?.modifier,
        },
        geometry: step.geometry,
      });
    });
  }

  return {
    route: {
      type: "Feature",
      properties: {},
      geometry: route.geometry,
    },
    steps,
    distance: route.distance || 0,
    duration: route.duration || 0,
  };
};

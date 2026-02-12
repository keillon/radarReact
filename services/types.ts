export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface Radar {
  id: string;
  latitude: number;
  longitude: number;
  speedLimit?: number;
  type?: string;
  situacao?: string | null;
  ativo?: boolean;
  confirms?: number;
  denies?: number;
  reportedAt?: number;
}

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface NearRouteRequest {
  route: RoutePoint[];
  radius?: number;
}

export interface RouteResponse {
  route: any;
  distance: number;
  duration: number;
}

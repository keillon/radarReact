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
  /** Fonte: "user" = reportado por usuário, "csv" = dados oficiais, etc */
  source?: string | null;
  rodovia?: string | null;
  municipio?: string | null;
  uf?: string | null;
  createdAt?: number; // timestamp ms
  /** ID do usuário que reportou (quando source === "user" ou "reportado") */
  reportedBy?: string | null;
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

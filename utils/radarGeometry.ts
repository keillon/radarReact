export type GeoPoint = {
  latitude: number;
  longitude: number;
};

/** Raio máximo (m) da rota para considerar radar: estradas têm ~10–30m de largura. */
export const MAX_ROUTE_DISTANCE_METERS = 6;
export const RADAR_DIRECT_FILTER_METERS = 800;

export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const earthRadius = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadius * c;
};

export const distanceToLineSegment = (
  point: GeoPoint,
  lineStart: GeoPoint,
  lineEnd: GeoPoint
): number => {
  const a = point.latitude - lineStart.latitude;
  const b = point.longitude - lineStart.longitude;
  const c = lineEnd.latitude - lineStart.latitude;
  const d = lineEnd.longitude - lineStart.longitude;

  const dot = a * c + b * d;
  const lenSq = c * c + d * d;
  const t = lenSq !== 0 ? Math.max(0, Math.min(1, dot / lenSq)) : 0;

  const projectedLat = lineStart.latitude + t * c;
  const projectedLon = lineStart.longitude + t * d;
  return calculateDistance(point.latitude, point.longitude, projectedLat, projectedLon);
};

export const calculateDistanceToRoute = (
  point: GeoPoint,
  routePoints: GeoPoint[]
): number => {
  if (routePoints.length < 2) return Infinity;
  let minDistance = Infinity;
  for (let i = 0; i < routePoints.length - 1; i++) {
    const segmentDistance = distanceToLineSegment(point, routePoints[i], routePoints[i + 1]);
    if (segmentDistance < minDistance) minDistance = segmentDistance;
  }
  return minDistance;
};

export const getCumulativeDistances = (routePoints: GeoPoint[]): number[] => {
  const cumulative: number[] = [0];
  for (let i = 1; i < routePoints.length; i++) {
    cumulative[i] =
      cumulative[i - 1] +
      calculateDistance(
        routePoints[i - 1].latitude,
        routePoints[i - 1].longitude,
        routePoints[i].latitude,
        routePoints[i].longitude
      );
  }
  return cumulative;
};

export const projectPointOntoRoute = (
  point: GeoPoint,
  routePoints: GeoPoint[],
  cumulative: number[]
): number => {
  if (routePoints.length < 2 || cumulative.length !== routePoints.length) return 0;

  let bestCumulative = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < routePoints.length - 1; i++) {
    const segStart = routePoints[i];
    const segEnd = routePoints[i + 1];
    const segLength = cumulative[i + 1] - cumulative[i] || 1e-9;
    const a = point.latitude - segStart.latitude;
    const b = point.longitude - segStart.longitude;
    const c = segEnd.latitude - segStart.latitude;
    const d = segEnd.longitude - segStart.longitude;
    const dot = a * c + b * d;
    const lenSq = c * c + d * d;
    const t = Math.max(0, Math.min(1, lenSq > 0 ? dot / lenSq : 0));

    const projLat = segStart.latitude + t * c;
    const projLon = segStart.longitude + t * d;
    const distance = calculateDistance(point.latitude, point.longitude, projLat, projLon);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCumulative = cumulative[i] + t * segLength;
    }
  }
  return bestCumulative;
};

export const calculateDistanceAlongRouteWithCumulative = (
  userLocation: GeoPoint,
  radarLocation: GeoPoint,
  routePoints: GeoPoint[],
  cumulative: number[]
): { distance: number; hasPassed: boolean } => {
  if (routePoints.length < 2 || cumulative.length !== routePoints.length) {
    return { distance: Infinity, hasPassed: false };
  }
  const userCumulative = projectPointOntoRoute(userLocation, routePoints, cumulative);
  const radarCumulative = projectPointOntoRoute(radarLocation, routePoints, cumulative);
  const distanceAlongRoute = radarCumulative - userCumulative;
  const hasPassed = distanceAlongRoute < 5;

  return {
    distance: hasPassed ? 0 : Math.max(0, distanceAlongRoute),
    hasPassed,
  };
};

export const roundDistanceTo10 = (meters: number): number => {
  if (meters <= 0) return 0;
  return Math.round(meters / 10) * 10;
};

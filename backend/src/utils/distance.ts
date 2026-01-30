export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function pointToLineDistance(
  pointLat: number,
  pointLon: number,
  lineStartLat: number,
  lineStartLon: number,
  lineEndLat: number,
  lineEndLon: number
): number {
  const A = pointLat - lineStartLat;
  const B = pointLon - lineStartLon;
  const C = lineEndLat - lineStartLat;
  const D = lineEndLon - lineStartLon;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) param = dot / lenSq;

  let xx: number, yy: number;

  if (param < 0) {
    xx = lineStartLat;
    yy = lineStartLon;
  } else if (param > 1) {
    xx = lineEndLat;
    yy = lineEndLon;
  } else {
    xx = lineStartLat + param * C;
    yy = lineStartLon + param * D;
  }

  const dx = pointLat - xx;
  const dy = pointLon - yy;
  return Math.sqrt(dx * dx + dy * dy) * 111000;
}

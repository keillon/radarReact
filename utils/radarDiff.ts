export type MapboxRadarItem = {
  id: string;
  latitude: number;
  longitude: number;
  speedLimit: number;
  type: string;
};

export const areMapboxRadarArraysEqual = (
  prev: MapboxRadarItem[] | null | undefined,
  next: MapboxRadarItem[] | null | undefined
): boolean => {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;

  const prevMap = new Map(prev.map((r) => [r.id, r]));
  for (const b of next) {
    const a = prevMap.get(b.id);
    if (
      !a ||
      a.latitude !== b.latitude ||
      a.longitude !== b.longitude ||
      a.speedLimit !== b.speedLimit ||
      a.type !== b.type
    ) {
      return false;
    }
  }
  return true;
};

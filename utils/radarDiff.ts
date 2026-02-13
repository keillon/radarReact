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

  for (let i = 0; i < next.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (
      a.id !== b.id ||
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

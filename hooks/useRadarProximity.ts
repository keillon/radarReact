import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Radar } from "../services/api";
import { LatLng } from "../services/mapbox";
import {
  calculateDistance,
  calculateDistanceAlongRouteWithCumulative,
  calculateDistanceToRoute,
  MAX_ROUTE_DISTANCE_METERS,
  RADAR_DIRECT_FILTER_METERS,
  roundDistanceTo10,
} from "../utils/radarGeometry";

type UseRadarProximityInput = {
  currentLocation: LatLng | null;
  routePoints: LatLng[];
  cumulativeDistances: number[];
  radars: Radar[];
};

type UseRadarProximityResult = {
  radarAtivo: Radar | null;
  distanciaAtual: number | null;
  acabouDePassar: boolean;
  deveTocarAlerta: boolean;
  deveAbrirModal: boolean;
  nearbyRadarIds: Set<string>;
  rearmRadarState: (radarIds: string[]) => void;
  resetProximityState: () => void;
};

const PROXIMITY_DEBOUNCE_MS = 80;
const MOVEMENT_THRESHOLD_METERS = 2;
const ALONG_ROUTE_WINDOW_METERS = 800;
const MODAL_WINDOW_METERS = 300;
const PASS_DISTANCE_METERS = 10;

export function useRadarProximity({
  currentLocation,
  routePoints,
  cumulativeDistances,
  radars,
}: UseRadarProximityInput): UseRadarProximityResult {
  const [radarAtivo, setRadarAtivo] = useState<Radar | null>(null);
  const [distanciaAtual, setDistanciaAtual] = useState<number | null>(null);
  const [acabouDePassar, setAcabouDePassar] = useState(false);
  const [deveTocarAlerta, setDeveTocarAlerta] = useState(false);
  const [deveAbrirModal, setDeveAbrirModal] = useState(false);
  const [nearbyRadarIds, setNearbyRadarIds] = useState<Set<string>>(new Set());

  const activeRadarIdRef = useRef<string | null>(null);
  const passedRadarIdsRef = useRef<Set<string>>(new Set());
  const playedAlertRadarIdsRef = useRef<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousLocationRef = useRef<LatLng | null>(null);
  const lastDistanceRef = useRef<number | null>(null);

  const resetProximityState = useCallback(() => {
    activeRadarIdRef.current = null;
    passedRadarIdsRef.current.clear();
    playedAlertRadarIdsRef.current.clear();
    previousLocationRef.current = null;
    lastDistanceRef.current = null;
    setRadarAtivo(null);
    setDistanciaAtual(null);
    setAcabouDePassar(false);
    setDeveTocarAlerta(false);
    setDeveAbrirModal(false);
    setNearbyRadarIds(new Set());
  }, []);

  const rearmRadarState = useCallback((radarIds: string[]) => {
    if (!radarIds || radarIds.length === 0) return;
    for (const id of radarIds) {
      if (!id) continue;
      passedRadarIdsRef.current.delete(id);
      playedAlertRadarIdsRef.current.delete(id);
      if (activeRadarIdRef.current === id) activeRadarIdRef.current = null;
    }
  }, []);

  const radarIndexById = useMemo(() => {
    const index = new Map<string, Radar>();
    for (const radar of radars) {
      if (radar?.id) index.set(radar.id, radar);
    }
    return index;
  }, [radars]);

  const runProximityCheck = useCallback((forceRun = false) => {
    if (
      !currentLocation ||
      routePoints.length < 2 ||
      cumulativeDistances.length !== routePoints.length ||
      radars.length === 0
    ) {
      setRadarAtivo(null);
      setDistanciaAtual(null);
      setAcabouDePassar(false);
      setDeveTocarAlerta(false);
      setDeveAbrirModal(false);
      setNearbyRadarIds(new Set());
      return;
    }

    const checkLocation = {
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
    };

    if (!forceRun && previousLocationRef.current) {
      const movementDistance = calculateDistance(
        previousLocationRef.current.latitude,
        previousLocationRef.current.longitude,
        checkLocation.latitude,
        checkLocation.longitude
      );
      if (movementDistance < MOVEMENT_THRESHOLD_METERS) {
        return;
      }
    }

    previousLocationRef.current = checkLocation;

    const directCandidates: Radar[] = [];
      for (const radar of radars) {
        if (!radar?.id) continue;
        if (passedRadarIdsRef.current.has(radar.id)) continue;
        if (radar.situacao && radar.situacao.toLowerCase().includes("inativ")) continue;
        const directDistance = calculateDistance(
          checkLocation.latitude,
          checkLocation.longitude,
          radar.latitude,
          radar.longitude
        );
        if (directDistance <= RADAR_DIRECT_FILTER_METERS) {
          directCandidates.push(radar);
        }
      }

      type Candidate = {
        radar: Radar;
        distance: number;
      };
      const candidates: Candidate[] = [];
      for (const radar of directCandidates) {
        const radarPoint = { latitude: radar.latitude, longitude: radar.longitude };
        const routeDistance = calculateDistanceToRoute(radarPoint, routePoints);
        if (routeDistance > MAX_ROUTE_DISTANCE_METERS) continue;

        const routeDistanceResult = calculateDistanceAlongRouteWithCumulative(
          checkLocation,
          radarPoint,
          routePoints,
          cumulativeDistances
        );
        if (routeDistanceResult.hasPassed && !routeDistanceResult.atRadarWindow) {
          passedRadarIdsRef.current.add(radar.id);
          continue;
        }
        const alongRouteDistance = routeDistanceResult.distance;
        const atRadarWindow = routeDistanceResult.atRadarWindow;
        if (!atRadarWindow && (alongRouteDistance < 0 || alongRouteDistance > ALONG_ROUTE_WINDOW_METERS)) continue;
        const displayDistance = atRadarWindow ? 0 : roundDistanceTo10(alongRouteDistance);
        candidates.push({
          radar,
          distance: displayDistance,
        });
      }

      candidates.sort((a, b) => a.distance - b.distance);

      let selectedCandidate: Candidate | null = null;
      const activeId = activeRadarIdRef.current;
      if (activeId && !passedRadarIdsRef.current.has(activeId)) {
        const activeCurrentRadar = radarIndexById.get(activeId);
        if (activeCurrentRadar) {
          const activeDirectDistance = calculateDistance(
            checkLocation.latitude,
            checkLocation.longitude,
            activeCurrentRadar.latitude,
            activeCurrentRadar.longitude
          );
          if (activeDirectDistance <= RADAR_DIRECT_FILTER_METERS) {
            selectedCandidate = candidates.find((candidate) => candidate.radar.id === activeId) || null;
          } else {
            activeRadarIdRef.current = null;
          }
        } else {
          activeRadarIdRef.current = null;
        }
      }
      if (!selectedCandidate && candidates.length > 0) {
        selectedCandidate = candidates[0];
        activeRadarIdRef.current = selectedCandidate.radar.id;
      }

      if (!selectedCandidate) {
        activeRadarIdRef.current = null;
        lastDistanceRef.current = null;
        setRadarAtivo(null);
        setDistanciaAtual(null);
        setAcabouDePassar(false);
        setDeveTocarAlerta(false);
        setDeveAbrirModal(false);
        setNearbyRadarIds(new Set());
        return;
      }

      const nextDistance = selectedCandidate.distance;
      if (lastDistanceRef.current != null && Math.abs(lastDistanceRef.current - nextDistance) < MOVEMENT_THRESHOLD_METERS) {
        return;
      }
      lastDistanceRef.current = nextDistance;

      const selectedRadar = selectedCandidate.radar;
      const justPassed = nextDistance < PASS_DISTANCE_METERS;
      if (justPassed) {
        passedRadarIdsRef.current.add(selectedRadar.id);
      }
      const shouldPlayAlert =
        nextDistance <= 30 &&
        nextDistance >= 0 &&
        !playedAlertRadarIdsRef.current.has(selectedRadar.id);
      if (shouldPlayAlert) {
        playedAlertRadarIdsRef.current.add(selectedRadar.id);
      }

      setRadarAtivo(selectedRadar);
      setDistanciaAtual(justPassed ? 0 : nextDistance);
      setAcabouDePassar(justPassed);
      setDeveTocarAlerta(shouldPlayAlert);
      setDeveAbrirModal(nextDistance <= MODAL_WINDOW_METERS);
      setNearbyRadarIds(new Set([selectedRadar.id]));
  }, [currentLocation, cumulativeDistances, radarIndexById, radars, routePoints]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    runProximityCheck();

    debounceRef.current = setTimeout(() => {
      runProximityCheck();
    }, PROXIMITY_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [currentLocation, cumulativeDistances, radarIndexById, radars, routePoints, runProximityCheck]);

  const INTERVAL_MS = 120;
  useEffect(() => {
    if (
      !currentLocation ||
      routePoints.length < 2 ||
      radars.length === 0
    ) {
      return;
    }
    const id = setInterval(() => runProximityCheck(true), INTERVAL_MS);
    return () => clearInterval(id);
  }, [currentLocation, routePoints.length, radars.length, runProximityCheck]);

  return useMemo(
    () => ({
      radarAtivo,
      distanciaAtual,
      acabouDePassar,
      deveTocarAlerta,
      deveAbrirModal,
      nearbyRadarIds,
      rearmRadarState,
      resetProximityState,
    }),
    [
      acabouDePassar,
      deveAbrirModal,
      deveTocarAlerta,
      distanciaAtual,
      nearbyRadarIds,
      radarAtivo,
      rearmRadarState,
      resetProximityState,
    ]
  );
}

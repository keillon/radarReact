import mapboxgl from "mapbox-gl";
import { memo, useEffect, useRef } from "react";
import type { Radar } from "./api";

const MAPBOX_TOKEN =
  import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.VITE_MapboxAccessToken;

mapboxgl.accessToken = MAPBOX_TOKEN || "";

const SOURCE_ID = "radars-source";
const LAYER_ID = "radars-layer";
const CLUSTER_LAYER_ID = "radars-clusters";
const CLUSTER_COUNT_LAYER_ID = "radars-cluster-count";

/** Mapeia tipo do CSV/API para ícone (usado em admin, app e navegação). */
function getRadarIconName(type: string | undefined): string {
  if (!type) return "radar";
  const t = type.trim().toLowerCase().normalize("NFD").replace(/\u0300/g, "");
  if (t.includes("semaforo") && t.includes("camera")) return "radarSemaforico";
  if (t.includes("semaforo") && t.includes("radar")) return "radarSemaforico";
  if (t.includes("radar") && t.includes("fixo")) return "radarFixo";
  if (t.includes("radar") && (t.includes("movel") || t.includes("móvel"))) return "radarMovel";
  return "radar";
}

const ICON_NAMES = [
  "radar",
  "radarFixo",
  "radarMovel",
  "radarSemaforico",
] as const;
const ICON_SIZE = 0.2;

interface MapProps {
  radars?: Radar[];
  selectedId?: string | null;
  onSelectRadar?: (radar: Radar) => void;
  onMapClick?: (lat: number, lng: number) => void;
  center?: [number, number];
  zoom?: number;
  onCenterChange?: (center: [number, number]) => void;
  onZoomChange?: (zoom: number) => void;
}

function radarsToGeoJSON(radars: Radar[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: radars.map((r) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [r.longitude, r.latitude],
      },
      properties: {
        id: r.id,
        inactive: r.situacao === "Inativo" || r.situacao === "inativo",
        icon: getRadarIconName(r.type),
      },
    })),
  };
}

function Map({
  radars = [],
  selectedId = null,
  onSelectRadar = () => {},
  onMapClick = () => {},
  center = [-46.6333, -23.5505] as [number, number],
  zoom = 10,
  onCenterChange,
  onZoomChange,
}: Partial<MapProps> = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const radarsRef = useRef<Radar[]>([]);
  const onMapClickRef = useRef(onMapClick);
  const onCenterChangeRef = useRef(onCenterChange);
  const onZoomChangeRef = useRef(onZoomChange);
  const onSelectRadarRef = useRef(onSelectRadar);
  const lastKnownCenterRef = useRef(center);
  const lastKnownZoomRef = useRef(zoom);
  const prevSelectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);
  useEffect(() => {
    onSelectRadarRef.current = onSelectRadar;
  }, [onSelectRadar]);
  useEffect(() => {
    if (onCenterChange) onCenterChangeRef.current = onCenterChange;
  }, [onCenterChange]);
  useEffect(() => {
    if (onZoomChange) onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);
  useEffect(() => {
    radarsRef.current = radars;
  }, [radars]);

  // Init map + source + layer
  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center,
      zoom,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: radarsToGeoJSON(radarsRef.current),
          promoteId: "id",
          cluster: true,
          clusterRadius: 50,
          clusterMaxZoom: 14,
        });

        // Carregar ícones (radar, radarFixo, radarMovel, radarSemaforico)
        const base = window.location.origin;
        Promise.all(
          ICON_NAMES.map(
            (name) =>
              new Promise<void>((resolve, reject) => {
                map.loadImage(`${base}/icons/${name}.png`, (err, img) => {
                  if (err) reject(err);
                  else if (img) {
                    map.addImage(name, img);
                    resolve();
                  } else reject(new Error(`Failed to load ${name}.png`));
                });
              })
          )
        ).then(() => {
          // Camada de clusters (círculos)
          map.addLayer({
            id: CLUSTER_LAYER_ID,
            type: "circle",
            source: SOURCE_ID,
            filter: ["has", "point_count"],
            paint: {
              "circle-color": [
                "step",
                ["get", "point_count"],
                "#fbbf24",
                10,
                "#b45309",
                50,
                "#1e3a8a",
              ],
              "circle-radius": [
                "step",
                ["get", "point_count"],
                20,
                10,
                28,
                50,
                36,
              ],
              "circle-stroke-width": 2,
              "circle-stroke-color": "#fff",
            },
          });
          // Contagem no cluster
          map.addLayer({
            id: CLUSTER_COUNT_LAYER_ID,
            type: "symbol",
            source: SOURCE_ID,
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
              "text-size": 12,
            },
            paint: { "text-color": "#fff" },
          });
          // Marcadores individuais: ícone por tipo (radar, radarFixo, radarMovel, radarSemaforico)
          map.addLayer({
            id: LAYER_ID,
            type: "symbol",
            source: SOURCE_ID,
            filter: ["!", ["has", "point_count"]],
            layout: {
              "icon-image": ["coalesce", ["get", "icon"], "radar"],
              "icon-size": ICON_SIZE,
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
            },
            paint: {
              "icon-opacity": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                1,
                ["get", "inactive"],
                0.7,
                1,
              ],
            },
          });
        });

        map.getCanvas().style.cursor = "default";
        [LAYER_ID, CLUSTER_LAYER_ID].forEach((lid) => {
          map.on("mouseenter", lid, () => {
            map.getCanvas().style.cursor = "pointer";
          });
        });
        map.on("mouseleave", LAYER_ID, () => {
          map.getCanvas().style.cursor = "default";
        });
        map.on("mouseleave", CLUSTER_LAYER_ID, () => {
          map.getCanvas().style.cursor = "default";
        });
      }
    });

    map.on("click", (e) => {
      const clusterFeatures = map.queryRenderedFeatures(e.point, {
        layers: [CLUSTER_LAYER_ID],
      });
      if (clusterFeatures.length > 0) {
        const clusterId = clusterFeatures[0].properties?.cluster_id;
        const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource;
        if (source && typeof clusterId === "number") {
          source.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (
              !err &&
              zoom != null &&
              clusterFeatures[0].geometry?.type === "Point"
            ) {
              const coords = (
                clusterFeatures[0].geometry as GeoJSON.Point
              ).coordinates.slice() as [number, number];
              map.flyTo({ center: coords, zoom: Math.min(zoom, 16) });
            }
          });
        }
        return;
      }
      const pointFeatures = map.queryRenderedFeatures(e.point, {
        layers: [LAYER_ID],
      });
      if (pointFeatures.length > 0) {
        const fid = pointFeatures[0].id as string | undefined;
        const id = fid ?? pointFeatures[0].properties?.id;
        if (id) {
          const radar = radarsRef.current.find((r) => r.id === id);
          if (radar) {
            onSelectRadarRef.current(radar);
            return;
          }
        }
      }
      onMapClickRef.current(e.lngLat.lat, e.lngLat.lng);
    });

    const notifyTimeoutRef = {
      current: null as ReturnType<typeof setTimeout> | null,
    };
    const NOTIFY_DEBOUNCE_MS = 250;
    const updateFromMap = () => {
      const currentCenter = map.getCenter();
      const currentZoom = map.getZoom();
      const newCenter: [number, number] = [
        currentCenter.lng,
        currentCenter.lat,
      ];
      const lastCenter = lastKnownCenterRef.current;
      const lastZoom = lastKnownZoomRef.current;
      const centerDiff =
        Math.abs(currentCenter.lng - lastCenter[0]) > 0.0001 ||
        Math.abs(currentCenter.lat - lastCenter[1]) > 0.0001;
      const zoomDiff = Math.abs(currentZoom - lastZoom) > 0.01;
      if (!centerDiff && !zoomDiff) return;
      if (notifyTimeoutRef.current) clearTimeout(notifyTimeoutRef.current);
      notifyTimeoutRef.current = setTimeout(() => {
        notifyTimeoutRef.current = null;
        if (centerDiff) {
          lastKnownCenterRef.current = newCenter;
          if (onCenterChangeRef.current) onCenterChangeRef.current(newCenter);
        }
        if (zoomDiff) {
          lastKnownZoomRef.current = currentZoom;
          if (onZoomChangeRef.current) onZoomChangeRef.current(currentZoom);
        }
      }, NOTIFY_DEBOUNCE_MS);
    };
    map.on("moveend", updateFromMap);

    return () => {
      if (notifyTimeoutRef.current) clearTimeout(notifyTimeoutRef.current);
      map.off("moveend", updateFromMap);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync center/zoom from props
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    const centerChanged =
      Math.abs(currentCenter.lng - center[0]) > 0.0001 ||
      Math.abs(currentCenter.lat - center[1]) > 0.0001;
    const zoomChanged = Math.abs(currentZoom - zoom) > 0.01;
    if (centerChanged) {
      map.setCenter(center);
      lastKnownCenterRef.current = center;
    }
    if (zoomChanged) {
      map.setZoom(zoom);
      lastKnownZoomRef.current = zoom;
    }
  }, [center, zoom]);

  // Update GeoJSON source when radars change
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(SOURCE_ID) as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (source) {
      source.setData(radarsToGeoJSON(radars));
    }
  }, [radars]);

  // Update feature-state for selected radar
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(SOURCE_ID);
    if (!map || !source) return;
    const prev = prevSelectedIdRef.current;
    if (prev) {
      try {
        map.removeFeatureState({ source: SOURCE_ID, id: prev });
      } catch {
        // ignore if feature no longer exists
      }
    }
    prevSelectedIdRef.current = selectedId;
    if (selectedId) {
      try {
        map.setFeatureState(
          { source: SOURCE_ID, id: selectedId },
          { selected: true }
        );
      } catch {
        // ignore if feature not found
      }
    }
  }, [selectedId]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

export default memo(Map);

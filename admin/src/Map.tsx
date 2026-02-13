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

/** Velocidades disponíveis para placas (radar fixo). */
const PLACA_SPEEDS = [
  20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160,
];

function getClosestPlacaName(speed: number | undefined): string {
  if (speed == null || speed <= 0) return "placa60";
  const closest = PLACA_SPEEDS.reduce((a, b) =>
    Math.abs(a - speed) <= Math.abs(b - speed) ? a : b
  );
  return `placa${closest}`;
}

/** Mapeia tipo do CSV/API para ícone (usado em admin, app e navegação). */
function getRadarIconName(type: string | undefined): string {
  if (!type) return "radar";
  const t = type
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (t.includes("semaforo") || t.includes("camera") || t.includes("fotografica")) return "radarSemaforico";
  if (t.includes("movel") || t.includes("mobile")) return "radarMovel";
  if (t.includes("fixo") || t.includes("placa"))
    return "radar";
  return "radar";
}

/** Ícone no mapa: fixo usa placa por velocidade; demais usam ícone por tipo. */
function getRadarIconForMap(r: { type?: string; speedLimit?: number }): string {
  const type = r?.type;
  if (!type) return "radar";
  const t = type
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (t.includes("fixo") || t.includes("placa"))
    return getClosestPlacaName(r.speedLimit);
  return getRadarIconName(type);
}

/** Tamanhos de ícone por tipo (ajuste aqui no admin). */
const RADAR_ICON_SIZES: Record<string, number> = {
  radar: 0.05,
  radarMovel: 0.05,
  radarSemaforico: 0.055,
  // radarFixo: 0.06, // Removed as requested
  placa: 0.2,
};
function getIconSizeForIcon(iconName: string): number {
  if (iconName.startsWith("placa")) return RADAR_ICON_SIZES.placa ?? 0.06;
  return RADAR_ICON_SIZES[iconName] ?? RADAR_ICON_SIZES.radar ?? 0.05;
}

const ICON_NAMES = [
  "radar",
  // "radarFixo", // Removed
  "radarMovel",
  "radarSemaforico",
  ...PLACA_SPEEDS.map((s) => `placa${s}` as const),
] as const;
const ICON_SIZE = 0.05;

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
        icon: getRadarIconForMap(r),
        iconSize: getIconSizeForIcon(getRadarIconForMap(r)),
      },
    })),
  };
}

function Map({
  radars = [],
  selectedId = null,
  onSelectRadar = () => { },
  onMapClick = () => { },
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
              "icon-size": ["coalesce", ["get", "iconSize"], ICON_SIZE],
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
            map.flyTo({
              center: [radar.longitude, radar.latitude],
              zoom: 16,
              duration: 800,
            });
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

  // Update feature-state for selected radar + highlight circle (iluminado)
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
    // Highlight circle (radar iluminado/destacado)
    const hlSource = map.getSource("selected-radar-highlight") as mapboxgl.GeoJSONSource | undefined;
    if (selectedId) {
      const radar = radarsRef.current.find((r) => r.id === selectedId);
      if (radar) {
        const geo: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [radar.longitude, radar.latitude],
            },
            properties: {},
          }],
        };
        if (hlSource) {
          hlSource.setData(geo);
        } else {
          map.addSource("selected-radar-highlight", { type: "geojson", data: geo });
          map.addLayer({
            id: "selected-radar-highlight",
            type: "circle",
            source: "selected-radar-highlight",
            paint: {
              "circle-radius": 35,
              "circle-color": "#fbbf24",
              "circle-opacity": 0.35,
              "circle-stroke-width": 4,
              "circle-stroke-color": "#fcd34d",
              "circle-stroke-opacity": 0.9,
            },
          });
          map.addLayer({
            id: "selected-radar-highlight-ring",
            type: "circle",
            source: "selected-radar-highlight",
            paint: {
              "circle-radius": 20,
              "circle-color": "transparent",
              "circle-stroke-width": 4,
              "circle-stroke-color": "#fbbf24",
              "circle-stroke-opacity": 1,
            },
          });
        }
      }
    } else if (hlSource) {
      hlSource.setData({ type: "FeatureCollection" as const, features: [] });
    }
  }, [selectedId, radars]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

export default memo(Map);

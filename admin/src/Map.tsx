import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import type { Radar } from "./api";

const MAPBOX_TOKEN =
  import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.VITE_MapboxAccessToken;

mapboxgl.accessToken = MAPBOX_TOKEN || "";

interface MapProps {
  radars: Radar[];
  selectedId: string | null;
  onSelectRadar: (radar: Radar) => void;
  onMapClick: (lat: number, lng: number) => void;
  center: [number, number];
  zoom: number;
}

export default function Map({
  radars,
  selectedId,
  onSelectRadar,
  onMapClick,
  center,
  zoom,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  // Init map
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

    map.on("click", (e) => {
      onMapClick(e.lngLat.lat, e.lngLat.lng);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update center/zoom
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setCenter(center);
      mapRef.current.setZoom(zoom);
    }
  }, [center, zoom]);

  // Radars as markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    radars.forEach((radar) => {
      const el = document.createElement("div");
      el.className = "radar-marker";
      el.style.cssText = `
        width: 28px; height: 28px;
        background: ${selectedId === radar.id ? "#2563eb" : "#3b82f6"};
        border: 2px solid #fff;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      `;
      el.title = `Radar ${radar.id} ${radar.speedLimit ? radar.speedLimit + " km/h" : ""}`;

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([radar.longitude, radar.latitude])
        .addTo(map);

      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onSelectRadar(radar);
      });

      markersRef.current.push(marker);
    });
  }, [radars, selectedId, onSelectRadar]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

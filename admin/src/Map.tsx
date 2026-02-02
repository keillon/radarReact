import { useEffect, useRef } from "react";
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
  onCenterChange?: (center: [number, number]) => void;
  onZoomChange?: (zoom: number) => void;
}

export default function Map({
  radars = [],
  selectedId = null,
  onSelectRadar = () => {},
  onMapClick = () => {},
  center = [-46.6333, -23.5505] as [number, number],
  zoom = 10,
  onCenterChange,
  onZoomChange,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const onMapClickRef = useRef(onMapClick);
  const onCenterChangeRef = useRef(onCenterChange);
  const onZoomChangeRef = useRef(onZoomChange);
  
  // Atualizar refs quando props mudam (usar useEffect para evitar loops)
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);
  
  useEffect(() => {
    if (onCenterChange) {
      onCenterChangeRef.current = onCenterChange;
    }
  }, [onCenterChange]);
  
  useEffect(() => {
    if (onZoomChange) {
      onZoomChangeRef.current = onZoomChange;
    }
  }, [onZoomChange]);

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
      onMapClickRef.current(e.lngLat.lat, e.lngLat.lng);
    });

    // Atualizar center/zoom quando usuário move o mapa
    const updateFromMap = () => {
      const currentCenter = map.getCenter();
      const currentZoom = map.getZoom();
      if (onCenterChangeRef.current) {
        onCenterChangeRef.current([currentCenter.lng, currentCenter.lat]);
      }
      if (onZoomChangeRef.current) {
        onZoomChangeRef.current(currentZoom);
      }
    };

    map.on("moveend", updateFromMap);
    map.on("zoomend", updateFromMap);

    return () => {
      map.off("moveend", updateFromMap);
      map.off("zoomend", updateFromMap);
      // Limpar todos os markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current.clear();
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

  // Radars as markers - otimizado para não recriar tudo
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const newRadarIds = new Set(radars.map(r => r.id));
    
    // Remover markers que não existem mais
    markersRef.current.forEach((marker, radarId) => {
      if (!newRadarIds.has(radarId)) {
        marker.remove();
        markersRef.current.delete(radarId);
      }
    });

    // Adicionar/atualizar markers
    radars.forEach((radar) => {
      const isInactive = radar.situacao === "Inativo" || radar.situacao === "inativo";
      const isSelected = selectedId === radar.id;
      
      const existingMarker = markersRef.current.get(radar.id);
      
      if (existingMarker) {
        // Atualizar marker existente
        const existingEl = existingMarker.getElement();
        
        // Atualizar posição se mudou
        const currentLngLat = existingMarker.getLngLat();
        if (Math.abs(currentLngLat.lng - radar.longitude) > 0.0001 || 
            Math.abs(currentLngLat.lat - radar.latitude) > 0.0001) {
          existingMarker.setLngLat([radar.longitude, radar.latitude]);
        }
        
        // Atualizar estilo se seleção mudou
        const shouldBeBlue = isSelected ? "#2563eb" : "#3b82f6";
        const currentBg = isInactive ? "#9ca3af" : shouldBeBlue;
        if (existingEl.style.background !== currentBg) {
          existingEl.style.background = currentBg;
        }
        
        // Atualizar título
        existingEl.title = `Radar ${radar.id} ${radar.speedLimit ? radar.speedLimit + " km/h" : ""}${isInactive ? " (Inativo)" : ""}`;
      } else {
        // Criar novo marker
        const el = document.createElement("div");
        el.className = "radar-marker";
        el.style.cssText = `
          width: 28px; height: 28px;
          background: ${isInactive ? "#9ca3af" : isSelected ? "#2563eb" : "#3b82f6"};
          border: 2px solid #fff;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          opacity: ${isInactive ? 0.8 : 1};
          transition: background 0.2s;
        `;
        el.title = `Radar ${radar.id} ${radar.speedLimit ? radar.speedLimit + " km/h" : ""}${isInactive ? " (Inativo)" : ""}`;

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([radar.longitude, radar.latitude])
          .addTo(map);

        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onSelectRadar(radar);
        });

        markersRef.current.set(radar.id, marker);
      }
    });
  }, [radars, selectedId, onSelectRadar]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

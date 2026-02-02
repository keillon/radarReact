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
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

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

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update center/zoom com debounce para evitar muitas atualizações
  useEffect(() => {
    if (!mapRef.current) return;
    
    const timeoutId = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.setCenter(center);
        mapRef.current.setZoom(zoom);
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [center, zoom]);

  // Atualizar center/zoom quando o mapa é movido
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateCenterZoom = () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      // Notificar componente pai sobre mudanças (se necessário)
      // Por enquanto, apenas atualizar localmente
    };

    map.on("moveend", updateCenterZoom);
    map.on("zoomend", updateCenterZoom);

    return () => {
      map.off("moveend", updateCenterZoom);
      map.off("zoomend", updateCenterZoom);
    };
  }, []);

  // Radars as markers - otimizado para não recriar tudo
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Criar mapa de IDs para comparar
    const existingIds = new Set(markersRef.current.map((_, idx) => {
      // Tentar obter ID do marker se possível, senão usar índice
      return idx < radars.length ? radars[idx].id : null;
    }).filter(Boolean));

    const newRadarIds = new Set(radars.map(r => r.id));
    
    // Remover markers que não existem mais
    const toRemove: number[] = [];
    markersRef.current.forEach((marker, idx) => {
      if (idx < radars.length) {
        const radarId = radars[idx].id;
        if (!newRadarIds.has(radarId)) {
          toRemove.push(idx);
        }
      } else {
        toRemove.push(idx);
      }
    });
    
    // Remover em ordem reversa para manter índices corretos
    toRemove.reverse().forEach(idx => {
      markersRef.current[idx].remove();
      markersRef.current.splice(idx, 1);
    });

    // Adicionar/atualizar markers
    radars.forEach((radar, idx) => {
      const isInactive = radar.situacao === "Inativo" || radar.situacao === "inativo";
      const isSelected = selectedId === radar.id;
      
      // Se já existe marker nessa posição, atualizar
      if (idx < markersRef.current.length) {
        const existingMarker = markersRef.current[idx];
        const existingEl = existingMarker.getElement();
        
        // Atualizar posição se mudou
        const currentLngLat = existingMarker.getLngLat();
        if (currentLngLat.lng !== radar.longitude || currentLngLat.lat !== radar.latitude) {
          existingMarker.setLngLat([radar.longitude, radar.latitude]);
        }
        
        // Atualizar estilo se seleção mudou
        const shouldBeBlue = isSelected ? "#2563eb" : "#3b82f6";
        const currentBg = isInactive ? "#9ca3af" : shouldBeBlue;
        if (existingEl.style.background !== currentBg) {
          existingEl.style.background = currentBg;
        }
        
        return;
      }
      
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

      markersRef.current.push(marker);
    });
  }, [radars, selectedId, onSelectRadar]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

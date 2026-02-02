import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
// Import local assets for icons (organized under assets/images)
import radarSemaforico from "../../assets/images/radarSemaforico.png";
import radarMovel from "../../assets/images/radarMovel.png";
import radarFixo from "../../assets/images/radarFixo.png";
import radarIcon from "../../assets/images/radar.png";
import type { Radar } from "./api";

const MAPBOX_TOKEN =
  import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.VITE_MapboxAccessToken;

mapboxgl.accessToken = MAPBOX_TOKEN || "";

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

export default function Map(props: MapProps = {}) {
  const {
    radars = [],
    selectedId = null,
    onSelectRadar = () => {},
    onMapClick = () => {},
    center = [-46.6333, -23.5505] as [number, number],
    zoom = 10,
    onCenterChange,
    onZoomChange,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  // Usar Record ao invés de Map para evitar conflito de nomes
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const onMapClickRef = useRef(onMapClick);
  const onCenterChangeRef = useRef(onCenterChange);
  const onZoomChangeRef = useRef(onZoomChange);
  const onSelectRadarRef = useRef(onSelectRadar);
  const isUpdatingProgrammaticallyRef = useRef(false);
  
  // Atualizar refs quando props mudam (usar useEffect para evitar loops)
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);
  
  useEffect(() => {
    onCenterChangeRef.current = onCenterChange;
  }, [onCenterChange]);
  
  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);
  
  useEffect(() => {
    onSelectRadarRef.current = onSelectRadar;
  }, [onSelectRadar]);

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

    // Atualizar center/zoom quando usuário move o mapa (não durante atualizações programáticas)
    const updateFromMap = () => {
      // Ignorar se estamos atualizando programaticamente
      if (isUpdatingProgrammaticallyRef.current) {
        return;
      }
      
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
      Object.values(markersRef.current).forEach((marker: mapboxgl.Marker) => marker.remove());
      markersRef.current = {};
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update center/zoom (evitar atualizar se já está no valor correto para evitar loops)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    
    // Só atualizar se realmente mudou (evitar loops infinitos)
    const centerChanged = 
      Math.abs(currentCenter.lng - center[0]) > 0.0001 || 
      Math.abs(currentCenter.lat - center[1]) > 0.0001;
    const zoomChanged = Math.abs(currentZoom - zoom) > 0.01;
    
    if (centerChanged || zoomChanged) {
      isUpdatingProgrammaticallyRef.current = true;
      
      if (centerChanged) {
        map.setCenter(center);
      }
      if (zoomChanged) {
        map.setZoom(zoom);
      }
      
      // Resetar flag após um pequeno delay para permitir que os eventos sejam processados
      setTimeout(() => {
        isUpdatingProgrammaticallyRef.current = false;
      }, 100);
    }
  }, [center, zoom]);

  // Helpers: mapear radar para ícone direto, substituindo placas
  const getRadarIconFor = (radar: any) => {
    const t = String((radar?.type || radar?.tipoRadar || "").toLowerCase());
    if (t.includes("semafor")) return radarSemaforico;
    if (t.includes("movel") || t.includes("mov")) return radarMovel;
    if (t.includes("fixo")) return radarFixo;
    return radarIcon;
  };

  // Radars as markers - otimizado para não recriar tudo
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const newRadarIds = new Set(radars.map(r => r.id));
    
    // Remover markers que não existem mais
    Object.keys(markersRef.current).forEach((radarId) => {
      if (!newRadarIds.has(radarId)) {
        markersRef.current[radarId].remove();
        delete markersRef.current[radarId];
      }
    });

    // Adicionar/atualizar markers
    radars.forEach((radar) => {
      const isInactive = radar.situacao === "Inativo" || radar.situacao === "inativo";
      const isSelected = selectedId === radar.id;
      
      // Determinar ícone baseado no tipo (via helper)
      
      const existingMarker = markersRef.current[radar.id];
      
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
        // Criar novo marker com imagem baseada no tipo
        const el = document.createElement("div");
        el.className = "radar-marker";
        
        // Ícone único baseado no tipo de radar (sem placas)
        const iconSrc = getRadarIconFor(radar);
        const iconEl = document.createElement("img");
        iconEl.src = iconSrc;
        const iconSize = 6; // aproximadamente 0.2 de 32px
        iconEl.style.width = `${iconSize}px`;
        iconEl.style.height = `${iconSize}px`;
        iconEl.style.objectFit = "contain";
        iconEl.style.cursor = "pointer";
        iconEl.style.filter = isInactive ? "grayscale(100%) opacity(0.8)" : "none";
        iconEl.style.transition = "filter 0.2s";
        el.appendChild(iconEl);
        el.style.width = `${iconSize}px`;
        el.style.height = `${iconSize}px`;
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        
        el.title = `Radar ${radar.id} ${radar.speedLimit ? radar.speedLimit + " km/h" : ""}${isInactive ? " (Inativo)" : ""}`;

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([radar.longitude, radar.latitude])
          .addTo(map);

        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onSelectRadarRef.current(radar);
        });

        markersRef.current[radar.id] = marker;
      }
    });
  }, [radars, selectedId]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

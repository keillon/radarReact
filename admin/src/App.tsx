import { useCallback, useEffect, useRef, useState } from "react";
import Map from "./Map";
import {
  Radar,
  deleteRadar,
  getRadarsNearLocation,
  reportRadar,
  updateRadar,
} from "./api";

const DEFAULT_CENTER: [number, number] = [-46.6333, -23.5505]; // [lng, lat] São Paulo

function formatTimeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (min < 1) return "Agora mesmo";
  if (min < 60) return `Há ${min} min`;
  if (h < 24) return `Há ${h}h`;
  if (d < 7) return `Há ${d} dia${d > 1 ? "s" : ""}`;
  return new Date(ms).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function App() {
  const [radars, setRadars] = useState<Radar[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Radar | null>(null);
  const [mode, setMode] = useState<"view" | "add" | "move">("view");
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(10);
  const [saving, setSaving] = useState(false);
  const [speedLimit, setSpeedLimit] = useState("");
  const [pendingAdd, setPendingAdd] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [radarType, setRadarType] = useState<
    "reportado" | "fixo" | "móvel" | "semaforo"
  >("reportado");
  const [error, setError] = useState<string | null>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const RADAR_TYPES = [
    { value: "reportado" as const, label: "Reportado" },
    { value: "fixo" as const, label: "Radar Fixo" },
    { value: "móvel" as const, label: "Radar Móvel" },
    { value: "semaforo" as const, label: "Semáforo c/ Radar" },
  ];

  // Admin: carregar TODOS os radares (sem limitar por zoom/raio da viewport)
  const ADMIN_GLOBAL_RADIUS = 5_000_000; // ~5000km (fallback para backends que ainda filtram por raio)

  const loadRadars = useCallback(
    async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await getRadarsNearLocation(
          DEFAULT_CENTER[1],
          DEFAULT_CENTER[0],
          ADMIN_GLOBAL_RADIUS
        );
        setRadars(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao carregar radares");
        setRadars([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Carregar todos os radares uma única vez ao abrir
  useEffect(() => {
    loadRadars();
    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, [loadRadars]);

  // WebSocket Connection for Real-time Updates
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    const API_URL = import.meta.env.VITE_API_URL || "http://72.60.247.18:3000";
    const WS_URL = API_URL.replace("http://", "ws://").replace("https://", "wss://") + "/ws";

    const connect = () => {
      try {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
          return;
        }

        console.log(`🔌 Admin: Conectando ao WebSocket: ${WS_URL}`);
        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
          console.log("✅ Admin: WebSocket conectado!");
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            if (message.event === "radar:new") {
              const newRadar = message.data;
              if (newRadar && newRadar.id) {
                console.log("📩 Admin: Novo radar recebido via WS:", newRadar.id);
                setRadars((prev) => {
                  if (prev.find((r) => r.id === newRadar.id)) return prev;
                  return [...prev, newRadar];
                });
              }
            } else if (message.event === "radar:update") {
              const updatedRadar = message.data;
              if (updatedRadar && updatedRadar.id) {
                console.log("📩 Admin: Radar atualizado via WS:", updatedRadar.id);
                setRadars((prev) =>
                  prev.map((r) => r.id === updatedRadar.id ? { ...r, ...updatedRadar } : r)
                );
                // Atualizar seleção se for o radar atual
                setSelected((prev) =>
                  prev && prev.id === updatedRadar.id ? { ...prev, ...updatedRadar } : prev
                );
              }
            } else if (message.event === "radar:delete") {
              const { id } = message.data;
              if (id) {
                console.log("📩 Admin: Radar deletado via WS:", id);
                setRadars((prev) => prev.filter((r) => r.id !== id));
                setSelected((prev) => (prev && prev.id === id ? null : prev));
              }
            } else if (message.event === "radar:refresh") {
              loadRadars();
            }
          } catch (error) {
            console.error("❌ Admin: Erro ao processar mensagem do WebSocket:", error);
          }
        };

        ws.onerror = () => {
          console.log("❌ Admin: Erro no WebSocket");
        };

        ws.onclose = () => {
          console.log("❌ Admin: WebSocket desconectado. Tentando reconectar em 5s...");
          ws = null;
          reconnectTimeout = setTimeout(connect, 5000);
        };
      } catch (err) {
        console.error("Admin: Erro ao iniciar WebSocket:", err);
        reconnectTimeout = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      if (ws) {
        ws.close();
        ws = null;
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [loadRadars]);

  const handleSelectRadar = useCallback((radar: Radar) => {
    setSelected(radar);
    setSpeedLimit(radar.speedLimit != null ? String(radar.speedLimit) : "");
    setMode("view");
    setPendingAdd(null);
  }, []);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (mode === "add") {
        setPendingAdd({ lat, lng });
        setSpeedLimit("");
        setRadarType("reportado");
        setSelected(null);
        return;
      }
      if (mode === "move" && selected) {
        setSaving(true);
        updateRadar(selected.id, { latitude: lat, longitude: lng })
          .then((updated) => {
            if (updated) {
              setRadars((prev) =>
                prev.map((r) => (r.id === selected.id ? { ...r, ...updated } : r))
              );
              setSelected({ ...selected, ...updated });
              setMode("view");
            } else {
              setError("Servidor não suporta edição (PATCH /radars/:id)");
            }
          })
          .finally(() => setSaving(false));
        return;
      }
    },
    [mode, selected]
  );

  const handleSaveNewRadar = async () => {
    if (!pendingAdd) return;
    setSaving(true);
    setError(null);
    try {
      const radar = await reportRadar({
        latitude: pendingAdd.lat,
        longitude: pendingAdd.lng,
        speedLimit: speedLimit ? parseInt(speedLimit, 10) : undefined,
        type: radarType,
      });
      setRadars((prev) => [...prev, radar]);
      setPendingAdd(null);
      setSpeedLimit("");
      setRadarType("reportado");
      setMode("view");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao adicionar radar");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSpeedLimit = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const limit = speedLimit ? parseInt(speedLimit, 10) : undefined;
    const updated = await updateRadar(selected.id, { speedLimit: limit });
    setSaving(false);
    if (updated) {
      setRadars((prev) =>
        prev.map((r) => (r.id === selected.id ? { ...r, ...updated } : r))
      );
      setSelected({ ...selected, ...updated });
    } else {
      setError("Servidor não suporta edição (PATCH /radars/:id)");
    }
  };

  const handleMove = () => {
    setMode("move");
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm(`Deletar radar ${selected.id}?`)) return;
    setSaving(true);
    const ok = await deleteRadar(selected.id);
    setSaving(false);
    if (ok) {
      setRadars((prev) => prev.filter((r) => r.id !== selected.id));
      setSelected(null);
      setMode("view");
    } else {
      setError("Servidor não suporta exclusão (DELETE /radars/:id)");
    }
  };

  const handleInactivate = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const updated = await updateRadar(selected.id, { situacao: "Inativo" });
    setSaving(false);
    if (updated) {
      setRadars((prev) =>
        prev.map((r) =>
          r.id === selected.id ? { ...r, ...updated, situacao: "Inativo" } : r
        )
      );
      setSelected({ ...selected, ...updated, situacao: "Inativo" });
      setMode("view");
    } else {
      setError("Servidor não suporta inativar (PATCH situacao)");
    }
  };

  const handleActivate = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const updated = await updateRadar(selected.id, { situacao: "Ativo" });
    setSaving(false);
    if (updated) {
      setRadars((prev) =>
        prev.map((r) =>
          r.id === selected.id ? { ...r, ...updated, situacao: "Ativo" } : r
        )
      );
      setSelected({ ...selected, ...updated, situacao: "Ativo" });
      setMode("view");
    } else {
      setError("Servidor não suporta ativar (PATCH situacao)");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
        style={{
          padding: "12px 20px",
          background: "#1f2937",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>
          Admin Radares — Radar React
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setMode("add")}
            style={{
              padding: "8px 16px",
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            + Adicionar radar
          </button>
          <button
            type="button"
            onClick={() => {
              loadRadars();
            }}
            disabled={loading}
            style={{
              padding: "8px 16px",
              background: "#374151",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Carregando…" : "Recarregar"}
          </button>
        </div>
      </header>

      {/* Banner quando em modo adicionar ou mover */}
      {mode === "add" && (
        <div
          style={{
            background: "#3b82f6",
            color: "#fff",
            padding: "12px 20px",
            textAlign: "center",
            fontWeight: 600,
            fontSize: 15,
          }}
        >
          Clique em um ponto do mapa para posicionar o novo radar
        </div>
      )}
      {mode === "move" && selected && (
        <div
          style={{
            background: "#3b82f6",
            color: "#fff",
            padding: "12px 20px",
            textAlign: "center",
            fontWeight: 600,
            fontSize: 15,
          }}
        >
          Clique no mapa na nova posição do radar
        </div>
      )}

      {/* Modal: Reportar radar (velocidade + tipo) */}
      {pendingAdd && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => {
            setPendingAdd(null);
            setMode("view");
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 400,
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: 18 }}>Reportar radar</h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#6b7280" }}>
              {pendingAdd.lat.toFixed(5)}, {pendingAdd.lng.toFixed(5)}
            </p>
            <label
              style={{
                display: "block",
                marginBottom: 4,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Velocidade (km/h) — opcional
            </label>
            <input
              type="number"
              placeholder="Ex: 60"
              value={speedLimit}
              onChange={(e) => setSpeedLimit(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                marginBottom: 12,
                boxSizing: "border-box",
              }}
            />
            <label
              style={{
                display: "block",
                marginBottom: 4,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Tipo de radar
            </label>
            <select
              value={radarType}
              onChange={(e) =>
                setRadarType(
                  e.target.value as "reportado" | "fixo" | "móvel" | "semaforo"
                )
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                marginBottom: 20,
                boxSizing: "border-box",
                background: "#fff",
              }}
            >
              {RADAR_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setPendingAdd(null);
                  setMode("view");
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  background: "#e5e7eb",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveNewRadar}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: 12,
                  background: "#3b82f6",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  cursor: saving ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal radar no topo (radar destacado no mapa, sem vignette) */}
      {selected && !pendingAdd && (
        <div
          style={{
            position: "fixed",
            top: 16,
            left: 16,
            right: 16,
            maxWidth: 420,
            background: "#fff",
            borderRadius: 12,
            padding: 16,
            boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            zIndex: 1001,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600 }}>
                {selected.type || "Radar"}
                {selected.speedLimit != null && ` • ${selected.speedLimit} km/h`}
              </h3>
              {selected.situacao === "Inativo" || selected.situacao === "inativo" ? (
                <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600 }}>Inativo</span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              style={{
                padding: "8px 12px",
                background: "#e5e7eb",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Fechar
            </button>
          </div>
          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {selected.rodovia || selected.municipio ? (
              <p style={{ margin: 0, fontSize: 14, color: "#374151" }}>
                📍 {selected.rodovia || `${selected.municipio}${selected.uf ? ` - ${selected.uf}` : ""}`}
              </p>
            ) : null}
            <p style={{ margin: 0, fontSize: 14, color: "#374151" }}>
              👤 {selected.source === "user" ? "Reportado pela comunidade" : selected.source ? `Fonte: ${selected.source}` : "Dados oficiais"}
            </p>
            {selected.createdAt && (
              <p style={{ margin: 0, fontSize: 14, color: "#374151" }}>
                🕐 {formatTimeAgo(new Date(selected.createdAt).getTime())}
              </p>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, position: "relative" }}>
          {!import.meta.env.VITE_MAPBOX_TOKEN &&
            !import.meta.env.VITE_MapboxAccessToken && (
              <div
                style={{
                  position: "absolute",
                  top: 16,
                  left: 16,
                  right: 16,
                  padding: 12,
                  background: "#fef3c7",
                  borderRadius: 8,
                  zIndex: 10,
                }}
              >
                Defina VITE_MAPBOX_TOKEN no .env para ver o mapa.
              </div>
            )}
          <Map
            radars={radars}
            selectedId={selected?.id ?? null}
            onSelectRadar={handleSelectRadar}
            onMapClick={handleMapClick}
            center={center}
            zoom={zoom}
            onCenterChange={setCenter}
            onZoomChange={setZoom}
          />
        </div>

        <aside
          style={{
            width: 320,
            flexShrink: 0,
            background: "#fff",
            borderLeft: "1px solid #e5e7eb",
            padding: 16,
            overflowY: "auto",
          }}
        >
          {error && (
            <div
              style={{
                padding: 10,
                background: "#fee2e2",
                color: "#991b1b",
                borderRadius: 8,
                marginBottom: 12,
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}

          {mode === "add" && !pendingAdd && (
            <p
              style={{
                color: "#1e40af",
                fontSize: 14,
                margin: "0 0 12px",
                fontWeight: 600,
              }}
            >
              → Clique em qualquer lugar do mapa (área sem radar) para
              posicionar o novo radar.
            </p>
          )}
          {mode === "move" && selected && (
            <p
              style={{
                color: "#1e40af",
                fontSize: 14,
                margin: "0 0 12px",
                fontWeight: 600,
              }}
            >
              → Clique no mapa na nova posição do radar.
            </p>
          )}

          {pendingAdd && (
            <p style={{ color: "#6b7280", fontSize: 13 }}>
              Coordenadas: {pendingAdd.lat.toFixed(5)},{" "}
              {pendingAdd.lng.toFixed(5)} — preencha no modal e salve.
            </p>
          )}

          {selected && !pendingAdd && (
            <div>
              <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>
                Radar selecionado
              </h3>
              {(selected.situacao === "Inativo" ||
                selected.situacao === "inativo") && (
                  <p
                    style={{
                      margin: "0 0 8px",
                      fontSize: 12,
                      color: "#6b7280",
                      fontWeight: 600,
                    }}
                  >
                    Inativo
                  </p>
                )}
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "#6b7280" }}>
                {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
                {selected.speedLimit != null &&
                  ` • ${selected.speedLimit} km/h`}
              </p>
              <input
                type="number"
                placeholder="Limite (km/h)"
                value={speedLimit}
                onChange={(e) => setSpeedLimit(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  marginBottom: 8,
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleSaveSpeedLimit}
                  disabled={saving}
                  style={{
                    padding: 10,
                    background: "#3b82f6",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: saving ? "not-allowed" : "pointer",
                    fontWeight: 600,
                  }}
                >
                  {saving ? "Salvando…" : "Salvar limite"}
                </button>
                <button
                  type="button"
                  onClick={handleMove}
                  style={{
                    padding: 10,
                    background: "#e5e7eb",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  Mover
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  style={{
                    padding: 10,
                    background: "#ef4444",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: saving ? "not-allowed" : "pointer",
                    fontWeight: 600,
                  }}
                >
                  Deletar
                </button>
                <button
                  type="button"
                  onClick={handleInactivate}
                  disabled={saving}
                  style={{
                    padding: 10,
                    background: "#e5e7eb",
                    border: "none",
                    borderRadius: 8,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  Inativar
                </button>
                {(selected.situacao === "Inativo" ||
                  selected.situacao === "inativo") && (
                    <button
                      type="button"
                      onClick={handleActivate}
                      disabled={saving}
                      style={{
                        padding: 10,
                        background: "#10b981",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        cursor: saving ? "not-allowed" : "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Ativar
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  style={{
                    padding: 10,
                    background: "#f3f4f6",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>
          )}

          <p style={{ marginTop: 16, fontSize: 13, color: "#9ca3af" }}>
            {radars.length} radar(es) carregados (base completa).
          </p>
          <p
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "#9ca3af",
              wordBreak: "break-all",
            }}
          >
            API: {import.meta.env.VITE_API_URL || "http://72.60.247.18:3000"}
          </p>
        </aside>
      </div>
    </div>
  );
}

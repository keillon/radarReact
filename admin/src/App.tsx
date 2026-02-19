import { useCallback, useEffect, useRef, useState } from "react";
import MapView from "./Map";
import {
  Radar,
  adminLogout,
  createAdminUser,
  deleteAdminUser,
  deleteRadar,
  getAdminConfig,
  getAdminMe,
  getAdminUsers,
  getCsvStatus,
  getRadarsNearLocation,
  normalizeRadarPayload,
  patchAdminMe,
  reportRadar,
  updateAdminUser,
  updateRadar,
  uploadCsv,
} from "./api";
import type { AdminUser } from "./api";

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
    "placa" | "móvel" | "semaforo"
  >("placa");
  const [error, setError] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<"map" | "csv" | "users">("map");
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileCurrentPassword, setProfileCurrentPassword] = useState("");
  const [profileNewPassword, setProfileNewPassword] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [usersList, setUsersList] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userModalMode, setUserModalMode] = useState<"create" | "edit" | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [userFormEmail, setUserFormEmail] = useState("");
  const [userFormName, setUserFormName] = useState("");
  const [userFormRole, setUserFormRole] = useState<"user" | "admin">("user");
  const [userFormPassword, setUserFormPassword] = useState("");
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const [userFormSaving, setUserFormSaving] = useState(false);
  const [csvStatus, setCsvStatus] = useState<string>("Carregando…");
  const [csvMessage, setCsvMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [runtimeMapboxToken, setRuntimeMapboxToken] = useState<string>("");
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveMapboxToken =
    import.meta.env.VITE_MAPBOX_TOKEN ||
    import.meta.env.VITE_MapboxAccessToken ||
    runtimeMapboxToken ||
    "";

  const RADAR_TYPES = [
    { value: "placa" as const, label: "Placa de Velocidade", icon: "placa60" },
    { value: "móvel" as const, label: "Radar Móvel", icon: "radarMovel" },
    { value: "semaforo" as const, label: "Semáforo c/ Radar", icon: "radarSemaforico" },
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

  // Token Mapbox em runtime (admin embutido no backend sem .env no build)
  useEffect(() => {
    if (effectiveMapboxToken) return;
    getAdminConfig()
      .then((c) => c.mapboxToken && setRuntimeMapboxToken(c.mapboxToken))
      .catch(() => {});
  }, [effectiveMapboxToken]);

  // Perfil do admin logado
  useEffect(() => {
    getAdminMe()
      .then(setAdminUser)
      .catch(() => setAdminUser(null));
  }, []);

  // Listar usuários ao abrir aba Usuários
  useEffect(() => {
    if (adminTab !== "users") return;
    setUsersLoading(true);
    getAdminUsers()
      .then(setUsersList)
      .catch(() => setUsersList([]))
      .finally(() => setUsersLoading(false));
  }, [adminTab]);

  const loadCsvStatus = useCallback(async () => {
    setCsvStatus("Carregando…");
    try {
      const data = await getCsvStatus();
      if (!data.success || !data.status) {
        setCsvStatus("Erro ao carregar status.");
        return;
      }
      const s = data.status;
      const state = s.state ?? null;
      const info = s.csvInfo ?? {};
      setCsvStatus(
        `CSV atual: ${info.exists ? "sim" : "não"}\n` +
          `Tamanho: ${info.size ?? 0} bytes\n` +
          `Modificado: ${info.mtimeMs ? new Date(info.mtimeMs).toLocaleString("pt-BR") : "-"}\n\n` +
          `Último import: ${state?.importedAt ? new Date(state.importedAt).toLocaleString("pt-BR") : "nunca"}\n` +
          `Arquivo: ${state?.fileName ?? "-"}\n` +
          `Rows: ${state?.totalRows ?? 0}\n` +
          `Criados: ${state?.created ?? 0} | Atualizados: ${state?.updated ?? 0} | Inativados: ${state?.deactivated ?? 0}`
      );
    } catch {
      setCsvStatus("Erro ao carregar status CSV.");
    }
  }, []);

  useEffect(() => {
    if (adminTab === "csv") loadCsvStatus();
  }, [adminTab, loadCsvStatus]);

  // WebSocket Connection for Real-time Updates
  // Dedupe: evita processar radar:update duplicado (React StrictMode ou múltiplas conexões)
  const pendingWsUpdates = useRef<Map<string, { u: any; at: number }>>(new Map());
  const wsFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    const API_URL = import.meta.env.VITE_API_URL || "http://72.60.247.18:3000";
    const WS_URL = API_URL.replace("http://", "ws://").replace("https://", "wss://") + "/ws";

    const applyPendingUpdates = () => {
      if (pendingWsUpdates.current.size === 0) return;
      const toApply = new Map(pendingWsUpdates.current);
      pendingWsUpdates.current.clear();
      const updatesById = Object.fromEntries(
        Array.from(toApply.entries()).map(([id, { u }]) => [id, u])
      );
      setRadars((prev) =>
        prev.map((r) => {
          const u = updatesById[r.id];
          if (!u) return r;
          return {
            ...r,
            ...u,
            type: u.type && u.type !== "unknown" ? u.type : r.type,
            speedLimit: u.speedLimit ?? r.speedLimit,
          };
        })
      );
      setSelected((prev) => {
        if (!prev) return prev;
        const u = updatesById[prev.id];
        if (!u) return prev;
        return {
          ...prev,
          ...u,
          type: u.type && u.type !== "unknown" ? u.type : prev.type,
          speedLimit: u.speedLimit ?? prev.speedLimit,
        };
      });
    };

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
              const normalized = normalizeRadarPayload(message.data);
              if (normalized) {
                console.log("📩 Admin: Novo radar recebido via WS:", normalized.id);
                setRadars((prev) => {
                  const existing = prev.find((r) => r.id === normalized.id);
                  if (existing) return prev.map((r) => (r.id === normalized.id ? normalized : r));
                  return [...prev, normalized];
                });
              }
            } else if (message.event === "radar:update") {
              const raw = message.data;
              if (!raw?.id) return;
              const u = {
                id: raw.id,
                latitude: raw.latitude ?? raw.lat,
                longitude: raw.longitude ?? raw.lng,
                speedLimit: raw.velocidadeLeve ?? raw.speedLimit,
                type: raw.tipoRadar ?? raw.type,
                situacao: raw.situacao,
                source: raw.source,
                rodovia: raw.rodovia,
                municipio: raw.municipio,
                uf: raw.uf,
                createdAt: raw.createdAt,
              };
              // Dedupe: múltiplos updates para mesmo id em curto intervalo → aplicar só o último
              pendingWsUpdates.current.set(u.id, { u, at: Date.now() });
              if (wsFlushTimer.current) clearTimeout(wsFlushTimer.current);
              wsFlushTimer.current = setTimeout(() => {
                wsFlushTimer.current = null;
                applyPendingUpdates();
              }, 80);
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
      if (wsFlushTimer.current) {
        clearTimeout(wsFlushTimer.current);
        wsFlushTimer.current = null;
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
        setSpeedLimit(radarType === "placa" ? "60" : "");
        setRadarType("placa");
        setSelected(null);
        return;
      }
      if (mode === "move" && selected) {
        setSaving(true);
        updateRadar(selected.id, { latitude: lat, longitude: lng })
          .then((updated) => {
            if (updated) {
              const merged = {
                ...selected,
                latitude: updated.latitude,
                longitude: updated.longitude,
                speedLimit: updated.speedLimit ?? selected.speedLimit,
                type: (updated.type && updated.type !== "unknown") ? updated.type : selected.type,
                situacao: updated.situacao ?? selected.situacao,
              };
              setRadars((prev) =>
                prev.map((r) => (r.id === selected.id ? merged : r))
              );
              setSelected(merged);
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
      const typeForApi = radarType === "placa" ? "fixo" : radarType;
      const speed = speedLimit ? parseInt(speedLimit, 10) : (radarType === "placa" ? 60 : undefined);
      const radar = await reportRadar({
        latitude: pendingAdd.lat,
        longitude: pendingAdd.lng,
        speedLimit: speed,
        type: typeForApi,
      });
      setRadars((prev) => {
        const existing = prev.find((r) => r.id === radar.id);
        if (existing) return prev.map((r) => (r.id === radar.id ? radar : r));
        return [...prev, radar];
      });
      setPendingAdd(null);
      setSpeedLimit("");
      setRadarType("placa");
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
      const merged = {
        ...selected,
        speedLimit: updated.speedLimit ?? limit ?? selected.speedLimit,
        type: (updated.type && updated.type !== "unknown") ? updated.type : selected.type,
      };
      setRadars((prev) =>
        prev.map((r) => (r.id === selected.id ? merged : r))
      );
      setSelected(merged);
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
      const merged = { ...selected, situacao: "Inativo" as const, type: (updated.type && updated.type !== "unknown") ? updated.type : selected.type };
      setRadars((prev) =>
        prev.map((r) => (r.id === selected.id ? merged : r))
      );
      setSelected(merged);
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
      const merged = { ...selected, situacao: "Ativo" as const, type: (updated.type && updated.type !== "unknown") ? updated.type : selected.type };
      setRadars((prev) =>
        prev.map((r) => (r.id === selected.id ? merged : r))
      );
      setSelected(merged);
      setMode("view");
    } else {
      setError("Servidor não suporta ativar (PATCH situacao)");
    }
  };

  const iconBase =
    typeof window !== "undefined" && window.location.pathname.startsWith("/admin")
      ? "/admin"
      : "";

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
            onClick={() => setAdminTab("map")}
            style={{
              padding: "8px 14px",
              background: adminTab === "map" ? "#4f46e5" : "transparent",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.5)",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Mapa
          </button>
          <button
            type="button"
            onClick={() => setAdminTab("csv")}
            style={{
              padding: "8px 14px",
              background: adminTab === "csv" ? "#4f46e5" : "transparent",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.5)",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            CSV
          </button>
          <button
            type="button"
            onClick={() => setAdminTab("users")}
            style={{
              padding: "8px 14px",
              background: adminTab === "users" ? "#4f46e5" : "transparent",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.5)",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Usuários
          </button>
          {adminTab === "map" && (
          <>
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
          </>
          )}
          <span style={{ width: 16 }} />
          <button
            type="button"
            onClick={() => {
              setProfileName(adminUser?.name ?? "");
              setProfileEmail(adminUser?.email ?? "");
              setProfileCurrentPassword("");
              setProfileNewPassword("");
              setProfileError(null);
              setProfileModalOpen(true);
            }}
            style={{
              padding: "8px 14px",
              background: "transparent",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.5)",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Meu perfil
          </button>
          <button
            type="button"
            onClick={async () => {
              await adminLogout();
              window.location.href = "/admin/login";
            }}
            style={{
              padding: "8px 14px",
              background: "#dc2626",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Sair
          </button>
        </div>
      </header>

      {/* Aba CSV */}
      {adminTab === "csv" && (
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: 24,
            background: "#f8fafc",
          }}
        >
          <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>📄 CSV de Radares</h2>
          <p style={{ marginBottom: 16, color: "#475569" }}>
            O backend só reprocessa quando o CSV mudar (hash diferente).
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            id="admin-csv-file"
            style={{ marginBottom: 12 }}
          />
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              disabled={csvUploading}
              onClick={async () => {
                const input = document.getElementById("admin-csv-file") as HTMLInputElement;
                const file = input?.files?.[0];
                if (!file) {
                  setCsvMessage({ text: "Selecione um arquivo CSV.", type: "error" });
                  return;
                }
                setCsvUploading(true);
                setCsvMessage(null);
                try {
                  const text = await file.text();
                  const data = await uploadCsv(file.name, text);
                  if (data.success && data.imported) {
                    setCsvMessage({
                      text: `✅ Processado. Criados: ${data.stats?.created ?? 0}, Atualizados: ${data.stats?.updated ?? 0}`,
                      type: "success",
                    });
                    loadCsvStatus();
                  } else if (data.success) {
                    const reasonMsg: Record<string, string> = {
                      unchanged_csv: "CSV idêntico ao último import. Nenhuma alteração aplicada.",
                      empty_csv: "Arquivo CSV vazio.",
                      no_valid_rows: "Nenhuma linha válida no CSV.",
                    };
                    setCsvMessage({
                      text: `ℹ️ ${reasonMsg[data.reason ?? ""] ?? data.reason ?? "Sem mudanças."}`,
                      type: "success",
                    });
                    loadCsvStatus();
                  } else {
                    setCsvMessage({ text: data.error ?? "Erro ao processar.", type: "error" });
                  }
                } catch (e) {
                  setCsvMessage({ text: e instanceof Error ? e.message : "Erro ao enviar CSV.", type: "error" });
                } finally {
                  setCsvUploading(false);
                }
              }}
              style={{
                padding: "10px 20px",
                background: "#3b82f6",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: csvUploading ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >
              {csvUploading ? "Processando…" : "Enviar CSV e processar"}
            </button>
            <button
              type="button"
              onClick={loadCsvStatus}
              style={{
                padding: "10px 20px",
                background: "#16a34a",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Atualizar status
            </button>
          </div>
          {csvMessage && (
            <div
              style={{
                padding: 12,
                marginBottom: 16,
                borderRadius: 8,
                background: csvMessage.type === "success" ? "#d4edda" : "#f8d7da",
                color: csvMessage.type === "success" ? "#155724" : "#721c24",
              }}
            >
              {csvMessage.text}
            </div>
          )}
          <pre
            style={{
              margin: 0,
              padding: 16,
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              whiteSpace: "pre-wrap",
              fontSize: 13,
              color: "#475569",
            }}
          >
            {csvStatus}
          </pre>
        </div>
      )}

      {/* Aba Usuários */}
      {adminTab === "users" && (
        <div style={{ flex: 1, overflow: "auto", padding: 24, background: "#f8fafc" }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>👥 Usuários</h2>
          <button
            type="button"
            onClick={() => {
              setUserModalMode("create");
              setEditingUser(null);
              setUserFormEmail("");
              setUserFormName("");
              setUserFormRole("user");
              setUserFormPassword("");
              setUserFormError(null);
            }}
            style={{
              padding: "10px 20px",
              background: "#4f46e5",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            + Novo usuário
          </button>
          {usersLoading ? (
            <p style={{ color: "#64748b" }}>Carregando usuários…</p>
          ) : (
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9" }}>
                    <th style={{ padding: 12, textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Email</th>
                    <th style={{ padding: 12, textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Nome</th>
                    <th style={{ padding: 12, textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Role</th>
                    <th style={{ padding: 12, textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Criado em</th>
                    <th style={{ padding: 12, textAlign: "right", borderBottom: "1px solid #e2e8f0" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map((u) => (
                    <tr key={u.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: 12 }}>{u.email}</td>
                      <td style={{ padding: 12 }}>{u.name ?? "—"}</td>
                      <td style={{ padding: 12 }}>{u.role}</td>
                      <td style={{ padding: 12 }}>{new Date(u.createdAt).toLocaleString("pt-BR")}</td>
                      <td style={{ padding: 12, textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setUserModalMode("edit");
                            setEditingUser(u);
                            setUserFormEmail(u.email);
                            setUserFormName(u.name ?? "");
                            setUserFormRole((u.role === "admin" ? "admin" : "user") as "user" | "admin");
                            setUserFormPassword("");
                            setUserFormError(null);
                          }}
                          style={{
                            padding: "6px 12px",
                            marginRight: 8,
                            background: "#3b82f6",
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 13,
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm(`Excluir usuário ${u.email}?`)) return;
                            try {
                              await deleteAdminUser(u.id);
                              setUsersList((prev) => prev.filter((x) => x.id !== u.id));
                            } catch (e) {
                              alert(e instanceof Error ? e.message : "Erro ao excluir");
                            }
                          }}
                          disabled={u.id === adminUser?.id}
                          style={{
                            padding: "6px 12px",
                            background: u.id === adminUser?.id ? "#9ca3af" : "#dc2626",
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            cursor: u.id === adminUser?.id ? "not-allowed" : "pointer",
                            fontSize: 13,
                          }}
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Banner quando em modo adicionar ou mover */}
      {adminTab === "map" && mode === "add" && (
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
      {adminTab === "map" && mode === "move" && selected && (
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

      {/* Modal: Adicionar radar — com imagens e velocidades padrão (como no app) */}
      {adminTab === "map" && pendingAdd && (
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
              borderRadius: 16,
              padding: 24,
              width: "90%",
              maxWidth: 420,
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600 }}>
              Adicionar radar
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#6b7280" }}>
              📍 {pendingAdd.lat.toFixed(5)}, {pendingAdd.lng.toFixed(5)}
            </p>

            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500 }}>Tipo de radar</p>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              {RADAR_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => {
                    setRadarType(t.value);
                    if (t.value === "placa" && !speedLimit) setSpeedLimit("60");
                    else if (t.value !== "placa" && !speedLimit) setSpeedLimit("");
                  }}
                  style={{
                    flex: 1,
                    minWidth: 100,
                    padding: 12,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    border: `2px solid ${radarType === t.value ? "#3b82f6" : "#e5e7eb"}`,
                    borderRadius: 12,
                    background: radarType === t.value ? "#eff6ff" : "#f9fafb",
                    cursor: "pointer",
                  }}
                >
                  <img
                    src={`${iconBase}/icons/${t.icon}.png`}
                    alt=""
                    style={{ width: 40, height: 40, objectFit: "contain" }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{t.label}</span>
                </button>
              ))}
            </div>

            {/* Limite de velocidade: todos os tipos (placa, móvel, semafórico) */}
            <>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500 }}>
                Limite de velocidade (km/h)
                {radarType !== "placa" && " (opcional)"}
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                {[30, 40, 50, 60, 70, 80, 90, 100, 110, 120].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpeedLimit(String(s))}
                    style={{
                      padding: "10px 16px",
                      minWidth: 52,
                      background: speedLimit === String(s) ? "#3b82f6" : "#f3f4f6",
                      color: speedLimit === String(s) ? "#fff" : "#1f2937",
                      border: `2px solid ${speedLimit === String(s) ? "#3b82f6" : "#e5e7eb"}`,
                      borderRadius: 10,
                      cursor: "pointer",
                      fontSize: 16,
                      fontWeight: 600,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <input
                type="number"
                placeholder={radarType === "placa" ? "Outro (ex: 20)" : "Outro (ex: 20) — opcional"}
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
            </>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
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
                  borderRadius: 10,
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
                  borderRadius: 10,
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
      {adminTab === "map" && selected && !pendingAdd && (
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

      {adminTab === "map" && (
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, position: "relative" }}>
          {!effectiveMapboxToken && (
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
                Defina VITE_MAPBOX_TOKEN no .env (ou MAPBOX_TOKEN no backend) para ver o mapa.
              </div>
            )}
          <MapView
            mapboxToken={effectiveMapboxToken || undefined}
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
      )}

      {/* Modal: Meu perfil */}
      {profileModalOpen && (
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
          onClick={() => !profileSaving && setProfileModalOpen(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              width: "100%",
              boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: 18 }}>Meu perfil</h3>
            {profileError && (
              <p style={{ color: "#dc2626", marginBottom: 12, fontSize: 14 }}>{profileError}</p>
            )}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 14 }}>Nome</label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Nome"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 14 }}>Email</label>
              <input
                type="email"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                placeholder="email@exemplo.com"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 14 }}>Nova senha (deixe em branco para não alterar)</label>
              <input
                type="password"
                value={profileNewPassword}
                onChange={(e) => setProfileNewPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>
            {profileNewPassword.trim() && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 14 }}>Senha atual (obrigatório para alterar)</label>
                <input
                  type="password"
                  value={profileCurrentPassword}
                  onChange={(e) => setProfileCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => !profileSaving && setProfileModalOpen(false)}
                style={{
                  padding: "10px 20px",
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
                disabled={profileSaving}
                onClick={async () => {
                  setProfileError(null);
                  setProfileSaving(true);
                  try {
                    const body: { name?: string; email?: string; currentPassword?: string; newPassword?: string } = {};
                    if (profileName.trim() !== (adminUser?.name ?? "")) body.name = profileName.trim();
                    if (profileEmail.trim() !== (adminUser?.email ?? "")) body.email = profileEmail.trim();
                    if (profileNewPassword.trim()) {
                      body.currentPassword = profileCurrentPassword;
                      body.newPassword = profileNewPassword;
                    }
                    const updated = await patchAdminMe(body);
                    setAdminUser(updated);
                    setProfileModalOpen(false);
                  } catch (e) {
                    setProfileError(e instanceof Error ? e.message : "Erro ao atualizar");
                  } finally {
                    setProfileSaving(false);
                  }
                }}
                style={{
                  padding: "10px 20px",
                  background: "#4f46e5",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  cursor: profileSaving ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                {profileSaving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Criar/Editar usuário */}
      {userModalMode && (
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
          onClick={() => !userFormSaving && setUserModalMode(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              width: "100%",
              boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: 18 }}>
              {userModalMode === "create" ? "Novo usuário" : "Editar usuário"}
            </h3>
            {userFormError && (
              <p style={{ color: "#dc2626", marginBottom: 12, fontSize: 14 }}>{userFormError}</p>
            )}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 14 }}>Email</label>
              <input
                type="email"
                value={userFormEmail}
                onChange={(e) => setUserFormEmail(e.target.value)}
                placeholder="email@exemplo.com"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 14 }}>Nome</label>
              <input
                type="text"
                value={userFormName}
                onChange={(e) => setUserFormName(e.target.value)}
                placeholder="Nome"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 14 }}>Perfil</label>
              <select
                value={userFormRole}
                onChange={(e) => setUserFormRole(e.target.value as "user" | "admin")}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  boxSizing: "border-box",
                }}
              >
                <option value="user">Usuário</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 14 }}>
                {userModalMode === "create" ? "Senha (obrigatória)" : "Nova senha (deixe em branco para não alterar)"}
              </label>
              <input
                type="password"
                value={userFormPassword}
                onChange={(e) => setUserFormPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => !userFormSaving && setUserModalMode(null)}
                style={{
                  padding: "10px 20px",
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
                disabled={userFormSaving || !userFormEmail.trim() || (userModalMode === "create" && !userFormPassword.trim())}
                onClick={async () => {
                  setUserFormError(null);
                  setUserFormSaving(true);
                  try {
                    if (userModalMode === "create") {
                      const created = await createAdminUser({
                        email: userFormEmail.trim().toLowerCase(),
                        password: userFormPassword,
                        name: userFormName.trim() || undefined,
                        role: userFormRole,
                      });
                      setUsersList((prev) => [created, ...prev]);
                    } else if (editingUser) {
                      const body: { email?: string; name?: string; role?: string; newPassword?: string } = {};
                      if (userFormEmail.trim() !== editingUser.email) body.email = userFormEmail.trim().toLowerCase();
                      if (userFormName.trim() !== (editingUser.name ?? "")) body.name = userFormName.trim();
                      if (userFormRole !== editingUser.role) body.role = userFormRole;
                      if (userFormPassword.trim()) body.newPassword = userFormPassword;
                      const updated = await updateAdminUser(editingUser.id, body);
                      setUsersList((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
                    }
                    setUserModalMode(null);
                  } catch (e) {
                    setUserFormError(e instanceof Error ? e.message : "Erro");
                  } finally {
                    setUserFormSaving(false);
                  }
                }}
                style={{
                  padding: "10px 20px",
                  background: "#4f46e5",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  cursor: userFormSaving ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                {userFormSaving ? "Salvando…" : userModalMode === "create" ? "Criar" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

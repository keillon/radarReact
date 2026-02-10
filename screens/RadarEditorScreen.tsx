import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Geolocation from "react-native-geolocation-service";
import Map, { getClosestPlacaName, radarImages } from "../components/Map";
import {
  API_BASE_URL,
  Radar,
  deleteRadar,
  getRadarsNearLocation,
  reportRadar,
  updateRadar
} from "../services/api";

const DEFAULT_CENTER = { latitude: -23.5505, longitude: -46.6333 };
const LOAD_RADIUS_M = 30000;

type EditorMode = "view" | "add" | "move";

export default function RadarEditorScreen({
  onClose,
}: {
  onClose: () => void;
}) {
  const [radars, setRadars] = useState<Radar[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRadar, setSelectedRadar] = useState<Radar | null>(null);
  const [mode, setMode] = useState<EditorMode>("view");
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [saving, setSaving] = useState(false);
  const [newSpeedLimit, setNewSpeedLimit] = useState("");
  const [pendingAddCoords, setPendingAddCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [radarType, setRadarType] = useState<
    "móvel" | "semaforo" | "placa"
  >("placa");

  const RADAR_TYPES: {
    value: "móvel" | "semaforo" | "placa";
    label: string;
    icon: number;
  }[] = [
      {
        value: "móvel",
        label: "Radar Móvel",
        icon: require("../assets/images/radarMovel.png"),
      },
      {
        value: "semaforo",
        label: "Semáforo c/ Radar",
        icon: require("../assets/images/radarSemaforico.png"),
      },
      {
        value: "placa",
        label: "Placa de Velocidade",
        icon: require("../assets/images/placa60.png"),
      },
    ];

  const loadRadars = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getRadarsNearLocation(
        center.latitude,
        center.longitude,
        LOAD_RADIUS_M
      );
      setRadars(list);
    } catch (e) {
      console.error("Erro ao carregar radares:", e);
      setRadars([]);
    } finally {
      setLoading(false);
    }
  }, [center.latitude, center.longitude]);

  useEffect(() => {
    loadRadars();
  }, [loadRadars]);

  useEffect(() => {
    Geolocation.getCurrentPosition(
      (pos) => {
        setCenter({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      () => { },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  // WebSocket sync para o editor
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const connect = () => {
      try {
        const wsUrl = API_BASE_URL.replace("http://", "ws://") + "/ws";
        console.log(`🔌 Editor WebSocket: ${wsUrl}`);
        ws = new WebSocket(wsUrl);

        ws.onmessage = (e) => {
          if (!isMounted) return;
          try {
            const { event, data } = JSON.parse(e.data);
            switch (event) {
              case "radar:new":
                setRadars((prev) => {
                  if (prev.some((r) => r.id === data.id)) return prev;
                  return [data, ...prev];
                });
                break;
              case "radar:update":
                setRadars((prev) => prev.map((r) => (r.id === data.id ? { ...r, ...data } : r)));
                // No editor local, não queremos resetar o selecionado se for só update de campo,
                // mas se mudou o objeto inteiro, atualizamos.
                break;
              case "radar:delete":
                setRadars((prev) => prev.filter((r) => r.id !== data.id));
                break;
            }
          } catch (err) {
            console.error("Erro no WebSocket do Editor:", err);
          }
        };

        ws.onclose = () => {
          if (isMounted) {
            reconnectTimeout = setTimeout(connect, 5000);
          }
        };
      } catch (err) {
        console.error("Erro ao iniciar WebSocket no Editor:", err);
      }
    };

    connect();

    return () => {
      isMounted = false;
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  const handleRadarPress = (radar: Radar) => {
    if (mode === "add") return;
    setSelectedRadar(radar);
    setNewSpeedLimit(radar.speedLimit != null ? String(radar.speedLimit) : "");
    setMode("view");
    setPendingAddCoords(null);
  };

  const handleMapPress = (coords: { latitude: number; longitude: number }) => {
    if (mode === "add") {
      setPendingAddCoords(coords);
      setNewSpeedLimit("");
      setRadarType("placa");
      setSelectedRadar(null);
      return;
    }
    if (mode === "move" && selectedRadar) {
      setSaving(true);
      updateRadar(selectedRadar.id, {
        latitude: coords.latitude,
        longitude: coords.longitude,
      }).then((updated) => {
        setSaving(false);
        if (updated) {
          setRadars((prev) =>
            prev.map((r) => (r.id === selectedRadar.id ? { ...r, ...updated } : r))
          );
          setSelectedRadar({ ...selectedRadar, ...updated });
          setMode("view");
        } else {
          Alert.alert(
            "Erro",
            "Não foi possível mover o radar. O servidor pode não suportar edição."
          );
        }
      });
      return;
    }
    // Em modo view: toque no mapa vazio não desmarca (evita conflito com toque no radar)
  };

  const handleSaveNewRadar = async () => {
    if (!pendingAddCoords) return;
    setSaving(true);
    try {
      const radar = await reportRadar({
        latitude: pendingAddCoords.latitude,
        longitude: pendingAddCoords.longitude,
        speedLimit: newSpeedLimit ? parseInt(newSpeedLimit, 10) : undefined,
        type: radarType,
      });
      setRadars((prev) => [...prev, radar]);
      setPendingAddCoords(null);
      setNewSpeedLimit("");
      setRadarType("placa");
      setMode("view");
    } catch (e) {
      Alert.alert(
        "Erro",
        e instanceof Error ? e.message : "Não foi possível adicionar o radar."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSpeedLimit = async () => {
    if (!selectedRadar) return;
    const limit = newSpeedLimit ? parseInt(newSpeedLimit, 10) : undefined;
    setSaving(true);
    const updated = await updateRadar(selectedRadar.id, { speedLimit: limit });
    setSaving(false);
    if (updated) {
      setRadars((prev) =>
        prev.map((r) => (r.id === selectedRadar.id ? { ...r, ...updated } : r))
      );
      setSelectedRadar({ ...selectedRadar, ...updated });
    } else {
      Alert.alert(
        "Erro",
        "Não foi possível atualizar. O servidor pode não suportar edição."
      );
    }
  };

  const handleMove = () => {
    setMode("move");
  };

  const handleDelete = () => {
    if (!selectedRadar) return;
    Alert.alert(
      "Deletar radar",
      `Remover o radar (${selectedRadar.id})? O servidor pode não suportar exclusão.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Deletar",
          style: "destructive",
          onPress: async () => {
            setSaving(true);
            const ok = await deleteRadar(selectedRadar.id);
            setSaving(false);
            if (ok) {
              setRadars((prev) =>
                prev.filter((r) => r.id !== selectedRadar.id)
              );
              setSelectedRadar(null);
              setMode("view");
            } else {
              Alert.alert(
                "Aviso",
                "Não foi possível deletar. Tente inativar no servidor."
              );
            }
          },
        },
      ]
    );
  };

  const handleInactivate = async () => {
    if (!selectedRadar) return;
    setSaving(true);
    const updated = await updateRadar(selectedRadar.id, {
      situacao: "Inativo",
    });
    setSaving(false);
    if (updated) {
      setRadars((prev) =>
        prev.map((r) =>
          r.id === selectedRadar.id
            ? { ...r, ...updated, situacao: "Inativo" }
            : r
        )
      );
      setSelectedRadar(updated);
      setMode("view");
    }
  };

  const handleActivate = async () => {
    if (!selectedRadar) return;
    setSaving(true);
    const updated = await updateRadar(selectedRadar.id, { situacao: "Ativo" });
    setSaving(false);
    if (updated) {
      setRadars((prev) =>
        prev.map((r) =>
          r.id === selectedRadar.id
            ? { ...r, ...updated, situacao: "Ativo" }
            : r
        )
      );
      setSelectedRadar(updated);
      setMode("view");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Editor de radares</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[
              styles.headerButton,
              mode === "add" && styles.headerButtonActive,
            ]}
            onPress={() => {
              setMode("add");
              setSelectedRadar(null);
              setPendingAddCoords(null);
            }}
          >
            <Text
              style={[
                styles.headerButtonText,
                mode === "add" && styles.headerButtonTextActive,
              ]}
            >
              + Adicionar
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={loadRadars} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>Recarregar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Banner claro quando em modo adicionar */}
      {mode === "add" && (
        <View style={styles.addBanner}>
          <Text style={styles.addBannerText}>
            Toque ou segure no mapa para posicionar o novo radar
          </Text>
        </View>
      )}
      {mode === "move" && selectedRadar && (
        <View style={styles.addBanner}>
          <Text style={styles.addBannerText}>
            Toque ou segure no mapa na nova posição do radar
          </Text>
        </View>
      )}
      {mode === "view" && !selectedRadar && !pendingAddCoords && (
        <View style={styles.hintBar}>
          <Text style={styles.hintText}>
            Toque em um radar no mapa para editar ou mover • Use "+ Adicionar"
            para novo radar
          </Text>
        </View>
      )}

      <View style={styles.mapWrapper}>
        <Map
          radars={radars}
          onRadarPress={handleRadarPress}
          onMapPress={handleMapPress}
          interactive={true}
          currentLocation={center}
        />
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Carregando radares...</Text>
          </View>
        )}
      </View>

      {/* Modal: Reportar radar (velocidade + tipo) */}
      <Modal
        visible={!!pendingAddCoords}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPendingAddCoords(null);
          setNewSpeedLimit("");
          setRadarType("placa");
        }}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.modalOverlay}
          onPress={() => {
            setPendingAddCoords(null);
            setNewSpeedLimit("");
            setRadarType("placa");
          }}
        >
          <View
            style={styles.modalContent}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.panelTitle}>Reportar radar</Text>
            <Text style={styles.panelSubtitle}>
              {pendingAddCoords?.latitude.toFixed(5)},{" "}
              {pendingAddCoords?.longitude.toFixed(5)}
            </Text>
            <Text style={styles.modalLabel}>Velocidade (km/h) — opcional</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: 60"
              keyboardType="number-pad"
              value={newSpeedLimit}
              onChangeText={setNewSpeedLimit}
            />
            <Text style={styles.modalLabel}>Tipo de radar</Text>
            <View style={styles.typeGrid}>
              {RADAR_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  style={[
                    styles.typeCard,
                    radarType === t.value && styles.typeCardActive,
                  ]}
                  onPress={() => setRadarType(t.value)}
                  activeOpacity={0.8}
                >
                  <Image
                    source={
                      t.value === "placa"
                        ? radarImages[
                        getClosestPlacaName(
                          newSpeedLimit ? parseInt(newSpeedLimit, 10) : 60
                        )
                        ]
                        : t.icon
                    }
                    style={styles.typeCardIcon}
                    resizeMode="contain"
                  />
                  <Text
                    style={[
                      styles.typeCardText,
                      radarType === t.value && styles.typeCardTextActive,
                    ]}
                    numberOfLines={2}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.panelRow}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => {
                  setPendingAddCoords(null);
                  setNewSpeedLimit("");
                  setRadarType("placa");
                }}
              >
                <Text style={styles.buttonSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary]}
                onPress={handleSaveNewRadar}
                disabled={saving}
              >
                <Text style={styles.buttonPrimaryText}>
                  {saving ? "Salvando..." : "Salvar"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Painel: radar selecionado - editar / mover / deletar */}
      {mode === "view" && selectedRadar && !pendingAddCoords && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Radar selecionado</Text>
          {(selectedRadar.situacao === "Inativo" ||
            selectedRadar.situacao === "inativo") && (
              <Text
                style={[
                  styles.panelSubtitle,
                  { fontWeight: "600", color: "#6b7280" },
                ]}
              >
                Inativo
              </Text>
            )}
          <Text style={styles.panelSubtitle}>
            {selectedRadar.latitude.toFixed(5)},{" "}
            {selectedRadar.longitude.toFixed(5)}
            {selectedRadar.speedLimit != null &&
              ` • ${selectedRadar.speedLimit} km/h`}
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Limite (km/h)"
            keyboardType="number-pad"
            value={newSpeedLimit}
            onChangeText={setNewSpeedLimit}
          />
          <View style={styles.panelRow}>
            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={handleSaveSpeedLimit}
              disabled={saving}
            >
              <Text style={styles.buttonPrimaryText}>
                {saving ? "Salvando..." : "Salvar limite"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={handleMove}
            >
              <Text style={styles.buttonSecondaryText}>Mover</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.panelRow}>
            <TouchableOpacity
              style={[styles.button, styles.buttonDanger]}
              onPress={handleDelete}
              disabled={saving}
            >
              <Text style={styles.buttonDangerText}>Deletar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={handleInactivate}
              disabled={saving}
            >
              <Text style={styles.buttonSecondaryText}>Inativar</Text>
            </TouchableOpacity>
            {(selectedRadar.situacao === "Inativo" ||
              selectedRadar.situacao === "inativo") && (
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: "#10b981" }]}
                  onPress={handleActivate}
                  disabled={saving}
                >
                  <Text style={styles.buttonPrimaryText}>Ativar</Text>
                </TouchableOpacity>
              )}
          </View>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, { marginTop: 8 }]}
            onPress={() => setSelectedRadar(null)}
          >
            <Text style={styles.buttonSecondaryText}>Fechar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* FAB Adicionar */}
      {!pendingAddCoords && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => {
            setMode("add");
            setSelectedRadar(null);
          }}
        >
          <Text style={styles.fabText}>+ Adicionar radar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingTop: 48,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 16,
    color: "#3b82f6",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
  },
  headerButtonActive: {
    backgroundColor: "#3b82f6",
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  headerButtonTextActive: {
    color: "#fff",
  },
  addBanner: {
    backgroundColor: "#3b82f6",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  addBannerText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
  },
  mapWrapper: {
    flex: 1,
    position: "relative",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: "#6b7280",
  },
  hintBar: {
    backgroundColor: "#fef3c7",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  hintText: {
    fontSize: 14,
    color: "#92400e",
    textAlign: "center",
  },
  panel: {
    backgroundColor: "#fff",
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 4,
  },
  panelSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 360,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 6,
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 20,
  },
  typeCard: {
    width: "48%",
    minWidth: 130,
    maxWidth: 200,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    borderWidth: 2,
    borderColor: "transparent",
  },
  typeCardActive: {
    backgroundColor: "#eff6ff",
    borderColor: "#3b82f6",
  },
  typeCardIcon: {
    width: 36,
    height: 36,
    marginRight: 12,
  },
  typeCardText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  typeCardTextActive: {
    color: "#1d4ed8",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
  },
  panelRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonPrimary: {
    backgroundColor: "#3b82f6",
  },
  buttonPrimaryText: {
    color: "#fff",
    fontWeight: "600",
  },
  buttonSecondary: {
    backgroundColor: "#e5e7eb",
  },
  buttonSecondaryText: {
    color: "#374151",
  },
  buttonDanger: {
    backgroundColor: "#ef4444",
  },
  buttonDangerText: {
    color: "#fff",
    fontWeight: "600",
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    backgroundColor: "#3b82f6",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

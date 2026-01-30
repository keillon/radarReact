import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Map from "../components/Map";
import {
  Radar,
  getRadarsNearLocation,
  reportRadar,
  updateRadar,
  deleteRadar,
} from "../services/api";
import Geolocation from "react-native-geolocation-service";

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

  const loadRadars = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getRadarsNearLocation(
        center.latitude,
        center.longitude,
        LOAD_RADIUS_M,
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
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
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
            prev.map((r) => (r.id === selectedRadar.id ? updated : r)),
          );
          setSelectedRadar(updated);
          setMode("view");
        } else {
          Alert.alert(
            "Erro",
            "Não foi possível mover o radar. O servidor pode não suportar edição.",
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
        type: "reportado",
      });
      setRadars((prev) => [...prev, radar]);
      setPendingAddCoords(null);
      setNewSpeedLimit("");
      setMode("view");
    } catch (e) {
      Alert.alert("Erro", "Não foi possível adicionar o radar.");
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
        prev.map((r) => (r.id === selectedRadar.id ? updated : r)),
      );
      setSelectedRadar(updated);
    } else {
      Alert.alert(
        "Erro",
        "Não foi possível atualizar. O servidor pode não suportar edição.",
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
              setRadars((prev) => prev.filter((r) => r.id !== selectedRadar.id));
              setSelectedRadar(null);
              setMode("view");
            } else {
              Alert.alert(
                "Aviso",
                "Não foi possível deletar. Tente inativar no servidor.",
              );
            }
          },
        },
      ],
    );
  };

  const handleInactivate = async () => {
    if (!selectedRadar) return;
    setSaving(true);
    const updated = await updateRadar(selectedRadar.id, {
      situacao: "inativo",
    });
    setSaving(false);
    if (updated) {
      setRadars((prev) => prev.filter((r) => r.id !== selectedRadar.id));
      setSelectedRadar(null);
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
        <TouchableOpacity onPress={loadRadars} style={styles.reloadButton}>
          <Text style={styles.reloadButtonText}>Recarregar</Text>
        </TouchableOpacity>
      </View>

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

      {/* Modo: dica */}
      {mode === "add" && (
        <View style={styles.hintBar}>
          <Text style={styles.hintText}>
            Toque no mapa para colocar um novo radar
          </Text>
        </View>
      )}
      {mode === "move" && selectedRadar && (
        <View style={styles.hintBar}>
          <Text style={styles.hintText}>
            Toque no mapa na nova posição do radar
          </Text>
        </View>
      )}

      {/* Painel: adicionar radar (após toque no mapa) */}
      {mode === "add" && pendingAddCoords && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Novo radar</Text>
          <Text style={styles.panelSubtitle}>
            {pendingAddCoords.latitude.toFixed(5)},{" "}
            {pendingAddCoords.longitude.toFixed(5)}
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Limite (km/h) - opcional"
            keyboardType="number-pad"
            value={newSpeedLimit}
            onChangeText={setNewSpeedLimit}
          />
          <View style={styles.panelRow}>
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => {
                setPendingAddCoords(null);
                setNewSpeedLimit("");
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
      )}

      {/* Painel: radar selecionado - editar / mover / deletar */}
      {mode === "view" && selectedRadar && !pendingAddCoords && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Radar selecionado</Text>
          <Text style={styles.panelSubtitle}>
            {selectedRadar.latitude.toFixed(5)}, {selectedRadar.longitude.toFixed(5)}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
  },
  reloadButton: {
    padding: 8,
  },
  reloadButtonText: {
    fontSize: 14,
    color: "#3b82f6",
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

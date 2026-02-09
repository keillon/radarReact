// Importação segura do AsyncStorage com fallback
let AsyncStorage: any = null;
try {
  AsyncStorage = require("@react-native-async-storage/async-storage").default;
} catch (error) {
  console.warn("AsyncStorage não pôde ser importado:", error);
}

import { Radar } from "./types";

const REPORTED_RADARS_KEY = "@radar_bot:reported_radars";
const PENDING_SYNC_KEY = "@radar_bot:pending_sync_radars";

// Verificar se AsyncStorage está disponível
const isAsyncStorageAvailable = (): boolean => {
  try {
    if (!AsyncStorage) {
      return false;
    }
    return (
      typeof AsyncStorage.getItem === "function" &&
      typeof AsyncStorage.setItem === "function" &&
      typeof AsyncStorage.removeItem === "function"
    );
  } catch (error) {
    return false;
  }
};

// Gerar ID temporário único para radar reportado localmente
const generateTempId = (): string => {
  return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Salvar radar reportado localmente
export const saveReportedRadarLocally = async (
  radar: Radar,
): Promise<Radar> => {
  if (!isAsyncStorageAvailable()) {
    console.warn(
      "AsyncStorage não disponível. Radar não será salvo localmente.",
    );
    return radar;
  }

  try {
    // Buscar radares reportados existentes
    const existingData = await AsyncStorage.getItem(REPORTED_RADARS_KEY);
    const reportedRadars: Radar[] = existingData
      ? JSON.parse(existingData)
      : [];

    // Adicionar novo radar (evitar duplicatas)
    const exists = reportedRadars.some((r) => r.id === radar.id);
    if (!exists) {
      reportedRadars.push({
        ...radar,
        reportedAt: Date.now(), // Adicionar timestamp
      } as any);
      await AsyncStorage.setItem(
        REPORTED_RADARS_KEY,
        JSON.stringify(reportedRadars),
      );
      console.log(`✅ Radar salvo localmente: ${radar.id}`);
    }

    // Adicionar à fila de sincronização
    const pendingData = await AsyncStorage.getItem(PENDING_SYNC_KEY);
    const pendingRadars: Radar[] = pendingData ? JSON.parse(pendingData) : [];

    const pendingExists = pendingRadars.some((r) => r.id === radar.id);
    if (!pendingExists) {
      pendingRadars.push(radar);
      await AsyncStorage.setItem(
        PENDING_SYNC_KEY,
        JSON.stringify(pendingRadars),
      );
      console.log(`📤 Radar adicionado à fila de sincronização: ${radar.id}`);
    }

    return radar;
  } catch (error) {
    console.error("Erro ao salvar radar localmente:", error);
    return radar;
  }
};

// Buscar radares reportados localmente
export const getReportedRadarsLocally = async (): Promise<Radar[]> => {
  if (!isAsyncStorageAvailable()) {
    return [];
  }

  try {
    const data = await AsyncStorage.getItem(REPORTED_RADARS_KEY);
    if (!data) {
      return [];
    }

    const radars: Radar[] = JSON.parse(data);
    return radars;
  } catch (error) {
    console.error("Erro ao buscar radares reportados localmente:", error);
    return [];
  }
};

// Remover radar da fila de sincronização (após sincronizar com sucesso)
export const removeFromPendingSync = async (radarId: string): Promise<void> => {
  if (!isAsyncStorageAvailable()) {
    return;
  }

  try {
    const pendingData = await AsyncStorage.getItem(PENDING_SYNC_KEY);
    if (!pendingData) {
      return;
    }

    const pendingRadars: Radar[] = JSON.parse(pendingData);
    const filtered = pendingRadars.filter((r) => r.id !== radarId);
    await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(filtered));
    console.log(`✅ Radar removido da fila de sincronização: ${radarId}`);
  } catch (error) {
    console.error("Erro ao remover da fila de sincronização:", error);
  }
};

// Criar radar temporário localmente
export const createTempRadar = (request: {
  latitude: number;
  longitude: number;
  speedLimit?: number;
  type?: string;
}): Radar => {
  return {
    id: generateTempId(),
    latitude: request.latitude,
    longitude: request.longitude,
    speedLimit: request.speedLimit,
    type: request.type || "reportado",
  };
};

// Importação segura do AsyncStorage com fallback
let AsyncStorage: any = null;
try {
  AsyncStorage = require("@react-native-async-storage/async-storage").default;
} catch (error) {
  console.warn("AsyncStorage não pôde ser importado:", error);
}

import { Radar } from "./api";

const REPORTED_RADARS_KEY = "@radar_bot:reported_radars";
const PENDING_SYNC_KEY = "@radar_bot:pending_sync_radars";

// Cache em memória para performance instantânea e escalabilidade
let reportedRadarsCache: Radar[] | null = null;
let pendingRadarsCache: Radar[] | null = null;
let isSaving = false;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

// Verificar se AsyncStorage está disponível
const isAsyncStorageAvailable = (): boolean => {
  try {
    if (!AsyncStorage) return false;
    return typeof AsyncStorage.getItem === "function" && typeof AsyncStorage.setItem === "function";
  } catch (error) {
    return false;
  }
};

/**
 * Inicializa os caches em memória se ainda não foram carregados.
 * Isso garante que operações subsequentes sejam puramente em memória (O(1) ou O(N) pequeno).
 */
const ensureCache = async () => {
  if (reportedRadarsCache !== null && pendingRadarsCache !== null) return;
  
  if (!isAsyncStorageAvailable()) {
    reportedRadarsCache = reportedRadarsCache || [];
    pendingRadarsCache = pendingRadarsCache || [];
    return;
  }

  try {
    const [reportedData, pendingData] = await Promise.all([
      AsyncStorage.getItem(REPORTED_RADARS_KEY),
      AsyncStorage.getItem(PENDING_SYNC_KEY)
    ]);

    reportedRadarsCache = reportedData ? JSON.parse(reportedData) : [];
    pendingRadarsCache = pendingData ? JSON.parse(pendingData) : [];
  } catch (error) {
    console.error("Erro ao inicializar cache de radares:", error);
    reportedRadarsCache = reportedRadarsCache || [];
    pendingRadarsCache = pendingRadarsCache || [];
  }
};

/**
 * Persiste o estado atual dos caches para o AsyncStorage em background.
 * Usa um debounce para evitar múltiplas gravações em rajadas de reports (Escalabilidade).
 */
const persistToStorage = () => {
  if (saveTimeout) clearTimeout(saveTimeout);
  
  saveTimeout = setTimeout(async () => {
    if (!isAsyncStorageAvailable() || isSaving) return;
    
    isSaving = true;
    try {
      await Promise.all([
        AsyncStorage.setItem(REPORTED_RADARS_KEY, JSON.stringify(reportedRadarsCache)),
        AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(pendingRadarsCache))
      ]);
      // console.log("💾 Caches persistidos com sucesso");
    } catch (error) {
      console.error("Erro ao persistir radares reportados:", error);
    } finally {
      isSaving = false;
    }
  }, 2000); // 2 segundos de debounce para escalabilidade
};

// Gerar ID temporário único para radar reportado localmente
const generateTempId = (): string => {
  return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Salvar radar reportado localmente (Agora Instantâneo)
export const saveReportedRadarLocally = async (radar: Radar): Promise<Radar> => {
  // Inicializa cache se necessário (Lazy)
  await ensureCache();

  // Operação em memória: Instantânea
  const exists = reportedRadarsCache!.some((r) => r.id === radar.id);
  if (!exists) {
    reportedRadarsCache!.push({
      ...radar,
      reportedAt: Date.now(),
    } as any);
    
    // Adicionar à fila de sincronização em memória
    const pendingExists = pendingRadarsCache!.some((r) => r.id === radar.id);
    if (!pendingExists) {
      pendingRadarsCache!.push(radar);
    }

    // Persiste em background (não bloqueia a UI)
    persistToStorage();
    // console.log(`⚡ Radar processado instantaneamente: ${radar.id}`);
  }

  return radar;
};

// Buscar radares reportados localmente (Instantâneo do cache)
export const getReportedRadarsLocally = async (): Promise<Radar[]> => {
  await ensureCache();
  return [...reportedRadarsCache!];
};

// Remover radar da fila de sincronização (Background)
export const removeFromPendingSync = async (radarId: string): Promise<void> => {
  await ensureCache();
  
  const initialLen = pendingRadarsCache!.length;
  pendingRadarsCache = pendingRadarsCache!.filter((r) => r.id !== radarId);
  
  if (pendingRadarsCache.length !== initialLen) {
    persistToStorage();
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

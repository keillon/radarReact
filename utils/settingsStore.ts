/**
 * Store de configurações em nível de módulo.
 * Usado por useRadarAudio para ler valores no momento exato da reprodução,
 * evitando problemas de timing com o ciclo de renderização do React.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const SETTINGS_KEY = "radarzone_settings";

export interface AppSettings {
  soundEnabled: boolean;
  volume: number;
  mapVoiceEnabled: boolean;
  ttsVoiceId: string | null;
}

const DEFAULT_SETTINGS: AppSettings = {
  soundEnabled: true,
  volume: 0.8,
  mapVoiceEnabled: true,
  ttsVoiceId: null,
};

let current: AppSettings = { ...DEFAULT_SETTINGS };
let initPromise: Promise<void> | null = null;

export function getStoredSettings(): AppSettings {
  return { ...current };
}

export async function updateStoredSettings(partial: Partial<AppSettings>): Promise<void> {
  current = {
    ...current,
    ...partial,
    volume: Math.max(
      0,
      Math.min(1, partial.volume ?? current.volume)
    ),
  };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
}

export async function loadStoredSettings(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      current = {
        ...DEFAULT_SETTINGS,
        ...parsed,
        volume: Math.max(
          0,
          Math.min(1, parsed.volume ?? DEFAULT_SETTINGS.volume)
        ),
        ttsVoiceId: parsed.ttsVoiceId ?? null,
      };
    }
  } catch {
    // manter current como está ou DEFAULT
  }
}

export async function initStoredSettings(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = loadStoredSettings();
  await initPromise;
}

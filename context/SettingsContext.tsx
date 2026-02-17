import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  getStoredSettings,
  initStoredSettings,
  loadStoredSettings,
  updateStoredSettings,
  type AppSettings,
} from "../utils/settingsStore";

interface SettingsContextValue extends AppSettings {
  setSoundEnabled: (v: boolean) => void;
  setVolume: (v: number) => void;
  setMapVoiceEnabled: (v: boolean) => void;
  setTtsVoiceId: (v: string | null) => void;
  updateSettings: (s: Partial<AppSettings>) => void;
  reloadFromStorage: () => Promise<void>;
  getSettings: () => AppSettings;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(getStoredSettings());

  useEffect(() => {
    initStoredSettings().then(() => setSettings(getStoredSettings()));
  }, []);

  const reloadFromStorage = useCallback(async () => {
    await loadStoredSettings();
    setSettings(getStoredSettings());
  }, []);

  const getSettings = useCallback((): AppSettings => getStoredSettings(), []);

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    updateStoredSettings(partial); // atualiza current em memória; setItem roda em bg
    setSettings(getStoredSettings());
  }, []);

  const setTtsVoiceId = useCallback(
    (v: string | null) => updateSettings({ ttsVoiceId: v }),
    [updateSettings]
  );

  const setSoundEnabled = useCallback(
    (v: boolean) => updateSettings({ soundEnabled: v }),
    [updateSettings]
  );
  const setVolume = useCallback(
    (v: number) => updateSettings({ volume: Math.max(0, Math.min(1, v)) }),
    [updateSettings]
  );
  const setMapVoiceEnabled = useCallback(
    (v: boolean) => updateSettings({ mapVoiceEnabled: v }),
    [updateSettings]
  );

  const value: SettingsContextValue = {
    ...settings,
    setSoundEnabled,
    setVolume,
    setMapVoiceEnabled,
    setTtsVoiceId,
    updateSettings,
    reloadFromStorage,
    getSettings,
  };

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export type { AppSettings } from "../utils/settingsStore";

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

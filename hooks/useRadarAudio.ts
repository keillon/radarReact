import { useCallback, useRef } from "react";
import { Platform } from "react-native";
import { getStoredSettings } from "../utils/settingsStore";
import { useDeviceVolume } from "./useDeviceVolume";

let TtsCache: any = undefined;
let TtsInitPromise: Promise<void> | null = null;
function getTts(): any {
  if (TtsCache !== undefined) return TtsCache;
  try {
    const TtsModule = require("react-native-tts");
    TtsCache = TtsModule.default || TtsModule;
  } catch {
    TtsCache = null;
  }
  return TtsCache;
}

function ensureTtsReady(): Promise<void> {
  if (TtsInitPromise) return TtsInitPromise;
  const Tts = getTts();
  if (!Tts) return Promise.resolve();
  TtsInitPromise = (async () => {
    try {
      await Tts.setDefaultLanguage?.("pt-BR");
      await Tts.getInitStatus?.();
    } catch {}
  })();
  return TtsInitPromise;
}

export function useRadarAudio() {
  const deviceVolume = useDeviceVolume();
  const deviceVolRef = useRef(deviceVolume);
  deviceVolRef.current = deviceVolume;

  const playRadarAlert = useCallback(() => {
    const { soundEnabled, mapVoiceEnabled, volume } = getStoredSettings();
    if (!soundEnabled) return;
    try {
      const Sound = require("react-native-sound").default;
      Sound.setCategory("Playback", true);
      const s = new Sound(
        require("../assets/audios/alertRadar.mp3"),
        async (error: any) => {
          if (error) {
            console.warn("Falha ao carregar alertRadar.mp3:", error);
            const Tts = getTts();
            if (mapVoiceEnabled && Tts?.speak) {
              ensureTtsReady().then(async () => {
                try {
                  const deviceVol = deviceVolRef.current;
                  const vol = Math.max(0, Math.min(1, Number(volume) * deviceVol));
                  const opts =
                    Platform.OS === "android"
                      ? {
                          androidParams: {
                            KEY_PARAM_VOLUME: vol,
                            KEY_PARAM_STREAM: "STREAM_MUSIC",
                          },
                        }
                      : {};
                  Tts.speak("Atenção radar muito próximo", opts);
                } catch {}
              });
            }
            return;
          }
          Promise.resolve(deviceVolRef.current).then((deviceVol) => {
            const vol = Math.max(0, Math.min(1, Number(volume) * deviceVol));
            s.setVolume(vol);
          const playOnce = (count: number) => {
            if (count <= 0) {
              s.release();
              return;
            }
            s.setCurrentTime(0);
            s.play((success: boolean) => {
              if (count > 1 && success) {
                setTimeout(() => playOnce(count - 1), 300);
              } else {
                if (!success) console.warn("Falha ao reproduzir alertRadar.mp3");
                s.release();
              }
            });
          };
            playOnce(3);
          });
        }
      );
    } catch (e) {
      // react-native-sound pode não estar linkado
    }
  }, []);

  const speakRadarAlert = useCallback(
    (message: string) => {
      const { mapVoiceEnabled, volume, ttsVoiceId } = getStoredSettings();
      if (!mapVoiceEnabled) return;
      const Tts = getTts();
      if (!Tts || typeof Tts.speak !== "function") return;
      ensureTtsReady().then(async () => {
        try {
          const deviceVol = deviceVolRef.current;
          const vol = Math.max(0, Math.min(1, Number(volume) * deviceVol));
          if (ttsVoiceId && typeof Tts.setDefaultVoice === "function") {
            await Tts.setDefaultVoice(ttsVoiceId).catch(() => {});
          }
          const options: Record<string, unknown> =
            Platform.OS === "android"
              ? {
                  androidParams: {
                    KEY_PARAM_VOLUME: vol,
                    KEY_PARAM_STREAM: "STREAM_MUSIC",
                  },
                }
              : {};
          if (ttsVoiceId && Platform.OS === "ios") {
            options.iosVoiceId = ttsVoiceId;
          }
          Tts.speak(message, Object.keys(options).length ? options : undefined);
        } catch {}
      });
    },
    []
  );

  return { playRadarAlert, speakRadarAlert };
}

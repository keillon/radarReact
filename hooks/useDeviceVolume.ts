/**
 * Hook que mantém o volume do dispositivo Android sincronizado em tempo real.
 * Usa o VolumeModule nativo (polling a cada 400ms).
 */
import { useEffect, useState } from "react";
import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import { getDeviceVolume } from "../utils/deviceVolume";

const { VolumeModule } = NativeModules;

export function useDeviceVolume(): number {
  const [deviceVolume, setDeviceVolume] = useState(1);

  useEffect(() => {
    if (Platform.OS !== "android" || !VolumeModule?.startListening) {
      return;
    }
    getDeviceVolume().then(setDeviceVolume);
    VolumeModule.startListening().catch(() => {});
    const emitter = new NativeEventEmitter(VolumeModule);
    const sub = emitter.addListener("onVolumeChange", (e: { volume?: number }) => {
      const v = e?.volume;
      if (typeof v === "number") setDeviceVolume(Math.max(0, Math.min(1, v)));
    });
    return () => {
      sub?.remove?.();
      VolumeModule.stopListening?.().catch(() => {});
    };
  }, []);

  return deviceVolume;
}

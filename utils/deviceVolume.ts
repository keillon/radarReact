/**
 * Obtém o volume de mídia do dispositivo (0-1).
 * Usa módulo nativo ou fallback para 1.0.
 */
import { NativeModules, Platform } from "react-native";

const { VolumeModule } = NativeModules;

export async function getDeviceVolume(): Promise<number> {
  if (Platform.OS !== "android" || !VolumeModule?.getVolume) {
    return 1;
  }
  try {
    const v = await VolumeModule.getVolume();
    return Math.max(0, Math.min(1, Number(v) || 1));
  } catch {
    return 1;
  }
}

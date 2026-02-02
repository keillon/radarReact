import * as fs from "fs";
import * as path from "path";
import * as fs from "fs";

export interface MapRadarItem {
  latitude: number;
  longitude: number;
  tipoRadar: string; // fixo | móvel | semaforo | semaforo-camera
  source?: string;
  label?: string;
}

// Simple in-memory cache for maparadar data
let cachedMaparadar: { data: MapRadarItem[]; ts: number } | null = null;
const MAPARADAR_TTL = 5 * 60 * 1000; // 5 minutes

// Normalize diacritics and ascii for robust parsing
function normalizeText(input: string): string {
  let s = input || "";
  // Normalize to ASCII approximations
  s = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]-?/g, " ")
    .replace(/[àáâãäå]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôöõ]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/ç/g, "c");
  return s;
}

/** Organize maparadar.csv into a stable 3-column format (lat,lon,label) in a separate file */
function organizeCSVIfNeeded(): string {
  const csvPath = path.join(process.cwd(), "backend", "maparadar.csv");
  const organizedPath = path.join(process.cwd(), "backend", "maparadar.organized.csv");
  if (fs.existsSync(organizedPath)) {
    // If source CSV newer than organized, re-run organization to ensure freshness
    try {
      const srcMtime = fs.statSync(csvPath).mtimeMs;
      const organizedMtime = fs.statSync(organizedPath).mtimeMs;
      if (srcMtime > organizedMtime) {
        // Fall through to re-organize
      } else {
        return organizedPath;
      }
    } catch (_) {
      // If stat fails, re-organize as a safety
    }
  }
  if (!fs.existsSync(csvPath)) return organizedPath; // may not exist yet

  try {
    const lines = fs.readFileSync(csvPath, "utf-8").split(/\r?\n/);
    const out: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Try to remove line number prefix like "00001| ..."
      const content = trimmed.includes("|") ? trimmed.split("|").slice(1).join("|").trim() : trimmed;
      // Split into lat, lon, label
      const parts = content.split(",");
      if (parts.length < 3) {
        // Attempt to extract exact two numeric tokens first
        const nums = content.match(/-?\d+\.?\d*,\s*-?\d+\.?\d*/);
        if (nums && nums[0]) {
          const [latStr, lonStr] = nums[0].split(",");
          const label = content.split(nums[0]).pop() || "Radar";
          const lat = parseFloat(latStr);
          const lon = parseFloat(lonStr);
          if (!isNaN(lat) && !isNaN(lon)) {
            out.push(`${lat},${lon},${label.trim()}`);
          }
        }
        continue;
      }
      const lat = parts[0].trim();
      const lon = parts[1].trim();
      const label = parts.slice(2).join(",").trim();
      // Basic validation
      if (!lat || !lon || !label) continue;
      // Ensure proper numeric
      const latNum = parseFloat(lat);
      const lonNum = parseFloat(lon);
      if (!isNaN(latNum) && !isNaN(lonNum)) {
        out.push(`${latNum},${lonNum},${label}`);
      }
    }
    // Write organized file (overwrite for simplicity)
    if (out.length > 0) {
      fs.writeFileSync(organizedPath, out.join("\n"), "utf-8");
      return organizedPath;
    }
  } catch (e) {
    console.error("Erro organizando maparadar.csv:", e);
  }
  return organizedPath;
}

/** Parse organized or raw CSV into MapRadarItem[] */
async function loadMaparadarFromCSV(): Promise<MapRadarItem[]> {
  const organizedPath = organizeCSVIfNeeded();
  const csvPath = organizedPath && fs.existsSync(organizedPath) ? organizedPath : path.join(process.cwd(), "backend", "maparadar.csv");
  if (!fs.existsSync(csvPath)) return [];
  const rawText = fs.readFileSync(csvPath, "utf-8");
  const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const result: MapRadarItem[] = [];
  for (const line of lines) {
    const [latStr, lonStr, label] = line.split(",").map((p) => (p || "").trim());
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) continue;
    // Infer tipoRadar from label
    const t = normalizeText(label || "");
    let tipoRadar = "fixo";
    if (t.includes("movel")) tipoRadar = "móvel";
    else if (t.includes("semaforo")) {
      if (t.includes("camera")) tipoRadar = "semaforo-camera"; else tipoRadar = "semaforo";
    }
    result.push({ latitude: lat, longitude: lon, tipoRadar, source: "maparadar-csv", label });
  }
  return result;
}

export async function parseMaparadarCSV(forceReload?: boolean): Promise<MapRadarItem[]> {
  // Simple in-memory caching
  if (!forceReload && cachedMaparadar && Date.now() - cachedMaparadar.ts < MAPARADAR_TTL) {
    return cachedMaparadar.data;
  }
  // Load from CSV and extract structured items
  const data = await loadMaparadarFromCSV();
  cachedMaparadar = { data, ts: Date.now() };
  return data;
}

// (Removido) duplicate function parseMaparadarCSV() antiga; uso de parseMaparadarCSV(forceReload) já implementado acima

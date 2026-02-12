import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "../utils/prisma";

type ParsedCsvRadar = {
  latitude: number;
  longitude: number;
  tipoRadar: string;
  velocidadeLeve: number | null;
  description: string | null;
};

type ImportState = {
  hash: string;
  importedAt: string;
  fileName: string;
  totalRows: number;
  created: number;
  updated: number;
  deactivated: number;
};

const STATE_FILE = path.join(
  process.cwd(),
  "backend",
  "radarsFiles",
  ".maparadar_upload_state.json"
);
const CSV_FILE = path.join(process.cwd(), "backend", "maparadar.csv");

function normalizeType(description: string): string {
  const d = description
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (d.includes("semaforo")) return "semaforo";
  if (d.includes("placa")) return "placa";
  if (d.includes("movel") || d.includes("mobile")) return "móvel";
  if (d.includes("fixo")) return "fixo";
  return "fixo";
}

function parseSpeedFromDescription(description: string): number | null {
  const speedMatch = description.match(/(\d+)\s*(?:kmh|km\/h)?/i);
  if (!speedMatch) return null;
  const speed = Number(speedMatch[1]);
  if (!Number.isFinite(speed) || speed <= 0 || speed > 200) return null;
  return speed;
}

function parseCsvContent(csvText: string): ParsedCsvRadar[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const parsed: ParsedCsvRadar[] = [];
  for (const line of lines) {
    const atIndex = line.lastIndexOf("@");
    let core = line;
    let speedAt: number | null = null;
    if (atIndex >= 0) {
      core = line.substring(0, atIndex).trim();
      const speedMaybe = Number(line.substring(atIndex + 1).trim());
      if (Number.isFinite(speedMaybe) && speedMaybe > 0 && speedMaybe <= 200) {
        speedAt = speedMaybe;
      }
    }

    const parts = core.split(",");
    if (parts.length < 3) continue;
    const longitude = Number(parts[0].trim());
    const latitude = Number(parts[1].trim());
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      continue;
    }

    const description = parts.slice(2).join(",").trim();
    const tipoRadar = normalizeType(description);
    const velocidadeLeve = speedAt ?? parseSpeedFromDescription(description);

    parsed.push({
      latitude,
      longitude,
      tipoRadar,
      velocidadeLeve,
      description: description || null,
    });
  }

  // dedupe por coordenada
  const map = new Map<string, ParsedCsvRadar>();
  for (const row of parsed) {
    const key = `${row.latitude.toFixed(6)}-${row.longitude.toFixed(6)}`;
    map.set(key, row);
  }
  return Array.from(map.values());
}

function readState(): ImportState | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as ImportState;
  } catch {
    return null;
  }
}

function writeState(state: ImportState) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export function getCsvImportStatus() {
  const state = readState();
  let csvInfo: { exists: boolean; mtimeMs: number | null; size: number | null } = {
    exists: false,
    mtimeMs: null,
    size: null,
  };
  try {
    if (fs.existsSync(CSV_FILE)) {
      const stat = fs.statSync(CSV_FILE);
      csvInfo = { exists: true, mtimeMs: stat.mtimeMs, size: stat.size };
    }
  } catch {
    // ignore
  }
  return { state, csvInfo };
}

export async function importRadarCsv(params: {
  csvText: string;
  fileName?: string;
  force?: boolean;
}) {
  const csvText = String(params.csvText ?? "").trim();
  if (!csvText) {
    return { imported: false, reason: "empty_csv" as const };
  }

  const hash = hashText(csvText);
  const prevState = readState();
  if (!params.force && prevState?.hash === hash) {
    return {
      imported: false,
      reason: "unchanged_csv" as const,
      previous: prevState,
    };
  }

  const parsed = parseCsvContent(csvText);
  if (parsed.length === 0) {
    return { imported: false, reason: "no_valid_rows" as const };
  }

  const csvDir = path.dirname(CSV_FILE);
  if (!fs.existsSync(csvDir)) fs.mkdirSync(csvDir, { recursive: true });
  fs.writeFileSync(CSV_FILE, csvText, "utf-8");

  const existing = await prisma.radar.findMany({
    where: { source: "csv-upload" },
    select: {
      id: true,
      latitude: true,
      longitude: true,
      tipoRadar: true,
      velocidadeLeve: true,
      ativo: true,
      situacao: true,
    },
  });

  const existingMap = new Map<
    string,
    {
      id: string;
      tipoRadar: string | null;
      velocidadeLeve: number | null;
      ativo: boolean;
      situacao: string | null;
    }
  >();
  for (const row of existing) {
    const key = `${row.latitude.toFixed(6)}-${row.longitude.toFixed(6)}`;
    existingMap.set(key, {
      id: row.id,
      tipoRadar: row.tipoRadar,
      velocidadeLeve: row.velocidadeLeve,
      ativo: row.ativo,
      situacao: row.situacao,
    });
  }

  const incomingKeySet = new Set<string>();
  const creates: Array<any> = [];
  const updates: Array<{ id: string; data: any }> = [];

  for (const row of parsed) {
    const key = `${row.latitude.toFixed(6)}-${row.longitude.toFixed(6)}`;
    incomingKeySet.add(key);
    const existingRow = existingMap.get(key);

    if (!existingRow) {
      creates.push({
        latitude: row.latitude,
        longitude: row.longitude,
        confirms: 0,
        denies: 0,
        lastConfirmedAt: new Date(),
        source: "csv-upload",
        tipoRadar: row.tipoRadar,
        velocidadeLeve: row.velocidadeLeve,
        situacao: "Ativo",
        ativo: true,
        rodovia: row.description,
      });
      continue;
    }

    const changed =
      existingRow.tipoRadar !== row.tipoRadar ||
      existingRow.velocidadeLeve !== row.velocidadeLeve ||
      existingRow.ativo !== true ||
      existingRow.situacao !== "Ativo";
    if (changed) {
      updates.push({
        id: existingRow.id,
        data: {
          tipoRadar: row.tipoRadar,
          velocidadeLeve: row.velocidadeLeve,
          situacao: "Ativo",
          ativo: true,
          rodovia: row.description,
        },
      });
    }
  }

  const toDeactivateIds: string[] = [];
  for (const [key, value] of existingMap.entries()) {
    if (!incomingKeySet.has(key) && value.ativo) {
      toDeactivateIds.push(value.id);
    }
  }

  if (creates.length > 0) {
    await prisma.radar.createMany({ data: creates });
  }
  for (const upd of updates) {
    await prisma.radar.update({ where: { id: upd.id }, data: upd.data });
  }
  if (toDeactivateIds.length > 0) {
    await prisma.radar.updateMany({
      where: { id: { in: toDeactivateIds } },
      data: { ativo: false, situacao: "Inativo" },
    });
  }

  const state: ImportState = {
    hash,
    importedAt: new Date().toISOString(),
    fileName: params.fileName || "maparadar.csv",
    totalRows: parsed.length,
    created: creates.length,
    updated: updates.length,
    deactivated: toDeactivateIds.length,
  };
  writeState(state);

  return {
    imported: true,
    reason: "ok" as const,
    stats: state,
  };
}

import { FastifyInstance } from "fastify";
import * as fs from "fs";
import * as path from "path";
import { checkForUpdates, syncANTT } from "../scripts/syncANTTAuto";
import { parseMaparadarCSV } from "../services/maparadar";
import { syncAllRadars } from "../services/radarSources";
import { decodePolyline } from "../utils/polyline";
import { prisma } from "../utils/prisma";

type RadarResponseItem = {
  id: string;
  latitude: number;
  longitude: number;
  velocidadeLeve: number | null;
  velocidadePesado: number | null;
  tipoRadar: string | null;
  situacao: string | null;
  ativo: boolean;
  confirms: number;
  denies: number;
  source: string | null;
  rodovia?: string | null;
  createdAt: Date;
  lastConfirmedAt: Date;
};

type RadarCacheState = {
  data: RadarResponseItem[];
  builtAt: number;
  version: number;
  loadingPromise: Promise<RadarResponseItem[]> | null;
};

const RADARS_CACHE_TTL_MS = 5_000;
const radarCache: RadarCacheState = {
  data: [],
  builtAt: 0,
  version: 0,
  loadingPromise: null,
};

let csvCache: { mtimeMs: number; data: RadarResponseItem[] } = {
  mtimeMs: 0,
  data: [],
};

/** Extrai tipo normalizado: Radar Fixo | Radar Movel | Semaforo com Radar | Semaforo com Camera */
function extractTipoRadarFromDescription(description: string): string {
  if (!description || typeof description !== "string") return "Radar Fixo";
  const d = description
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (d.includes("semaforo") && d.includes("camera"))
    return "Semaforo com Camera";
  if (d.includes("semaforo") && d.includes("radar"))
    return "Semaforo com Radar";
  if (d.includes("radar") && d.includes("movel")) return "Radar Movel";
  if (d.includes("radar") && d.includes("fixo")) return "Radar Fixo";
  return "Radar Fixo";
}

/**
 * CSV: longitude,latitude,descrição@velocidade (descrição pode ter vírgulas; após @ = velocidade).
 * Ex: -43.030287,-22.665031,Radar Fixo - 30 kmh@30
 */
async function fetchRadarsFromCSV(): Promise<any[]> {
  try {
    // Caminho relativo ao arquivo: funciona com cwd = projeto ou backend/
    const fromFile = path.join(__dirname, "..", "..", "maparadar.csv");
    const fromCwd = path.join(process.cwd(), "backend", "maparadar.csv");
    const fromCwdBackend = path.join(process.cwd(), "maparadar.csv");
    const csvPath = fs.existsSync(fromFile)
      ? fromFile
      : fs.existsSync(fromCwd)
      ? fromCwd
      : fromCwdBackend;
    if (!fs.existsSync(csvPath)) {
      console.error(
        `❌ [CSV] Arquivo não encontrado. Tentou: ${fromFile}, ${fromCwd}, ${fromCwdBackend}`
      );
      return [];
    }
    console.log(`🔍 [CSV] Lendo radares do arquivo: ${csvPath}`);
    const fileContent = fs.readFileSync(csvPath, "utf-8");
    const lines = fileContent.split("\n").filter((line) => line.trim() !== "");
    console.log(`📊 [CSV] ${lines.length} linhas encontradas no arquivo`);

    const radars = lines
      .map((line, index) => {
        try {
          const trimmedLine = line.trim();
          if (!trimmedLine) return null;

          const atIndex = trimmedLine.lastIndexOf("@");
          let rawThird = trimmedLine;
          let speedFromAt: number | null = null;
          if (atIndex >= 0) {
            rawThird = trimmedLine.substring(0, atIndex).trim();
            const afterAt = trimmedLine.substring(atIndex + 1).trim();
            const num = parseInt(afterAt, 10);
            if (!isNaN(num) && num >= 0) speedFromAt = num;
          }

          const parts = rawThird.split(",");
          if (parts.length < 2) {
            console.warn(
              `⚠️ [CSV] Linha ${index + 1} inválida: ${trimmedLine.substring(
                0,
                50
              )}`
            );
            return null;
          }

          const longitude = parseFloat(parts[0].trim());
          const latitude = parseFloat(parts[1].trim());
          if (isNaN(latitude) || isNaN(longitude)) {
            console.warn(`⚠️ [CSV] Linha ${index + 1} coordenadas inválidas`);
            return null;
          }
          if (
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
          ) {
            console.warn(
              `⚠️ [CSV] Linha ${index + 1} coordenadas fora do range`
            );
            return null;
          }

          const description = parts.slice(2).join(",").trim();
          let velocidadeLeve: number | null = speedFromAt;
          if (velocidadeLeve == null && description) {
            const speedMatch = description.match(/(\d+)\s*(?:kmh|km\/h)/i);
            if (speedMatch) {
              const s = parseInt(speedMatch[1], 10);
              if (!isNaN(s) && s > 0) velocidadeLeve = s;
            }
          }

          const tipoRadar = extractTipoRadarFromDescription(description);

          return {
            id: `csv-${latitude}-${longitude}-${index}`,
            latitude,
            longitude,
            source: "csv",
            confirms: 0,
            denies: 0,
            lastConfirmedAt: new Date(),
            createdAt: new Date(),
            velocidadeLeve,
            velocidadePesado: null,
            tipoRadar,
            rodovia: null,
            uf: null,
            municipio: null,
            km: null,
            sentido: null,
            situacao: "Ativo",
            concessionaria: null,
            ativo: true,
            metadata: {
              description: description || null,
              lineNumber: index + 1,
            },
          };
        } catch (error: any) {
          console.warn(`⚠️ [CSV] Erro linha ${index + 1}: ${error.message}`);
          return null;
        }
      })
      .filter((r: any) => r !== null);

    console.log(
      `✅ [CSV] ${radars.length} radares processados (tipoRadar: Radar Fixo/Movel, Semaforo com Radar/Camera)`
    );
    return radars;
  } catch (error: any) {
    console.error("❌ [CSV] Erro ao ler arquivo CSV:", error);
    return [];
  }
}

function getCSVPath(): string {
  const fromFile = path.join(__dirname, "..", "..", "maparadar.csv");
  const fromCwd = path.join(process.cwd(), "backend", "maparadar.csv");
  const fromCwdBackend = path.join(process.cwd(), "maparadar.csv");
  if (fs.existsSync(fromFile)) return fromFile;
  if (fs.existsSync(fromCwd)) return fromCwd;
  return fromCwdBackend;
}

async function getCsvRadarsCached(): Promise<RadarResponseItem[]> {
  try {
    const csvPath = getCSVPath();
    if (!fs.existsSync(csvPath)) return [];
    const stat = fs.statSync(csvPath);
    if (csvCache.data.length > 0 && csvCache.mtimeMs === stat.mtimeMs) {
      return csvCache.data;
    }
    const parsed = (await fetchRadarsFromCSV()) as RadarResponseItem[];
    csvCache = { mtimeMs: stat.mtimeMs, data: parsed };
    return parsed;
  } catch {
    return csvCache.data;
  }
}

async function loadAllRadarsFast(): Promise<RadarResponseItem[]> {
  const dbRadars = await prisma.radar.findMany({
    select: {
      id: true,
      latitude: true,
      longitude: true,
      velocidadeLeve: true,
      velocidadePesado: true,
      tipoRadar: true,
      situacao: true,
      ativo: true,
      confirms: true,
      denies: true,
      source: true,
      rodovia: true,
      municipio: true,
      uf: true,
      createdAt: true,
      lastConfirmedAt: true,
    },
  });
  return (dbRadars as RadarResponseItem[]).map((r: any) => ({
    ...r,
    tipoRadar:
      r.tipoRadar ??
      extractTipoRadarFromDescription(r.rodovia ?? "") ??
      "Radar Fixo",
  }));
}

async function getAllRadarsCached(forceRefresh: boolean = false): Promise<RadarResponseItem[]> {
  const now = Date.now();
  const cacheValid =
    !forceRefresh &&
    radarCache.data.length > 0 &&
    now - radarCache.builtAt < RADARS_CACHE_TTL_MS;
  if (cacheValid) return radarCache.data;

  if (radarCache.loadingPromise) {
    return radarCache.loadingPromise;
  }

  radarCache.loadingPromise = loadAllRadarsFast()
    .then((data) => {
      radarCache.data = data;
      radarCache.builtAt = Date.now();
      radarCache.version += 1;
      return data;
    })
    .finally(() => {
      radarCache.loadingPromise = null;
    });

  return radarCache.loadingPromise;
}

let radarsLastUpdatedAt = Date.now();

export function invalidateRadarCache() {
  radarCache.builtAt = 0;
  radarsLastUpdatedAt = Date.now();
}

export async function radarRoutes(fastify: FastifyInstance) {
  // Endpoint de debug temporário para verificar o banco
  // IMPORTANTE: Deve ser registrado ANTES de /radars para não ser capturado pela rota genérica
  fastify.get("/radars/debug", async (request, reply) => {
    try {
      const total = await prisma.radar.count();
      const sample = await prisma.radar.findFirst({
        take: 5,
      });
      const withSource = await prisma.radar.count({
        where: {
          source: {
            not: null,
          },
        },
      });
      const publicSource = await prisma.radar.count({
        where: {
          AND: [
            {
              source: {
                not: "user",
              },
            },
            {
              source: {
                not: null,
              },
            },
          ],
        },
      });
      const userSource = await prisma.radar.count({
        where: {
          source: "user",
        },
      });
      const noSource = await prisma.radar.count({
        where: {
          source: null,
        },
      });
      const withDenies = await prisma.radar.count({
        where: {
          denies: {
            gt: 10,
          },
        },
      });

      return {
        total,
        withSource,
        publicSource,
        userSource,
        noSource,
        withDenies,
        sample: sample
          ? {
              id: sample.id,
              latitude: sample.latitude,
              longitude: sample.longitude,
              source: sample.source,
              confirms: sample.confirms,
              denies: sample.denies,
              tipoRadar: sample.tipoRadar,
              rodovia: sample.rodovia,
              uf: sample.uf,
            }
          : null,
      };
    } catch (error: any) {
      fastify.log.error("Erro no debug:", error);
      return reply.code(500).send({
        error: "Erro ao buscar informações de debug",
        details: error.message,
      });
    }
  });

  /** GET /radars/last-updated — Cliente verifica se há atualizações (CSV, report, etc.) */
  fastify.get("/radars/last-updated", async (request, reply) => {
    return reply.send({ lastUpdated: radarsLastUpdatedAt });
  });

  /** Mapeia radar para propriedades GeoJSON (iconImage/iconSize) — alinhado ao Map.tsx (camelCase) */
  function radarToGeoJsonProperties(r: RadarResponseItem): {
    id: string;
    iconImage: string;
    iconSize: number;
    speedLimit: string;
    radarType: string;
  } {
    const typeStr = (r.tipoRadar ?? "unknown").trim().toLowerCase();
    const speed = r.velocidadeLeve ?? 0;
    const speeds = [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160];
    const closestSpeed =
      speed > 0 ? speeds.reduce((a, b) => (Math.abs(b - speed) < Math.abs(a - speed) ? b : a)) : 0;
    let iconImage: string;
    let iconSize: number;
    if (
      typeStr.includes("semaforo") ||
      typeStr.includes("camera") ||
      typeStr.includes("fotografica")
    ) {
      iconImage = "radarSemaforico";
      iconSize = 0.05;
    } else if (typeStr.includes("movel") || typeStr.includes("mobile")) {
      iconImage = "radarMovel";
      iconSize = 0.05;
    } else if (typeStr.includes("fixo") || typeStr.includes("placa")) {
      iconImage = closestSpeed > 0 ? `placa${closestSpeed}` : "radarFixo";
      iconSize = 0.18;
    } else {
      iconImage = "radarMovel";
      iconSize = 0.05;
    }
    return {
      id: r.id,
      iconImage,
      iconSize,
      speedLimit: speed > 0 ? String(speed) : "",
      radarType: r.tipoRadar ?? "",
    };
  }

  /** GET /radars/geojson — GeoJSON FeatureCollection para o mapa (nativo carrega direto, sem bridge) */
  fastify.get("/radars/geojson", async (request, reply) => {
    try {
      const radars = await getAllRadarsCached(false);
      const features = radars
        .filter(
          (r) =>
            r.latitude != null &&
            r.longitude != null &&
            !Number.isNaN(r.latitude) &&
            !Number.isNaN(r.longitude)
        )
        .map((r) => {
          const props = radarToGeoJsonProperties(r);
          return {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [r.longitude, r.latitude],
            },
            properties: props,
          };
        });
      const geojson = {
        type: "FeatureCollection",
        features,
      };
      reply.header("Content-Type", "application/geo+json; charset=utf-8");
      reply.header("Cache-Control", "no-cache, must-revalidate");
      return reply.send(geojson);
    } catch (error: any) {
      fastify.log.error("Erro em /radars/geojson:", error);
      return reply.code(500).send({
        error: "Erro ao gerar GeoJSON",
        details: error.message,
      });
    }
  });

  // Endpoint para buscar novos radares móveis desde uma data específica (para atualização em tempo real)
  fastify.get("/radars/mobile/new", async (request, reply) => {
    const query = request.query as {
      since?: string; // ISO date string - retorna apenas radares móveis criados após esta data
    };

    try {
      let whereClause: any = {
        tipoRadar: "móvel",
        source: "user", // Apenas radares reportados por usuários
      };

      // Se forneceu data, filtrar apenas radares criados após essa data
      if (query.since) {
        const sinceDate = new Date(query.since);
        if (!isNaN(sinceDate.getTime())) {
          whereClause.createdAt = {
            gt: sinceDate,
          };
        }
      }

      const newMobileRadars = await prisma.radar.findMany({
        where: whereClause,
        orderBy: {
          createdAt: "desc",
        },
        take: 100, // Limitar a 100 radares mais recentes
      });

      return {
        radars: newMobileRadars,
        count: newMobileRadars.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      fastify.log.error("Erro ao buscar novos radares móveis:", error);
      return reply.code(500).send({
        error: "Erro ao buscar novos radares móveis",
        details: error.message,
      });
    }
  });

  // Endpoint para buscar radares recentes (usado durante navegação para sincronização)
  fastify.get("/radars/recent", async (request, reply) => {
    const query = request.query as {
      since?: string; // Timestamp ISO para buscar radares desde uma data
    };

    try {
      const whereClause: any = {
        ativo: true, // Apenas radares ativos
      };

      // Se fornecido 'since', buscar apenas radares criados/atualizados após essa data
      if (query.since) {
        const sinceDate = new Date(query.since);
        if (!isNaN(sinceDate.getTime())) {
          whereClause.OR = [
            { createdAt: { gte: sinceDate } },
            { lastConfirmedAt: { gte: sinceDate } },
          ];
        }
      } else {
        // Se não fornecido 'since', buscar radares das últimas 24 horas
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);
        whereClause.OR = [
          { createdAt: { gte: yesterday } },
          { lastConfirmedAt: { gte: yesterday } },
        ];
      }

      const recentRadars = await prisma.radar.findMany({
        where: whereClause,
        orderBy: {
          createdAt: "desc",
        },
        take: 500, // Limitar a 500 radares mais recentes
      });

      fastify.log.info(
        `📊 ${recentRadars.length} radares recentes encontrados`
      );

      return {
        radars: recentRadars,
        count: recentRadars.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      fastify.log.error("Erro ao buscar radares recentes:", error);
      return reply.code(500).send({
        error: "Erro ao buscar radares recentes",
        details: error.message,
      });
    }
  });

  fastify.get("/radars", async (request, reply) => {
    const query = request.query as {
      route?: string;
      north?: string;
      south?: string;
      east?: string;
      west?: string;
      lat?: string;
      lon?: string;
      radius?: string;
      zoom?: string; // Zoom do mapa para otimização
      debug?: string; // Modo debug para retornar informações detalhadas
    };

    try {
      const forceRefresh =
        query.debug === "refresh" ||
        query.debug === "1" ||
        query.debug === "true";
      const shouldServeAll =
        Boolean(query.route) ||
        (Boolean(query.north) &&
          Boolean(query.south) &&
          Boolean(query.east) &&
          Boolean(query.west)) ||
        (Boolean(query.lat) && Boolean(query.lon));

      if (!shouldServeAll) return { radars: [] };

      if (query.route) {
        // Mantém compatibilidade de API (valida polyline), sem custo de filtro por rota
        const decoded = decodePolyline(query.route);
        if (decoded.length === 0) {
          return { radars: [] };
        }
      }

      const activeRadars = await getAllRadarsCached(forceRefresh);
      if (query.debug) {
        return {
          radars: activeRadars,
          meta: {
            total: activeRadars.length,
            cacheBuiltAt: radarCache.builtAt,
            cacheAgeMs: Date.now() - radarCache.builtAt,
            cacheVersion: radarCache.version,
          },
        };
      }
      return { radars: activeRadars };
    } catch (error: any) {
      fastify.log.error("Erro ao buscar radares:", error);
      return reply.code(500).send({
        error: "Erro ao buscar radares",
        details: error.message,
      });
    }
  });

  // POST /radars/report — alias para criar radar (usado pelo app e admin)
  fastify.post("/radars/report", async (request, reply) => {
    const body = request.body as {
      latitude: number;
      longitude: number;
      tipoRadar?: string;
      velocidadeLeve?: number;
      reportedBy?: string;
    };

    if (!body.latitude || !body.longitude) {
      return reply
        .code(400)
        .send({ error: "Latitude and longitude are required" });
    }

    if (
      body.velocidadeLeve !== undefined &&
      (body.velocidadeLeve < 0 || body.velocidadeLeve > 200)
    ) {
      return reply
        .code(400)
        .send({ error: "Velocidade deve estar entre 0 e 200 km/h" });
    }

    try {
      const radar = await prisma.radar.create({
        data: {
          latitude: body.latitude,
          longitude: body.longitude,
          confirms: 0,
          denies: 0,
          lastConfirmedAt: new Date(),
          source: "user",
          tipoRadar: body.tipoRadar || "reportado",
          velocidadeLeve: body.velocidadeLeve ?? null,
        },
      });

      try {
        const lastSyncFile = path.join(
          process.cwd(),
          "radarsFiles",
          ".last_sync_antt.json"
        );
        let lastSyncInfo: any = {
          lastModified: null,
          etag: null,
          contentHash: null,
          lastSyncDate: new Date().toISOString(),
          totalRadars: 0,
        };
        if (fs.existsSync(lastSyncFile)) {
          try {
            lastSyncInfo = JSON.parse(fs.readFileSync(lastSyncFile, "utf-8"));
            lastSyncInfo.lastSyncDate = new Date().toISOString();
          } catch (_) {}
        }
        const dir = path.dirname(lastSyncFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          lastSyncFile,
          JSON.stringify(lastSyncInfo, null, 2),
          "utf-8"
        );
      } catch (_) {}

      invalidateRadarCache();
      // Broadcast via WebSocket
      fastify.wsBroadcast("radar:new", {
        id: radar.id,
        latitude: radar.latitude,
        longitude: radar.longitude,
        velocidadeLeve: radar.velocidadeLeve,
        tipoRadar: radar.tipoRadar,
        situacao: radar.situacao,
      });

      return {
        radar: {
          id: radar.id,
          latitude: radar.latitude,
          longitude: radar.longitude,
          velocidadeLeve: radar.velocidadeLeve,
          tipoRadar: radar.tipoRadar,
        },
      };
    } catch (error: any) {
      console.error("Erro ao reportar radar:", error);
      return reply
        .code(500)
        .send({ error: "Erro ao reportar radar", details: error.message });
    }
  });

  fastify.post("/radars", async (request, reply) => {
    const body = request.body as {
      latitude: number;
      longitude: number;
      tipoRadar?: string; // "móvel" | "fixo"
      velocidadeLeve?: number;
    };

    if (!body.latitude || !body.longitude) {
      return reply
        .code(400)
        .send({ error: "Latitude and longitude are required" });
    }

    // Validar velocidade se fornecida
    if (body.velocidadeLeve !== undefined) {
      if (body.velocidadeLeve < 30 || body.velocidadeLeve > 110) {
        return reply
          .code(400)
          .send({ error: "Velocidade deve estar entre 30 e 110 km/h" });
      }
    }

    // Validar tipoRadar se fornecido (reportado, fixo, móvel, semaforo)
    const tiposValidos = ["móvel", "fixo", "reportado", "semaforo", "placa"];
    if (body.tipoRadar && !tiposValidos.includes(body.tipoRadar)) {
      return reply
        .code(400)
        .send({
          error:
            "tipoRadar deve ser 'reportado', 'fixo', 'móvel', 'semaforo' ou 'placa'",
        });
    }

    try {
      const radar = await prisma.radar.create({
        data: {
          latitude: body.latitude,
          longitude: body.longitude,
          confirms: 0, // Iniciar com 0 confirmações
          denies: 0, // Iniciar com 0 negações
          lastConfirmedAt: new Date(),
          source: "user", // Marcar como radar de usuário
          tipoRadar: body.tipoRadar || null,
          velocidadeLeve: body.velocidadeLeve || null,
        },
      });

      invalidateRadarCache();
      // Broadcast via WebSocket
      fastify.wsBroadcast("radar:new", {
        id: radar.id,
        latitude: radar.latitude,
        longitude: radar.longitude,
        velocidadeLeve: radar.velocidadeLeve,
        tipoRadar: radar.tipoRadar,
        situacao: radar.situacao,
      });

      // Atualizar data de sincronização quando um radar móvel é reportado
      try {
        const lastSyncFile = path.join(
          process.cwd(),
          "radarsFiles",
          ".last_sync_antt.json"
        );

        let lastSyncInfo: any = {
          lastModified: null,
          etag: null,
          contentHash: null,
          lastSyncDate: new Date().toISOString(),
          totalRadars: 0,
        };

        if (fs.existsSync(lastSyncFile)) {
          try {
            lastSyncInfo = JSON.parse(fs.readFileSync(lastSyncFile, "utf-8"));
            lastSyncInfo.lastSyncDate = new Date().toISOString();
          } catch (error) {
            // Ignorar erro, usar valores padrão
          }
        }

        const dir = path.dirname(lastSyncFile);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(
          lastSyncFile,
          JSON.stringify(lastSyncInfo, null, 2),
          "utf-8"
        );
      } catch (error) {
        // Ignorar erro ao atualizar sync info, não é crítico
        console.warn(
          "Erro ao atualizar informações de sync após reportar radar:",
          error
        );
      }

      return {
        id: radar.id,
        latitude: radar.latitude,
        longitude: radar.longitude,
        confirms: radar.confirms,
        denies: radar.denies,
        lastConfirmedAt: radar.lastConfirmedAt,
        tipoRadar: radar.tipoRadar,
        velocidadeLeve: radar.velocidadeLeve,
      };
    } catch (error: any) {
      console.error("Erro ao criar radar:", error);
      return reply
        .code(500)
        .send({ error: "Erro ao criar radar", details: error.message });
    }
  });

  // PATCH /radars/:id — atualizar radar (admin/editor: mover, limite, inativar)
  fastify.patch("/radars/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      latitude?: number;
      longitude?: number;
      velocidadeLeve?: number;
      situacao?: string;
    };

    try {
      const existing = await prisma.radar.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: "Radar not found" });
      }

      const data: Record<string, unknown> = {};
      if (body.latitude != null) data.latitude = body.latitude;
      if (body.longitude != null) data.longitude = body.longitude;
      if (body.velocidadeLeve != null)
        data.velocidadeLeve = body.velocidadeLeve;
      if (body.situacao != null) data.situacao = body.situacao;

      const radar = await prisma.radar.update({
        where: { id },
        data: data as any,
      });

      invalidateRadarCache();
      // Broadcast via WebSocket
      fastify.wsBroadcast("radar:update", {
        id: radar.id,
        latitude: radar.latitude,
        longitude: radar.longitude,
        velocidadeLeve: radar.velocidadeLeve,
        tipoRadar: radar.tipoRadar,
        situacao: radar.situacao,
      });

      return {
        id: radar.id,
        latitude: radar.latitude,
        longitude: radar.longitude,
        velocidadeLeve: radar.velocidadeLeve,
        situacao: radar.situacao,
      };
    } catch (error: any) {
      fastify.log.error(error);
      return reply
        .code(500)
        .send({ error: "Erro ao atualizar radar", details: error.message });
    }
  });

  // DELETE /radars/:id — deletar radar (admin/editor)
  fastify.delete("/radars/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const existing = await prisma.radar.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: "Radar not found" });
      }

      await prisma.radar.delete({ where: { id } });

      invalidateRadarCache();
      // Broadcast via WebSocket quando deletar
      fastify.wsBroadcast("radar:delete", {
        id: id,
      });

      return reply.code(204).send();
    } catch (error: any) {
      fastify.log.error(error);
      return reply
        .code(500)
        .send({ error: "Erro ao deletar radar", details: error.message });
    }
  });

  fastify.post("/radars/:id/confirm", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { userId?: string };

    if (!body.userId) {
      return reply.code(400).send({ error: "userId is required" });
    }

    const radar = await prisma.radar.findUnique({
      where: { id },
    });

    if (!radar) {
      return reply.code(404).send({ error: "Radar not found" });
    }

    // Verificar se o usuário já fez QUALQUER ação (confirm ou deny) - 1 por usuário/radar
    const existingAction = await prisma.userRadarAction.findFirst({
      where: {
        userId: body.userId,
        radarId: id,
      },
    });
    if (existingAction) {
      if (existingAction.action === "confirm") {
        return reply.code(400).send({
          error: "Você já confirmou este radar",
          alreadyConfirmed: true,
        });
      }
      return reply.code(400).send({
        error:
          "Você já negou este radar. Não é possível confirmar um radar que foi negado.",
        alreadyDenied: true,
      });
    }

    // Registrar a confirmação (1 ação por usuário/radar)
    try {
      await prisma.userRadarAction.create({
        data: {
          userId: body.userId,
          radarId: id,
          action: "confirm",
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        return reply.code(400).send({ error: "Você já reagiu a este radar", alreadyConfirmed: true });
      }
      throw e;
    }

    // Incrementar confirmações (preservar tipoRadar e outros campos)
    let updated = await prisma.radar.update({
      where: { id },
      data: {
        confirms: radar.confirms + 1,
        lastConfirmedAt: new Date(),
        // Preservar tipoRadar e outros campos importantes
        tipoRadar: radar.tipoRadar,
        velocidadeLeve: radar.velocidadeLeve,
        velocidadePesado: radar.velocidadePesado,
      },
    });

    // Regra de crowdsourcing:
    // 10 confirmações => manter/reativar radar automaticamente
    if (updated.confirms >= 10 && (!updated.ativo || updated.situacao !== "Ativo")) {
      updated = await prisma.radar.update({
        where: { id },
        data: {
          ativo: true,
          situacao: "Ativo",
        },
      });
    }

    invalidateRadarCache();
    fastify.wsBroadcast("radar:update", {
      id: updated.id,
      latitude: updated.latitude,
      longitude: updated.longitude,
      velocidadeLeve: updated.velocidadeLeve,
      tipoRadar: updated.tipoRadar,
      situacao: updated.situacao,
      ativo: updated.ativo,
      confirms: updated.confirms,
      denies: updated.denies,
    });

    return {
      id: updated.id,
      latitude: updated.latitude,
      longitude: updated.longitude,
      confirms: updated.confirms,
      denies: updated.denies,
      lastConfirmedAt: updated.lastConfirmedAt,
      tipoRadar: updated.tipoRadar, // Preservar tipoRadar na resposta
      velocidadeLeve: updated.velocidadeLeve,
      velocidadePesado: updated.velocidadePesado,
    };
  });

  fastify.post("/radars/:id/deny", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { userId?: string };

    if (!body.userId) {
      return reply.code(400).send({ error: "userId is required" });
    }

    const radar = await prisma.radar.findUnique({
      where: { id },
    });

    if (!radar) {
      return reply.code(404).send({ error: "Radar not found" });
    }

    // Verificar se o usuário já fez QUALQUER ação (confirm ou deny) - 1 por usuário/radar
    const existingAction = await prisma.userRadarAction.findFirst({
      where: {
        userId: body.userId,
        radarId: id,
      },
    });
    if (existingAction) {
      if (existingAction.action === "deny") {
        return reply.code(400).send({
          error: "Você já negou este radar",
          alreadyDenied: true,
        });
      }
      return reply.code(400).send({
        error:
          "Você já confirmou este radar. Não é possível negar um radar que foi confirmado.",
        alreadyConfirmed: true,
      });
    }

    // Registrar a negação (1 ação por usuário/radar)
    try {
      await prisma.userRadarAction.create({
        data: {
          userId: body.userId,
          radarId: id,
          action: "deny",
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        return reply.code(400).send({ error: "Você já reagiu a este radar", alreadyDenied: true });
      }
      throw e;
    }

    // Incrementar negações (preservar tipoRadar e outros campos)
    let updated = await prisma.radar.update({
      where: { id },
      data: {
        denies: radar.denies + 1,
        // Preservar tipoRadar e outros campos importantes
        tipoRadar: radar.tipoRadar,
        velocidadeLeve: radar.velocidadeLeve,
        velocidadePesado: radar.velocidadePesado,
      },
    });

    // Regra de crowdsourcing:
    // 5 negações => desativar radar automaticamente
    if (updated.denies >= 5 && (updated.ativo || updated.situacao !== "Inativo")) {
      updated = await prisma.radar.update({
        where: { id },
        data: {
          ativo: false,
          situacao: "Inativo",
        },
      });
    }

    invalidateRadarCache();
    fastify.wsBroadcast("radar:update", {
      id: updated.id,
      latitude: updated.latitude,
      longitude: updated.longitude,
      velocidadeLeve: updated.velocidadeLeve,
      tipoRadar: updated.tipoRadar,
      situacao: updated.situacao,
      ativo: updated.ativo,
      confirms: updated.confirms,
      denies: updated.denies,
    });

    return {
      id: updated.id,
      latitude: updated.latitude,
      longitude: updated.longitude,
      confirms: updated.confirms,
      denies: updated.denies,
      lastConfirmedAt: updated.lastConfirmedAt,
      tipoRadar: updated.tipoRadar, // Preservar tipoRadar na resposta
      velocidadeLeve: updated.velocidadeLeve,
      velocidadePesado: updated.velocidadePesado,
    };
  });

  // Endpoint para sincronizar radares das bases de dados públicas
  fastify.post("/radars/sync", async (request, reply) => {
    try {
      const result = await syncAllRadars();
      return {
        success: true,
        message: "Sincronização concluída com sucesso",
        ...result,
      };
    } catch (error: any) {
      console.error("Erro ao sincronizar radares:", error);
      return reply.code(500).send({
        success: false,
        error: "Erro ao sincronizar radares",
        details: error.message,
      });
    }
  });

  // Endpoint para votar na velocidade de um radar
  fastify.post("/radars/:id/vote-speed", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      userId: string;
      velocidadeLeve?: number;
      velocidadePesado?: number;
    };

    if (!body.userId) {
      return reply.code(400).send({ error: "userId is required" });
    }

    if (!body.velocidadeLeve && !body.velocidadePesado) {
      return reply.code(400).send({
        error: "Pelo menos uma velocidade (leve ou pesado) deve ser fornecida",
      });
    }

    // Validar velocidades (30-110 km/h)
    if (
      body.velocidadeLeve &&
      (body.velocidadeLeve < 30 || body.velocidadeLeve > 110)
    ) {
      return reply.code(400).send({
        error: "Velocidade leve deve estar entre 30 e 110 km/h",
      });
    }

    if (
      body.velocidadePesado &&
      (body.velocidadePesado < 30 || body.velocidadePesado > 110)
    ) {
      return reply.code(400).send({
        error: "Velocidade pesado deve estar entre 30 e 110 km/h",
      });
    }

    // Buscar radar para verificar se existe
    const radarExists = await prisma.radar.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!radarExists) {
      return reply.code(404).send({ error: "Radar not found" });
    }

    try {
      // Verificar se o usuário já votou neste radar
      // @ts-ignore - Prisma Client será regenerado após migration
      const existingVote = await (prisma as any).userRadarSpeedVote.findUnique({
        where: {
          userId_radarId: {
            userId: body.userId,
            radarId: id,
          },
        },
      });

      if (existingVote) {
        // Atualizar voto existente
        // @ts-ignore - Prisma Client será regenerado após migration
        await (prisma as any).userRadarSpeedVote.update({
          where: { id: existingVote.id },
          data: {
            velocidadeLeve: body.velocidadeLeve ?? existingVote.velocidadeLeve,
            velocidadePesado:
              body.velocidadePesado ?? existingVote.velocidadePesado,
          },
        });
      } else {
        // Criar novo voto
        // @ts-ignore - Prisma Client será regenerado após migration
        await (prisma as any).userRadarSpeedVote.create({
          data: {
            userId: body.userId,
            radarId: id,
            velocidadeLeve: body.velocidadeLeve ?? null,
            velocidadePesado: body.velocidadePesado ?? null,
          },
        });
      }

      // Buscar todos os votos para verificar se alguma velocidade atingiu 10 confirmações
      // @ts-ignore - Prisma Client será regenerado após migration
      const votes = await (prisma as any).userRadarSpeedVote.findMany({
        where: { radarId: id },
      });

      // Contar votos por velocidade leve
      const leveVotesMap = new Map<number, number>();
      votes.forEach((v: any) => {
        if (v.velocidadeLeve !== null) {
          const count = leveVotesMap.get(v.velocidadeLeve) || 0;
          leveVotesMap.set(v.velocidadeLeve, count + 1);
        }
      });

      // Encontrar velocidade leve mais votada
      let mostVotedLeve: number | null = null;
      let maxLeveVotes = 0;
      leveVotesMap.forEach((count, velocidade) => {
        if (count > maxLeveVotes) {
          maxLeveVotes = count;
          mostVotedLeve = velocidade;
        }
      });

      // Buscar radar completo para verificar velocidade original
      // @ts-ignore - Prisma Client será atualizado após migration
      const fullRadar = await (prisma as any).radar.findUnique({
        where: { id },
        select: {
          velocidadeOriginalLeve: true,
          velocidadeOriginalPesado: true,
        },
      });

      // Verificar se o radar tem velocidade original (do CSV)
      const hasOriginalLeve =
        fullRadar?.velocidadeOriginalLeve !== null &&
        fullRadar?.velocidadeOriginalLeve !== undefined;
      const hasOriginalPesado =
        fullRadar?.velocidadeOriginalPesado !== null &&
        fullRadar?.velocidadeOriginalPesado !== undefined;

      // Se a velocidade mais votada tem pelo menos 10 votos, atualizar o radar
      if (mostVotedLeve !== null && maxLeveVotes >= 10) {
        // Se o radar tem velocidade original, só atualizar se a velocidade votada for diferente
        if (hasOriginalLeve && fullRadar) {
          if (mostVotedLeve !== fullRadar.velocidadeOriginalLeve) {
            await prisma.radar.update({
              where: { id },
              data: {
                velocidadeLeve: mostVotedLeve,
              },
            });
            fastify.log.info(
              `✅ Velocidade leve atualizada de ${fullRadar.velocidadeOriginalLeve} para ${mostVotedLeve} km/h (${maxLeveVotes} votos)`
            );
          }
        } else {
          // Radar sem velocidade original (votada pelos usuários) - sempre atualizar
          await prisma.radar.update({
            where: { id },
            data: {
              velocidadeLeve: mostVotedLeve,
            },
          });
          fastify.log.info(
            `✅ Velocidade leve atualizada para ${mostVotedLeve} km/h (${maxLeveVotes} votos)`
          );
        }
      }

      // Contar votos por velocidade pesado
      const pesadoVotesMap = new Map<number, number>();
      votes.forEach((v: any) => {
        if (v.velocidadePesado !== null) {
          const count = pesadoVotesMap.get(v.velocidadePesado) || 0;
          pesadoVotesMap.set(v.velocidadePesado, count + 1);
        }
      });

      // Encontrar velocidade pesado mais votada
      let mostVotedPesado: number | null = null;
      let maxPesadoVotes = 0;
      pesadoVotesMap.forEach((count, velocidade) => {
        if (count > maxPesadoVotes) {
          maxPesadoVotes = count;
          mostVotedPesado = velocidade;
        }
      });

      // Se a velocidade mais votada tem pelo menos 10 votos, atualizar o radar
      if (mostVotedPesado !== null && maxPesadoVotes >= 10) {
        // Se o radar tem velocidade original, só atualizar se a velocidade votada for diferente
        if (hasOriginalPesado && fullRadar) {
          if (mostVotedPesado !== fullRadar.velocidadeOriginalPesado) {
            await prisma.radar.update({
              where: { id },
              data: {
                velocidadePesado: mostVotedPesado,
              },
            });
            fastify.log.info(
              `✅ Velocidade pesado atualizada de ${fullRadar.velocidadeOriginalPesado} para ${mostVotedPesado} km/h (${maxPesadoVotes} votos)`
            );
          }
        } else {
          // Radar sem velocidade original (votada pelos usuários) - sempre atualizar
          await prisma.radar.update({
            where: { id },
            data: {
              velocidadePesado: mostVotedPesado,
            },
          });
          fastify.log.info(
            `✅ Velocidade pesado atualizada para ${mostVotedPesado} km/h (${maxPesadoVotes} votos)`
          );
        }
      }

      // Buscar radar atualizado
      const updatedRadar = await prisma.radar.findUnique({
        where: { id },
      });

      return reply.code(200).send(updatedRadar);
    } catch (error: any) {
      fastify.log.error("Erro ao votar na velocidade:", error);
      return reply.code(500).send({
        error: "Erro ao votar na velocidade",
        details: error.message,
      });
    }
  });

  // Endpoint para obter estatísticas de votação de velocidade
  fastify.get("/radars/:id/speed-votes", async (request, reply) => {
    const { id } = request.params as { id: string };

    const radar = await prisma.radar.findUnique({
      where: { id },
    });

    if (!radar) {
      return reply.code(404).send({ error: "Radar not found" });
    }

    try {
      // @ts-ignore - Prisma Client será regenerado após migration
      const votes = await (prisma as any).userRadarSpeedVote.findMany({
        where: { radarId: id },
      });

      // Contar votos por velocidade leve
      const leveVotesMap = new Map<number, number>();
      votes.forEach((v: any) => {
        if (v.velocidadeLeve !== null) {
          const count = leveVotesMap.get(v.velocidadeLeve) || 0;
          leveVotesMap.set(v.velocidadeLeve, count + 1);
        }
      });

      // Contar votos por velocidade pesado
      const pesadoVotesMap = new Map<number, number>();
      votes.forEach((v: any) => {
        if (v.velocidadePesado !== null) {
          const count = pesadoVotesMap.get(v.velocidadePesado) || 0;
          pesadoVotesMap.set(v.velocidadePesado, count + 1);
        }
      });

      // Encontrar velocidade mais votada para leve
      let mostVotedLeve: number | null = null;
      let maxLeveVotes = 0;
      leveVotesMap.forEach((count, velocidade) => {
        if (count > maxLeveVotes) {
          maxLeveVotes = count;
          mostVotedLeve = velocidade;
        }
      });

      // Encontrar velocidade mais votada para pesado
      let mostVotedPesado: number | null = null;
      let maxPesadoVotes = 0;
      pesadoVotesMap.forEach((count, velocidade) => {
        if (count > maxPesadoVotes) {
          maxPesadoVotes = count;
          mostVotedPesado = velocidade;
        }
      });

      return reply.code(200).send({
        totalVotes: votes.length,
        leveVotes: Object.fromEntries(leveVotesMap),
        pesadoVotes: Object.fromEntries(pesadoVotesMap),
        mostVotedLeve,
        mostVotedPesado,
        maxLeveVotes,
        maxPesadoVotes,
      });
    } catch (error: any) {
      fastify.log.error("Erro ao obter estatísticas de votação:", error);
      return reply.code(500).send({
        error: "Erro ao obter estatísticas de votação",
        details: error.message,
      });
    }
  });

  // Endpoint para verificar se há atualizações disponíveis
  fastify.get("/radars/check-updates", async (request, reply) => {
    try {
      const updateCheck = await checkForUpdates();
      const lastSyncFile = path.join(
        process.cwd(),
        "radarsFiles",
        ".last_sync_antt.json"
      );

      let lastSyncInfo = null;
      if (fs.existsSync(lastSyncFile)) {
        try {
          lastSyncInfo = JSON.parse(fs.readFileSync(lastSyncFile, "utf-8"));
        } catch (error) {
          // Ignorar erro
        }
      }

      // Verificar se houve atualização recente no banco (últimas 24 horas)
      // Isso detecta importações manuais mesmo que o servidor remoto não tenha mudado
      // MAS só retornar hasUpdate: true se realmente houver uma atualização nova
      // (a comparação com a última sincronização do usuário será feita no app)
      let hasRecentUpdate = false;
      if (lastSyncInfo?.lastSyncDate) {
        const lastSyncDate = new Date(lastSyncInfo.lastSyncDate);
        const now = new Date();
        const hoursSinceSync =
          (now.getTime() - lastSyncDate.getTime()) / (1000 * 60 * 60);

        // Se houve sync nas últimas 24 horas, considerar como atualização disponível
        // O app vai comparar com a última sincronização do usuário para decidir se mostra o modal
        if (hoursSinceSync < 24) {
          hasRecentUpdate = true;
        }
      }

      // Se há atualização remota OU atualização recente local, retornar hasUpdate: true
      // O app vai verificar se o usuário já sincronizou após essa atualização
      const hasUpdate = updateCheck.hasUpdate || hasRecentUpdate;

      return {
        hasUpdate,
        lastModified: updateCheck.lastModified,
        lastSyncDate: lastSyncInfo?.lastSyncDate || null,
        totalRadars: lastSyncInfo?.totalRadars || 0,
        reason: hasUpdate
          ? updateCheck.hasUpdate
            ? updateCheck.reason
            : "atualização recente detectada"
          : updateCheck.reason,
      };
    } catch (error: any) {
      fastify.log.error("Erro ao verificar atualizações:", error);
      return reply.code(500).send({
        error: "Erro ao verificar atualizações",
        details: error.message,
      });
    }
  });

  // Endpoint para forçar sincronização
  fastify.post("/radars/sync-antt", async (request, reply) => {
    try {
      const result = await syncANTT();
      return {
        success: result.success,
        hasUpdate: result.hasUpdate,
        radarsProcessed: result.radarsProcessed,
        radarsCreated: result.radarsCreated,
        radarsUpdated: result.radarsUpdated,
        message: result.message,
      };
    } catch (error: any) {
      fastify.log.error("Erro ao sincronizar ANTT:", error);
      return reply.code(500).send({
        error: "Erro ao sincronizar ANTT",
        details: error.message,
      });
    }
  });

  // GET map radar do CSV (icons baseados em tipo)
  fastify.get("/radars/maparadar-csv", async (request, reply) => {
    try {
      const query = request.query as { reload?: string };
      const forceReload =
        query.reload === "1" ||
        (typeof query.reload === "string" &&
          query.reload.toLowerCase() === "true");
      const items = await parseMaparadarCSV(forceReload);
      const mapped = items.map((it, idx) => ({
        id: `csv-${idx}`,
        latitude: it.latitude,
        longitude: it.longitude,
        tipoRadar: it.tipoRadar,
        source: "maparadar-csv",
      }));
      return { radars: mapped };
    } catch (error: any) {
      fastify.log.error("Erro ao ler maparadar CSV:", error);
      return reply
        .code(500)
        .send({ error: "Erro ao ler maparadar CSV", details: error.message });
    }
  });

  // Admin pagination: list radares with page/limit
  fastify.get("/admin/radars", async (request, reply) => {
    // Admin simple check (header token)
    const token = (request.headers as any)["x-admin-token"];
    const expected = process.env.ADMIN_TOKEN;
    if (!token || !expected || token !== expected) {
      return reply.code(403).send({ error: "Admin access required" });
    }
    const query = request.query as {
      page?: string;
      limit?: string;
      status?: string;
    };
    const page = Math.max(1, parseInt(query.page ?? "1"));
    const limit = Math.max(1, parseInt(query.limit ?? "100"));
    const skip = (page - 1) * limit;
    const where: any = {};
    if (query.status) {
      const s = query.status.toLowerCase();
      if (s === "active") where.ativo = true;
      else if (s === "inactive") where.ativo = false;
    }
    try {
      const total = await prisma.radar.count({ where });
      const radars = await prisma.radar.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      });
      const totalPages = Math.ceil(total / limit);
      return {
        radars,
        pagination: { page, perPage: limit, total, totalPages },
      };
    } catch (err: any) {
      fastify.log.error("Erro em /admin/radars:", err);
      return reply.code(500).send({
        error: "Erro ao buscar radares (admin)",
        details: err.message,
      });
    }
  });
}

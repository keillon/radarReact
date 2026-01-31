import { FastifyInstance } from "fastify";
import { prisma } from "../utils/prisma";
import { decodePolyline } from "../utils/polyline";
import { pointToLineDistance, haversineDistance } from "../utils/distance";
import { syncAllRadars } from "../services/radarSources";
import { checkForUpdates, syncANTT } from "../scripts/syncANTTAuto";
import * as fs from "fs";
import * as path from "path";

// Chave da API Lufop para buscar radares do Brasil
const LUFOP_API_KEY = "e04fe8cac3c839f4ae32c9c999dc4a4b";

/**
 * Buscar radares da API Lufop
 */
async function fetchRadarsFromLufop(
  lat: number,
  lon: number,
  radiusKm: number = 500
): Promise<any[]> {
  try {
    // Endpoint correto da API Lufop: https://api.lufop.net/api
    // Parâmetros: key, format=json, nbr=100, pays=br
    // Limitar a 1000 resultados (máximo recomendado)
    const maxResults = 1000;
    const url = `https://api.lufop.net/api?key=${LUFOP_API_KEY}&format=json&nbr=${maxResults}&pays=br`;

    console.log(`🔍 [Lufop] Buscando radares: ${url.substring(0, 80)}...`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `❌ [Lufop] Erro na requisição: ${
          response.status
        } - ${errorText.substring(0, 200)}`
      );
      return [];
    }

    const data: any = await response.json();
    console.log(
      `✅ [Lufop] Resposta recebida: ${
        Array.isArray(data) ? data.length : "formato desconhecido"
      } radares`
    );

    // A API retorna um array direto de radares
    if (Array.isArray(data)) {
      // Retornar TODOS os radares do Brasil (SEM NENHUM FILTRO DE DISTÂNCIA)
      const processedRadars = processLufopRadars(data);
      console.log(
        `✅ [Lufop] ${processedRadars.length} radares processados do Brasil (TODOS, sem filtro)`
      );
      return processedRadars;
    }

    console.log(`⚠️ [Lufop] Formato de resposta não reconhecido`);
    return [];
  } catch (error: any) {
    console.error("❌ [Lufop] Erro ao buscar radares:", error);
    return [];
  }
}

/**
 * Processar radares da Lufop e converter para formato padrão
 * Formato da API: { ID, name, lat, lng, type, commune, voie, vitesse, pays, dept, update, ... }
 */
function processLufopRadars(radars: any[]): any[] {
  return radars
    .map((radar: any) => {
      // Formato da API Lufop: lat, lng (não latitude/longitude)
      const lat = radar.lat;
      const lon = radar.lng;

      if (!lat || !lon) {
        return null;
      }

      // Extrair velocidade (pode ser string vazia ou número)
      let velocidadeLeve: number | null = null;
      if (radar.vitesse) {
        const speedStr = String(radar.vitesse).trim();
        if (speedStr && speedStr !== "") {
          const speedNum = parseInt(speedStr);
          if (!isNaN(speedNum) && speedNum > 0) {
            velocidadeLeve = speedNum;
          }
        }
      }

      // Extrair estado do campo dept (ex: "88 - Santa Catarina" -> "SC")
      let uf: string | null = null;
      if (radar.dept) {
        const deptStr = String(radar.dept);
        // Tentar extrair sigla do estado ou usar o nome completo
        const estadoMap: Record<string, string> = {
          "Santa Catarina": "SC",
          "Rio de Janeiro": "RJ",
          "São Paulo": "SP",
          "Minas Gerais": "MG",
          Goiás: "GO",
          "District fédéral": "DF",
        };

        for (const [nome, sigla] of Object.entries(estadoMap)) {
          if (deptStr.includes(nome)) {
            uf = sigla;
            break;
          }
        }

        if (!uf) {
          uf = deptStr.split(" - ")[1] || deptStr;
        }
      }

      return {
        id: radar.ID || `lufop-${lat}-${lon}`,
        latitude: parseFloat(lat),
        longitude: parseFloat(lon),
        source: "lufop",
        confirms: 0,
        denies: 0,
        lastConfirmedAt: radar.update ? new Date(radar.update) : new Date(),
        createdAt: radar.update ? new Date(radar.update) : new Date(),
        velocidadeLeve: velocidadeLeve,
        velocidadePesado: null,
        tipoRadar: radar.typeradar || "fixo",
        rodovia: radar.voie || null,
        uf: uf,
        municipio: radar.commune || null,
        km: null,
        sentido: null,
        situacao: "Ativo",
        concessionaria: null,
        // Metadados adicionais da Lufop
        metadata: {
          lufopId: radar.ID,
          lufopName: radar.name,
          lufopType: radar.type,
          lufopUpdate: radar.update,
        },
      };
    })
    .filter((r: any) => r !== null);
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

      fastify.log.info(`📊 ${recentRadars.length} radares recentes encontrados`);

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
      // Buscar por rota (polyline)
      if (query.route) {
        const polyline = query.route;
        const coordinates = decodePolyline(polyline);

        if (coordinates.length === 0) {
          return { radars: [] };
        }

        // Buscar TODOS os radares do banco (SEM NENHUM FILTRO)
        fastify.log.info(
          `📊 Buscando TODOS os radares do banco (SEM NENHUM FILTRO)...`
        );

        const allRadars = await prisma.radar.findMany({
          // SEM WHERE - buscar TODOS os radares
        });

        fastify.log.info(`📊 Total de radares no banco: ${allRadars.length}`);

        // NÃO FILTRAR POR DISTÂNCIA DA ROTA - Retornar TODOS os radares
        const activeRadars = allRadars;

        fastify.log.info(
          `✅ Radares encontrados: ${activeRadars.length} (Públicos: ${
            activeRadars.filter((r) => r.source && r.source !== "user").length
          }, Móveis: ${
            activeRadars.filter((r) => r.tipoRadar === "móvel").length
          }, Fixos: ${
            activeRadars.filter((r) => r.tipoRadar === "fixo").length
          })`
        );

        const response: any = {
          radars: activeRadars,
        };

        const serializeTime = Date.now();
        const responseSize = JSON.stringify(response).length;
        const responseSizeMB = (responseSize / 1024 / 1024).toFixed(2);

        fastify.log.info(
          `✅ Serialização concluída: ${activeRadars.length} radares (${responseSizeMB} MB)`
        );

        return response;
      }

      // Buscar por bounding box
      if (query.north && query.south && query.east && query.west) {
        // Buscar TODOS os radares do banco (SEM NENHUM FILTRO)
        fastify.log.info(
          `📊 Buscando TODOS os radares do banco (SEM NENHUM FILTRO)...`
        );

        const allRadars = await prisma.radar.findMany({
          // SEM WHERE - buscar TODOS os radares
        });

        // NÃO FILTRAR POR BOUNDING BOX - Retornar TODOS os radares
        const activeRadars = allRadars;

        fastify.log.info(
          `✅ Radares encontrados: ${activeRadars.length} (Públicos: ${
            activeRadars.filter((r) => r.source && r.source !== "user").length
          }, Móveis: ${
            activeRadars.filter((r) => r.tipoRadar === "móvel").length
          }, Fixos: ${
            activeRadars.filter((r) => r.tipoRadar === "fixo").length
          })`
        );

        const response: any = {
          radars: activeRadars,
        };

        const serializeTime = Date.now();
        const responseSize = JSON.stringify(response).length;
        const responseSizeMB = (responseSize / 1024 / 1024).toFixed(2);

        fastify.log.info(
          `✅ Serialização concluída: ${activeRadars.length} radares (${responseSizeMB} MB)`
        );

        return response;
      }

      // Buscar por coordenadas e raio
      if (query.lat && query.lon) {
        const centerLat = parseFloat(query.lat);
        const centerLon = parseFloat(query.lon);
        const radius = query.radius ? parseFloat(query.radius) : 500; // Raio padrão de 500km para buscar todos

        fastify.log.info(
          `📊 Buscando TODOS os radares do banco (SEM NENHUM FILTRO DE DISTÂNCIA)...`
        );

        // Buscar TODOS os radares do banco (SEM NENHUM FILTRO)
        const allRadars = await prisma.radar.findMany({
          // SEM WHERE - buscar TODOS os radares
        });

        fastify.log.info(`📊 Total de radares no banco: ${allRadars.length}`);

        // NÃO FILTRAR POR DISTÂNCIA - Retornar TODOS os radares do banco
        const dbRadars = allRadars;

        // Buscar radares da API Lufop
        fastify.log.info(
          `🔍 Buscando radares da API Lufop (lat=${centerLat}, lon=${centerLon}, radius=${radius}km)...`
        );
        let lufopRadars: any[] = [];
        try {
          lufopRadars = await fetchRadarsFromLufop(
            centerLat,
            centerLon,
            radius
          );
          fastify.log.info(
            `✅ ${lufopRadars.length} radares encontrados da API Lufop`
          );
        } catch (error: any) {
          fastify.log.error(`❌ Erro ao buscar da Lufop:`, error);
        }

        // Combinar radares do banco com radares da Lufop
        // Usar Set para evitar duplicatas baseado em lat/lon
        const radarMap = new Map<string, any>();

        // Adicionar radares do banco
        dbRadars.forEach((radar) => {
          const key = `${radar.latitude.toFixed(6)}-${radar.longitude.toFixed(
            6
          )}`;
          radarMap.set(key, radar);
        });

        // Adicionar radares da Lufop (não sobrescrever se já existir do banco)
        lufopRadars.forEach((radar) => {
          const key = `${radar.latitude.toFixed(6)}-${radar.longitude.toFixed(
            6
          )}`;
          if (!radarMap.has(key)) {
            radarMap.set(key, radar);
          }
        });

        const activeRadars = Array.from(radarMap.values());

        fastify.log.info(
          `🔍 Buscando radares próximos: lat=${centerLat}, lon=${centerLon}, radius=${radius}km`
        );
        fastify.log.info(
          `📊 Total de radares encontrados: ${activeRadars.length}`
        );

        // Log detalhado
        const publicRadars = activeRadars.filter(
          (r) => r.source && r.source !== "user"
        );
        const mobileRadars = activeRadars.filter(
          (r) => r.tipoRadar === "móvel"
        );
        const fixedRadars = activeRadars.filter((r) => r.tipoRadar === "fixo");

        fastify.log.info(
          `✅ Radares encontrados: ${activeRadars.length} (Públicos: ${publicRadars.length}, Móveis: ${mobileRadars.length}, Fixos: ${fixedRadars.length})`
        );

        const response: any = {
          radars: activeRadars,
        };

        const serializeTime = Date.now();
        const responseSize = JSON.stringify(response).length;
        const responseSizeMB = (responseSize / 1024 / 1024).toFixed(2);

        fastify.log.info(
          `🔄 Iniciando serialização de ${activeRadars.length} radares...`
        );

        // Log de amostra de coordenadas para debug
        if (activeRadars.length > 0) {
          fastify.log.info(
            `🔍 [Backend] Amostra de coordenadas (primeiros 5 radares):`
          );
          activeRadars.slice(0, 5).forEach((radar, index) => {
            fastify.log.info(
              `  [${index}] ID: ${radar.id}, Lat: ${radar.latitude}, Lon: ${radar.longitude}`
            );
          });
        }

        fastify.log.info(
          `✅ Serialização concluída: ${activeRadars.length} radares em ${
            Date.now() - serializeTime
          }ms (${responseSizeMB} MB)`
        );

        return response;
      }

      // Se não há parâmetros, retornar vazio
      return { radars: [] };
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

    if (body.velocidadeLeve !== undefined && (body.velocidadeLeve < 0 || body.velocidadeLeve > 200)) {
      return reply.code(400).send({ error: "Velocidade deve estar entre 0 e 200 km/h" });
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
        const lastSyncFile = path.join(process.cwd(), "radarsFiles", ".last_sync_antt.json");
        let lastSyncInfo: any = { lastModified: null, etag: null, contentHash: null, lastSyncDate: new Date().toISOString(), totalRadars: 0 };
        if (fs.existsSync(lastSyncFile)) {
          try {
            lastSyncInfo = JSON.parse(fs.readFileSync(lastSyncFile, "utf-8"));
            lastSyncInfo.lastSyncDate = new Date().toISOString();
          } catch (_) {}
        }
        const dir = path.dirname(lastSyncFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(lastSyncFile, JSON.stringify(lastSyncInfo, null, 2), "utf-8");
      } catch (_) {}

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
      return reply.code(500).send({ error: "Erro ao reportar radar", details: error.message });
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

    // Validar tipoRadar se fornecido
    if (body.tipoRadar && !["móvel", "fixo"].includes(body.tipoRadar)) {
      return reply
        .code(400)
        .send({ error: "tipoRadar deve ser 'móvel' ou 'fixo'" });
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
      if (body.velocidadeLeve != null) data.velocidadeLeve = body.velocidadeLeve;
      if (body.situacao != null) data.situacao = body.situacao;

      const radar = await prisma.radar.update({
        where: { id },
        data: data as any,
      });

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

    // Verificar se o usuário já fez QUALQUER ação (confirm ou deny) - mutuamente exclusivo
    // TODO: Reativar quando Prisma Client for regenerado
    let existingConfirm = null;
    let existingDeny = null;
    try {
      if (prisma.userRadarAction) {
        // Verificar confirmação
        existingConfirm = await prisma.userRadarAction.findUnique({
          where: {
            userId_radarId_action: {
              userId: body.userId,
              radarId: id,
              action: "confirm",
            },
          },
        });

        if (existingConfirm) {
          return reply.code(400).send({
            error: "Você já confirmou este radar",
            alreadyConfirmed: true,
          });
        }

        // Verificar negação - se já negou, não pode confirmar (mutuamente exclusivo)
        existingDeny = await prisma.userRadarAction.findUnique({
          where: {
            userId_radarId_action: {
              userId: body.userId,
              radarId: id,
              action: "deny",
            },
          },
        });

        if (existingDeny) {
          return reply.code(400).send({
            error:
              "Você já negou este radar. Não é possível confirmar um radar que foi negado.",
            alreadyDenied: true,
          });
        }
      }
    } catch (error) {
      // Prisma Client não regenerado ainda, continuar sem verificação
      console.warn(
        "⚠️ userRadarAction não disponível, pulando verificação:",
        error
      );
    }

    // Registrar a confirmação
    try {
      if (prisma.userRadarAction) {
        await prisma.userRadarAction.create({
          data: {
            userId: body.userId,
            radarId: id,
            action: "confirm",
          },
        });
      }
    } catch (error) {
      // Prisma Client não regenerado ainda, continuar sem registro
      console.warn(
        "⚠️ userRadarAction não disponível, pulando registro:",
        error
      );
    }

    // Incrementar confirmações (preservar tipoRadar e outros campos)
    const updated = await prisma.radar.update({
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

    // Verificar se o usuário já fez QUALQUER ação (confirm ou deny) - mutuamente exclusivo
    // TODO: Reativar quando Prisma Client for regenerado
    let existingConfirm = null;
    let existingDeny = null;
    try {
      if (prisma.userRadarAction) {
        // Verificar negação
        existingDeny = await prisma.userRadarAction.findUnique({
          where: {
            userId_radarId_action: {
              userId: body.userId,
              radarId: id,
              action: "deny",
            },
          },
        });

        if (existingDeny) {
          return reply.code(400).send({
            error: "Você já negou este radar",
            alreadyDenied: true,
          });
        }

        // Verificar confirmação - se já confirmou, não pode negar (mutuamente exclusivo)
        existingConfirm = await prisma.userRadarAction.findUnique({
          where: {
            userId_radarId_action: {
              userId: body.userId,
              radarId: id,
              action: "confirm",
            },
          },
        });

        if (existingConfirm) {
          return reply.code(400).send({
            error:
              "Você já confirmou este radar. Não é possível negar um radar que foi confirmado.",
            alreadyConfirmed: true,
          });
        }
      }
    } catch (error) {
      // Prisma Client não regenerado ainda, continuar sem verificação
      console.warn(
        "⚠️ userRadarAction não disponível, pulando verificação:",
        error
      );
    }

    // Registrar a negação
    try {
      if (prisma.userRadarAction) {
        await prisma.userRadarAction.create({
          data: {
            userId: body.userId,
            radarId: id,
            action: "deny",
          },
        });
      }
    } catch (error) {
      // Prisma Client não regenerado ainda, continuar sem registro
      console.warn(
        "⚠️ userRadarAction não disponível, pulando registro:",
        error
      );
    }

    // Incrementar negações (preservar tipoRadar e outros campos)
    const updated = await prisma.radar.update({
      where: { id },
      data: {
        denies: radar.denies + 1,
        // Preservar tipoRadar e outros campos importantes
        tipoRadar: radar.tipoRadar,
        velocidadeLeve: radar.velocidadeLeve,
        velocidadePesado: radar.velocidadePesado,
      },
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
}

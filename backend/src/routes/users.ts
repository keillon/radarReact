import { FastifyInstance } from "fastify";
import { prisma } from "../utils/prisma";
import { haversineDistance } from "../utils/distance";

// Tempo máximo para considerar posição válida (60 segundos)
const MAX_POSITION_AGE_MS = 60 * 1000;

// Limpar posições antigas periodicamente
let cleanupInterval: NodeJS.Timeout | null = null;

async function cleanupOldPositions() {
  try {
    const cutoffTime = new Date(Date.now() - MAX_POSITION_AGE_MS);
    const result = await prisma.userPosition.deleteMany({
      where: {
        updatedAt: {
          lt: cutoffTime,
        },
      },
    });
    if (result.count > 0) {
      console.log(`🧹 Limpeza: ${result.count} posições antigas removidas`);
    }
  } catch (error: any) {
    // Ignorar erro se a tabela não existir (P2021), problema de conexão (P1001) ou permissão negada
    if (
      error?.code === "P2021" ||
      error?.code === "P1001" ||
      error?.message?.includes("was denied access") ||
      error?.message?.includes("permission denied")
    ) {
      // Silenciosamente ignorar - tabela pode não existir, banco não conectado ou sem permissão
      return;
    }
    // Log apenas para outros erros não esperados
    console.error("❌ Erro ao limpar posições antigas:", error?.message || error);
  }
}

export async function userRoutes(fastify: FastifyInstance) {
  // Iniciar limpeza automática a cada 30 segundos
  if (!cleanupInterval) {
    cleanupInterval = setInterval(cleanupOldPositions, 30000);
    // Limpar imediatamente ao iniciar
    cleanupOldPositions();
  }

  // Atualizar posição do usuário
  fastify.post("/users/position", async (request, reply) => {
    try {
      const body = request.body as {
        userId: string;
        latitude: number;
        longitude: number;
        bearing?: number; // Direção em graus (0-360)
        speed?: number; // Velocidade em km/h
        accuracy?: number; // Precisão do GPS em metros
      };

      if (
        !body.userId ||
        body.latitude === undefined ||
        body.longitude === undefined
      ) {
        return reply.code(400).send({
          error: "userId, latitude e longitude são obrigatórios",
        });
      }

      // Validar coordenadas
      if (
        body.latitude < -90 ||
        body.latitude > 90 ||
        body.longitude < -180 ||
        body.longitude > 180
      ) {
        return reply.code(400).send({
          error: "Coordenadas inválidas",
        });
      }

      // Validar bearing (0-360)
      if (
        body.bearing !== undefined &&
        (body.bearing < 0 || body.bearing > 360)
      ) {
        return reply.code(400).send({
          error: "Bearing deve estar entre 0 e 360 graus",
        });
      }

      // Upsert: atualizar se existe, criar se não existe
      const position = await prisma.userPosition.upsert({
        where: {
          userId: body.userId,
        },
        update: {
          latitude: body.latitude,
          longitude: body.longitude,
          bearing: body.bearing ?? null,
          speed: body.speed ?? null,
          accuracy: body.accuracy ?? null,
          updatedAt: new Date(),
        },
        create: {
          userId: body.userId,
          latitude: body.latitude,
          longitude: body.longitude,
          bearing: body.bearing ?? null,
          speed: body.speed ?? null,
          accuracy: body.accuracy ?? null,
        },
      });

      return {
        success: true,
        position: {
          userId: position.userId,
          latitude: position.latitude,
          longitude: position.longitude,
          bearing: position.bearing,
          speed: position.speed,
          accuracy: position.accuracy,
          updatedAt: position.updatedAt,
        },
      };
    } catch (error: any) {
      fastify.log.error("Erro ao atualizar posição:", error);
      return reply.code(500).send({
        error: "Erro ao atualizar posição",
        details: error.message,
      });
    }
  });

  // Buscar usuários próximos
  fastify.get("/users/nearby", async (request, reply) => {
    try {
      const query = request.query as {
        lat: string;
        lon: string;
        radius?: string; // Raio em metros (padrão: 5000m = 5km)
        excludeUserId?: string; // Excluir próprio usuário
      };

      if (!query.lat || !query.lon) {
        return reply.code(400).send({
          error: "lat e lon são obrigatórios",
        });
      }

      const latitude = parseFloat(query.lat);
      const longitude = parseFloat(query.lon);
      const radius = query.radius ? parseFloat(query.radius) : 5000; // 5km padrão
      const excludeUserId = query.excludeUserId;

      // Validar coordenadas
      if (
        isNaN(latitude) ||
        isNaN(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return reply.code(400).send({
          error: "Coordenadas inválidas",
        });
      }

      // Buscar todas as posições recentes (últimos 60 segundos)
      const cutoffTime = new Date(Date.now() - MAX_POSITION_AGE_MS);
      const allPositions = await prisma.userPosition.findMany({
        where: {
          updatedAt: {
            gte: cutoffTime,
          },
          ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
        },
        orderBy: {
          updatedAt: "desc", // Ordenar por mais recente primeiro
        },
      });

      // Log para debug
      fastify.log.info(
        `🔍 [Users] Buscando usuários próximos: ${
          allPositions.length
        } posições encontradas (últimos 60s), excluindo: ${
          excludeUserId || "ninguém"
        }`
      );

      // Filtrar por distância (usando Haversine)
      const nearbyUsers = allPositions
        .map((position) => {
          const distance = haversineDistance(
            latitude,
            longitude,
            position.latitude,
            position.longitude
          );
          return {
            ...position,
            distance,
          };
        })
        .filter((user) => user.distance <= radius)
        .sort((a, b) => a.distance - b.distance) // Ordenar por distância
        .slice(0, 100) // Limitar a 100 usuários mais próximos
        .map(({ distance, ...position }) => ({
          userId: position.userId,
          latitude: position.latitude,
          longitude: position.longitude,
          bearing: position.bearing,
          speed: position.speed,
          accuracy: position.accuracy,
          updatedAt: position.updatedAt,
          distance: Math.round(distance), // Distância em metros
        }));

      // Log para debug
      fastify.log.info(
        `✅ [Users] Retornando ${nearbyUsers.length} usuários próximos (raio: ${radius}m, total posições: ${allPositions.length})`
      );

      return {
        users: nearbyUsers,
        count: nearbyUsers.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      fastify.log.error("Erro ao buscar usuários próximos:", error);
      return reply.code(500).send({
        error: "Erro ao buscar usuários próximos",
        details: error.message,
      });
    }
  });

  // Remover posição do usuário (quando para de navegar)
  fastify.delete("/users/position/:userId", async (request, reply) => {
    try {
      const params = request.params as { userId: string };

      await prisma.userPosition.delete({
        where: {
          userId: params.userId,
        },
      });

      return {
        success: true,
        message: "Posição removida",
      };
    } catch (error: any) {
      // Se não encontrar, não é erro crítico
      if (error.code === "P2025") {
        return {
          success: true,
          message: "Posição não encontrada (já removida)",
        };
      }

      fastify.log.error("Erro ao remover posição:", error);
      return reply.code(500).send({
        error: "Erro ao remover posição",
        details: error.message,
      });
    }
  });
}

import { FastifyInstance } from "fastify";
import { prisma } from "../utils/prisma";

// Expo Push Notification Service URL
// Esta é a URL pública oficial da Expo - não precisa estar no .env
// Mas pode ser sobrescrita via variável de ambiente se necessário
const EXPO_PUSH_URL =
  process.env.EXPO_PUSH_URL || "https://exp.host/--/api/v2/push/send";

interface SendNotificationBody {
  title: string;
  body: string;
  data?: any;
  to?: "all" | string[]; // "all" para todos ou array de tokens específicos
}

/**
 * Envia notificação via Expo Push Notification Service
 */
async function sendPushNotification(
  tokens: string[],
  title: string,
  body: string,
  data?: any
): Promise<void> {
  const messages = tokens.map((token) => ({
    to: token,
    sound: "default",
    title,
    body,
    data: data || {},
    priority: "high",
    channelId: "default",
  }));

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Expo Push API error: ${errorText}`);
    }

    const result = (await response.json()) as {
      data?: Array<{
        status: string;
        message?: string;
      }>;
    };
    console.log("Push notification sent:", JSON.stringify(result, null, 2));

    // Verificar se há erros na resposta
    if (Array.isArray(result.data)) {
      result.data.forEach((item, index: number) => {
        if (item.status === "error") {
          console.error(`Erro ao enviar para token ${index}:`, item.message);
        } else {
          console.log(`✅ Notificação enviada com sucesso para token ${index}`);
        }
      });
    }
  } catch (error) {
    console.error("Erro ao enviar push notification:", error);
    throw error;
  }
}

export async function notificationRoutes(fastify: FastifyInstance) {
  // Registrar token do dispositivo
  fastify.post("/notifications/register", async (request, reply) => {
    const body = request.body as { token: string; platform?: string };
    const clientIp =
      request.ip || request.headers["x-forwarded-for"] || "desconhecido";

    console.log("═══════════════════════════════════════════════════════");
    console.log("📥 NOVA TENTATIVA DE REGISTRO DE TOKEN");
    console.log("═══════════════════════════════════════════════════════");
    console.log("   IP do cliente:", clientIp);
    console.log(
      "   Token recebido:",
      body.token ? body.token.substring(0, 40) + "..." : "❌ VAZIO"
    );
    console.log("   Tamanho do token:", body.token?.length || 0);
    console.log("   Plataforma:", body.platform || "não informada");
    console.log("   Timestamp:", new Date().toISOString());

    if (!body.token || body.token.trim().length === 0) {
      console.error("❌ ERRO: Token vazio ou inválido");
      console.log("═══════════════════════════════════════════════════════");
      return reply.code(400).send({
        error: "Token is required",
        received: body.token ? "Token presente mas vazio" : "Token não enviado",
      });
    }

    const token = body.token.trim();

    try {
      // Verificar se o token já existe
      console.log("🔍 Verificando se token já existe no banco...");
      const existing = await prisma.deviceToken.findUnique({
        where: { token: token },
      });

      if (existing) {
        console.log("✅ Token já existe no banco!");
        console.log("   ID existente:", existing.id);
        console.log("   Criado em:", existing.createdAt);
        console.log("   Última atualização:", existing.updatedAt);

        // Atualizar data de atualização
        const updated = await prisma.deviceToken.update({
          where: { token: token },
          data: {
            updatedAt: new Date(),
            platform: body.platform || existing.platform,
          },
        });

        console.log("✅ Token atualizado com sucesso!");
        console.log("   Novo updatedAt:", updated.updatedAt);
        console.log("   Nova plataforma:", updated.platform);
        console.log("═══════════════════════════════════════════════════════");

        return {
          success: true,
          message: "Token atualizado",
          id: updated.id,
          action: "updated",
        };
      }

      console.log("➕ Token não existe, criando novo registro...");
      // Criar novo token
      const created = await prisma.deviceToken.create({
        data: {
          token: token,
          platform: body.platform || null,
        },
      });

      console.log("✅✅✅ NOVO TOKEN CRIADO COM SUCESSO!");
      console.log("   ID:", created.id);
      console.log(
        "   Token (primeiros 40 chars):",
        created.token.substring(0, 40) + "..."
      );
      console.log("   Plataforma:", created.platform);
      console.log("   Criado em:", created.createdAt);
      console.log("═══════════════════════════════════════════════════════");

      return {
        success: true,
        message: "Token registrado com sucesso",
        id: created.id,
        action: "created",
      };
    } catch (error: any) {
      console.error("═══════════════════════════════════════════════════════");
      console.error("❌❌❌ ERRO AO REGISTRAR TOKEN");
      console.error("═══════════════════════════════════════════════════════");
      console.error("   Tipo do erro:", error?.name || "Unknown");
      console.error("   Mensagem:", error?.message || "Sem mensagem");
      console.error("   Código:", error?.code || "Sem código");
      console.error("   Stack:", error?.stack || "Sem stack");
      console.error("═══════════════════════════════════════════════════════");

      return reply.code(500).send({
        error: "Erro ao registrar token",
        details: error?.message,
        code: error?.code,
      });
    }
  });

  // Enviar notificação (endpoint admin)
  fastify.post("/admin/notifications/send", async (request, reply) => {
    const body = request.body as SendNotificationBody;

    if (!body.title || !body.body) {
      return reply.code(400).send({ error: "Title and body are required" });
    }

    try {
      let tokens: string[] = [];

      if (body.to === "all" || !body.to) {
        // Buscar todos os tokens
        const allTokens = await prisma.deviceToken.findMany({
          select: { token: true },
        });
        tokens = allTokens.map((t: { token: string }) => t.token);
      } else if (Array.isArray(body.to)) {
        // Usar tokens específicos
        tokens = body.to;
      }

      if (tokens.length === 0) {
        return reply.code(400).send({ error: "Nenhum dispositivo registrado" });
      }

      // Enviar notificação
      await sendPushNotification(tokens, body.title, body.body, body.data);

      return {
        success: true,
        message: `Notificação enviada para ${tokens.length} dispositivo(s)`,
        sentTo: tokens.length,
      };
    } catch (error: any) {
      console.error("Erro ao enviar notificação:", error);
      return reply.code(500).send({ error: "Erro ao enviar notificação" });
    }
  });

  // Listar todos os tokens registrados (endpoint admin)
  fastify.get("/admin/notifications/tokens", async (request, reply) => {
    try {
      const tokens = await prisma.deviceToken.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          token: true,
          platform: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        success: true,
        count: tokens.length,
        tokens,
      };
    } catch (error: any) {
      console.error("Erro ao listar tokens:", error);
      return reply.code(500).send({ error: "Erro ao listar tokens" });
    }
  });

  // Remover token (endpoint admin)
  fastify.delete("/admin/notifications/tokens/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      await prisma.deviceToken.delete({
        where: { id },
      });

      return { success: true, message: "Token removido com sucesso" };
    } catch (error: any) {
      console.error("Erro ao remover token:", error);
      return reply.code(500).send({ error: "Erro ao remover token" });
    }
  });
}

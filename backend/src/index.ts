import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { radarRoutes } from "./routes/radars";
import { notificationRoutes } from "./routes/notifications";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";

const fastify = Fastify({ logger: true });

// Armazenar conexões WebSocket ativas
type WsClient = {
  socket: any;
  id: string;
  isAlive: boolean;
  connectedAt: number;
};
const activeConnections = new Map<string, WsClient>();
const WS_HEARTBEAT_INTERVAL_MS = 25_000;

declare module "fastify" {
  interface FastifyInstance {
    wsBroadcast: (event: string, data: any) => void;
  }
}

async function start() {
  // Registrar CORS primeiro
  await fastify.register(cors, {
    origin: true,
  });

  // Registrar WebSocket plugin
  await fastify.register(websocket);

  // Função helper para broadcast para todos os clientes conectados
  fastify.decorate("wsBroadcast", (event: string, data: any) => {
    const message = JSON.stringify({ event, data });
    activeConnections.forEach((client, clientId) => {
      try {
        if (client.socket.readyState === 1) {
          client.socket.send(message);
        } else {
          activeConnections.delete(clientId);
        }
      } catch (error) {
        fastify.log.error({ error }, "Error sending WebSocket message");
        activeConnections.delete(clientId);
      }
    });
  });

  // Heartbeat para remover conexões zumbi e escalar melhor com muitos usuários
  const heartbeatTimer = setInterval(() => {
    activeConnections.forEach((client, clientId) => {
      try {
        if (!client.isAlive) {
          activeConnections.delete(clientId);
          try {
            client.socket.terminate?.();
          } catch {}
          return;
        }
        client.isAlive = false;
        if (client.socket.readyState === 1) {
          client.socket.ping?.();
        }
      } catch (error) {
        fastify.log.error({ error }, "WebSocket heartbeat error");
        activeConnections.delete(clientId);
      }
    });
  }, WS_HEARTBEAT_INTERVAL_MS);
  fastify.addHook("onClose", async () => {
    clearInterval(heartbeatTimer);
  });

  // Rota WebSocket para atualizações de radares em tempo real
  // IMPORTANTE: Registrar ANTES de outras rotas para evitar conflitos
  fastify.get("/ws", { websocket: true }, (connection: any, req: any) => {
    const socket = connection?.socket ?? connection;
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const client: WsClient = {
      socket,
      id: clientId,
      isAlive: true,
      connectedAt: Date.now(),
    };
    activeConnections.set(clientId, client);
    fastify.log.info({ url: req.url }, "✅ WebSocket client connected");

    socket.on("pong", () => {
      const current = activeConnections.get(clientId);
      if (current) current.isAlive = true;
    });

    socket.on("message", (raw: any) => {
      try {
        const payload = JSON.parse(String(raw ?? ""));
        if (payload?.event === "ping") {
          socket.send(JSON.stringify({ event: "pong", data: { ts: Date.now() } }));
        }
      } catch {
        // ignore malformed messages from clients
      }
    });

    socket.on("close", () => {
      activeConnections.delete(clientId);
      fastify.log.info("❌ WebSocket client disconnected");
    });

    socket.on("error", (error: Error) => {
      fastify.log.error({ error }, "❌ WebSocket error");
      activeConnections.delete(clientId);
    });

    // Enviar mensagem de boas-vindas
    try {
      socket.send(
        JSON.stringify({
          event: "connected",
          data: {
            message: "WebSocket connected",
            clientId,
            heartbeatMs: WS_HEARTBEAT_INTERVAL_MS,
          },
        })
      );
    } catch (e) {
      fastify.log.error({ error: e }, "Error sending welcome message");
    }
  });

  // Registrar outras rotas DEPOIS do WebSocket
  await fastify.register(authRoutes);
  await fastify.register(radarRoutes);
  await fastify.register(notificationRoutes);
  await fastify.register(adminRoutes);
  await fastify.register(userRoutes);

  const port = Number(process.env.PORT) || 3000;
  const host = "0.0.0.0";

  try {
    await fastify.listen({ port, host });
    console.log(`Server listening on ${host}:${port}`);
    console.log("WebSocket available at ws://" + host + ":" + port + "/ws");
  } catch (err) {
    clearInterval(heartbeatTimer);
    fastify.log.error(err);
    process.exit(1);
  }
}

start();

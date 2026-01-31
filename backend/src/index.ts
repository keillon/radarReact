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
const activeConnections = new Set<any>();

declare module "fastify" {
  interface FastifyInstance {
    wsBroadcast: (event: string, data: any) => void;
  }
}

async function start() {
  await fastify.register(cors, {
    origin: true,
  });

  // Registrar WebSocket plugin
  await fastify.register(websocket);

  // Rota WebSocket para atualizações de radares em tempo real
  fastify.get("/ws", { websocket: true }, (connection, req) => {
    activeConnections.add(connection);
    fastify.log.info({ url: req.url }, "WebSocket client connected");

    connection.socket.on("close", () => {
      activeConnections.delete(connection);
      fastify.log.info("WebSocket client disconnected");
    });

    connection.socket.on("error", (error) => {
      fastify.log.error({ error }, "WebSocket error");
      activeConnections.delete(connection);
    });
  });

  // Função helper para broadcast para todos os clientes conectados
  fastify.decorate("wsBroadcast", (event: string, data: any) => {
    const message = JSON.stringify({ event, data });
    activeConnections.forEach((conn) => {
      try {
        if (conn.readyState === 1) { // OPEN
          conn.send(message);
        }
      } catch (error) {
        fastify.log.error({ error }, "Error sending WebSocket message");
        activeConnections.delete(conn);
      }
    });
  });

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
    fastify.log.error(err);
    process.exit(1);
  }
}

start();

import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server as SocketIOServer } from "socket.io";
import { createServer } from "http";
import { radarRoutes } from "./routes/radars";
import { notificationRoutes } from "./routes/notifications";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";

// Criar servidor HTTP primeiro para que o Socket.IO possa ser anexado antes do Fastify iniciar
const httpServer = createServer();
const fastify = Fastify({ logger: true, serverFactory: (handler) => {
  httpServer.on('request', handler);
  return httpServer;
}});

declare module "fastify" {
  interface FastifyInstance {
    io?: SocketIOServer;
  }
}

async function start() {
  await fastify.register(cors, {
    origin: true,
  });

  await fastify.register(authRoutes);
  await fastify.register(radarRoutes);
  await fastify.register(notificationRoutes);
  await fastify.register(adminRoutes);
  await fastify.register(userRoutes);

  const port = Number(process.env.PORT) || 3000;
  const host = "0.0.0.0";

  try {
    // Criar Socket.IO ANTES do listen - anexar ao servidor HTTP que será usado pelo Fastify
    const io = new SocketIOServer(httpServer, {
      cors: { 
        origin: true,
        credentials: true 
      },
      transports: ['websocket', 'polling'],
      allowEIO3: true,
      path: '/socket.io/',
    });
    fastify.io = io;
    
    io.on("connection", (socket) => {
      fastify.log.info({ id: socket.id }, "Client connected (radar alerts)");
      socket.on("disconnect", () => {
        fastify.log.info({ id: socket.id }, "Client disconnected");
      });
    });
    console.log("Socket.IO configured for real-time radar alerts");

    // Agora iniciar o servidor HTTP (Socket.IO já está anexado e interceptará as requisições)
    await fastify.listen({ port, host });
    console.log(`Server listening on ${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();

import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server as SocketIOServer } from "socket.io";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { radarRoutes } from "./routes/radars";
import { notificationRoutes } from "./routes/notifications";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";

// Criar servidor HTTP manualmente PRIMEIRO
const httpServer = createServer();

// Criar Socket.IO e anexar ao servidor HTTP ANTES de qualquer coisa
// O Socket.IO vai adicionar seus próprios listeners ao servidor HTTP
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: true,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  path: '/socket.io/',
});

// Criar Fastify com serverFactory usando o mesmo servidor HTTP
// O Socket.IO já está anexado e seus listeners serão chamados primeiro
const fastify = Fastify({ 
  logger: true,
  serverFactory: (handler) => {
    // Adicionar handler do Fastify ao servidor HTTP
    // O Socket.IO já está anexado e vai interceptar /socket.io/ primeiro
    httpServer.on('request', handler);
    return httpServer;
  }
});

declare module "fastify" {
  interface FastifyInstance {
    io: SocketIOServer;
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
    // Atribuir Socket.IO ao Fastify para uso nas rotas
    fastify.io = io;
    
    // Configurar eventos do Socket.IO
    io.on("connection", (socket) => {
      fastify.log.info({ id: socket.id }, "Client connected (radar alerts)");
      socket.on("disconnect", () => {
        fastify.log.info({ id: socket.id }, "Client disconnected");
      });
    });
    console.log("Socket.IO configured for real-time radar alerts");

    // Aguardar o Fastify estar pronto
    await fastify.ready();

    // Iniciar o servidor HTTP
    // O Socket.IO já está anexado e vai interceptar /socket.io/ antes do Fastify
    await fastify.listen({ port, host });
    console.log(`Server listening on ${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();

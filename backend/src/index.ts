import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server as SocketIOServer } from "socket.io";
import { radarRoutes } from "./routes/radars";
import { notificationRoutes } from "./routes/notifications";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";

// Criar Fastify primeiro
const fastify = Fastify({ logger: true });

// Variável para armazenar o Socket.IO (será criado após o Fastify estar pronto)
let io: SocketIOServer;

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

  // Hook para criar Socket.IO quando o Fastify estiver pronto
  // mas ANTES de iniciar o servidor
  fastify.addHook('onReady', async () => {
    // Criar Socket.IO e anexar ao servidor HTTP do Fastify
    io = new SocketIOServer(fastify.server, {
      cors: {
        origin: true,
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      allowEIO3: true,
      path: '/socket.io/',
    });

    // Atribuir Socket.IO ao Fastify para uso nas rotas
    fastify.io = io;
    
    // Configurar eventos do Socket.IO
    fastify.io.on("connection", (socket) => {
      fastify.log.info({ id: socket.id }, "Client connected (radar alerts)");
      socket.on("disconnect", () => {
        fastify.log.info({ id: socket.id }, "Client disconnected");
      });
    });
    console.log("Socket.IO configured for real-time radar alerts");
  });

  const port = Number(process.env.PORT) || 3000;
  const host = "0.0.0.0";

  try {
    // Aguardar o Fastify estar pronto (todas as rotas registradas e hooks executados)
    await fastify.ready();

    // Iniciar o servidor HTTP
    // O Socket.IO está anexado ao servidor do Fastify e vai interceptar /socket.io/
    await fastify.listen({ port, host });
    console.log(`Server listening on ${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();

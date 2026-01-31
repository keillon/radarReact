import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server as SocketIOServer } from "socket.io";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { radarRoutes } from "./routes/radars";
import { notificationRoutes } from "./routes/notifications";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";

// Criar servidor HTTP primeiro
const httpServer = createServer();

// Criar Socket.IO ANTES do Fastify - ele precisa interceptar as requisições primeiro
const io = new SocketIOServer(httpServer, {
  cors: { 
    origin: true,
    credentials: true 
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  path: '/socket.io/',
});

// Criar Fastify com serverFactory que passa requisições não-Socket.IO para o Fastify
const fastify = Fastify({ 
  logger: true, 
  serverFactory: (handler) => {
    // Handler wrapper: se não for Socket.IO, passa para o Fastify
    httpServer.on('request', (req: IncomingMessage, res: ServerResponse) => {
      // Se a requisição é para Socket.IO, deixar o Socket.IO processar (não chamar handler)
      if (req.url && req.url.startsWith('/socket.io/')) {
        return; // Socket.IO vai processar
      }
      // Caso contrário, passar para o Fastify
      handler(req, res);
    });
    return httpServer;
  }
});

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
    // Socket.IO já foi criado acima e anexado ao httpServer
    fastify.io = io;
    
    io.on("connection", (socket) => {
      fastify.log.info({ id: socket.id }, "Client connected (radar alerts)");
      socket.on("disconnect", () => {
        fastify.log.info({ id: socket.id }, "Client disconnected");
      });
    });
    console.log("Socket.IO configured for real-time radar alerts");

    // Iniciar o servidor HTTP (Socket.IO já está anexado e interceptará requisições /socket.io/)
    await fastify.listen({ port, host });
    console.log(`Server listening on ${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();

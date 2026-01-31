import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server as SocketIOServer } from "socket.io";
import { radarRoutes } from "./routes/radars";
import { notificationRoutes } from "./routes/notifications";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";

const fastify = Fastify({ logger: true });

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
    // Usar ready() para garantir que o servidor HTTP esteja pronto antes de anexar Socket.IO
    await fastify.ready();
    
    // Criar Socket.IO após o ready() - o servidor HTTP já está disponível
    const io = new SocketIOServer(fastify.server, {
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

    // Agora iniciar o servidor HTTP (Socket.IO já está anexado)
    await fastify.listen({ port, host });
    console.log(`Server listening on ${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();

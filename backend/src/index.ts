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
    await fastify.listen({ port, host });
    console.log(`Server listening on ${host}:${port}`);

    const io = new SocketIOServer(fastify.server, {
      cors: { origin: true },
    });
    fastify.io = io;
    io.on("connection", (socket) => {
      fastify.log.info({ id: socket.id }, "Client connected (radar alerts)");
      socket.on("disconnect", () => {
        fastify.log.info({ id: socket.id }, "Client disconnected");
      });
    });
    console.log("Socket.IO attached for real-time radar alerts");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();

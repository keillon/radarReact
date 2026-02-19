import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/prisma";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

function getTokenFromRequest(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) return authHeader.substring(7);
  const cookie = (request as any).cookies?.admin_session;
  return cookie || null;
}

/** Para rotas HTML (ex: /admin): em falha de auth redireciona para /admin/login */
export async function requireAdminRedirect(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      if (request.method === "GET") return reply.redirect("/admin/login");
      return reply.status(401).send({ error: "Token não fornecido" });
    }
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      email: string;
    };
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true },
    });
    if (!user || user.role !== "admin") {
      if (request.method === "GET") return reply.redirect("/admin/login");
      return reply.status(403).send({ error: "Acesso negado. Apenas administradores." });
    }
    (request as any).adminUser = user;
  } catch (error: any) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      if (request.method === "GET") return reply.redirect("/admin/login");
      return reply.status(401).send({ error: "Token inválido ou expirado" });
    }
    throw error;
  }
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return reply.status(401).send({ error: "Token não fornecido" });
    }
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      email: string;
    };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true },
    });

    if (!user || user.role !== "admin") {
      return reply.status(403).send({ error: "Acesso negado. Apenas administradores." });
    }

    (request as any).adminUser = user;
  } catch (error: any) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return reply.status(401).send({ error: "Token inválido ou expirado" });
    }
    throw error;
  }
}

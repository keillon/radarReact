import { FastifyInstance } from "fastify";
import { prisma } from "../utils/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

export async function authRoutes(fastify: FastifyInstance) {
  // Registro
  fastify.post("/auth/register", async (request, reply) => {
    try {
      const body = request.body as {
        email: string;
        password: string;
        name?: string;
      };

      if (!body.email || !body.password) {
        return reply.status(400).send({
          error: "Email e senha são obrigatórios",
        });
      }

      // Verificar se usuário já existe
      const existingUser = await prisma.user.findUnique({
        where: { email: body.email },
      });

      if (existingUser) {
        return reply.status(400).send({
          error: "Email já cadastrado",
        });
      }

      // Hash da senha
      const hashedPassword = await bcrypt.hash(body.password, 10);

      // Criar usuário
      const user = await prisma.user.create({
        data: {
          email: body.email,
          password: hashedPassword,
          name: body.name || null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
        },
      });

      // Gerar token JWT
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: "30d" }
      );

      return reply.send({
        user,
        token,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: "Erro ao criar usuário",
        message: error.message,
      });
    }
  });

  // Login
  fastify.post("/auth/login", async (request, reply) => {
    try {
      const body = request.body as {
        email: string;
        password: string;
      };

      if (!body.email || !body.password) {
        return reply.status(400).send({
          error: "Email e senha são obrigatórios",
        });
      }

      // Buscar usuário
      const user = await prisma.user.findUnique({
        where: { email: body.email },
      });

      if (!user) {
        return reply.status(401).send({
          error: "Email ou senha incorretos",
        });
      }

      // Verificar senha
      const isValidPassword = await bcrypt.compare(
        body.password,
        user.password
      );

      if (!isValidPassword) {
        return reply.status(401).send({
          error: "Email ou senha incorretos",
        });
      }

      // Gerar token JWT
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: "30d" }
      );

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
        },
        token,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: "Erro ao fazer login",
        message: error.message,
      });
    }
  });

  // Atualizar perfil (nome, email) — requer autenticação
  fastify.patch("/auth/profile", async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "Token não fornecido" });
      }
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
      const body = request.body as { name?: string };

      const updateData: { name?: string | null } = {};
      if (body.name !== undefined) updateData.name = body.name.trim() || null;
      if (Object.keys(updateData).length === 0) {
        return reply.status(400).send({ error: "Nenhum dado para atualizar" });
      }

      const user = await prisma.user.update({
        where: { id: decoded.userId },
        data: updateData,
        select: { id: true, email: true, name: true, createdAt: true },
      });
      return reply.send({ user });
    } catch (error: any) {
      if (error.name === "JsonWebTokenError") {
        return reply.status(401).send({ error: "Token inválido" });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: "Erro ao atualizar perfil" });
    }
  });

  // Alterar senha — requer autenticação
  fastify.patch("/auth/password", async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "Token não fornecido" });
      }
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      const body = request.body as { currentPassword: string; newPassword: string };

      if (!body.currentPassword || !body.newPassword) {
        return reply.status(400).send({ error: "Senha atual e nova senha são obrigatórias" });
      }
      if (body.newPassword.length < 6) {
        return reply.status(400).send({ error: "Nova senha deve ter pelo menos 6 caracteres" });
      }

      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
      if (!user) return reply.status(401).send({ error: "Usuário não encontrado" });

      const valid = await bcrypt.compare(body.currentPassword, user.password);
      if (!valid) return reply.status(401).send({ error: "Senha atual incorreta" });

      const hashed = await bcrypt.hash(body.newPassword, 10);
      await prisma.user.update({
        where: { id: decoded.userId },
        data: { password: hashed },
      });
      return reply.send({ success: true });
    } catch (error: any) {
      if (error.name === "JsonWebTokenError") {
        return reply.status(401).send({ error: "Token inválido" });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: "Erro ao alterar senha" });
    }
  });

  // Verificar token (middleware para rotas protegidas)
  fastify.decorate("authenticate", async (request: any, reply: any) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "Token não fornecido" });
      }

      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET) as {
        userId: string;
        email: string;
      };

      request.user = decoded;
    } catch (error) {
      return reply.status(401).send({ error: "Token inválido" });
    }
  });
}


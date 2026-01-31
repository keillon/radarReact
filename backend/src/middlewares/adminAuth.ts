import { FastifyRequest, FastifyReply } from "fastify";

// Simple admin authentication middleware using a token in headers
export function adminAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: Error | null) => void
) {
  const headers = request.headers as Record<string, string | undefined>;
  const token = headers["x-admin-token"];
  const expected = process.env.ADMIN_TOKEN;

  if (!token || !expected || token !== expected) {
    reply.code(403).send({ error: "Admin access required" });
    return;
  }

  done();
}

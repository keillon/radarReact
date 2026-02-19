import { FastifyInstance } from "fastify";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/prisma";
import { getCsvImportStatus, importRadarCsv } from "../services/csvRadarImport";
import { invalidateRadarCache } from "./radars";
import { requireAdmin } from "../middlewares/adminAuth";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

/** Login: após sucesso redireciona para /admin (mapa) */
const loginHTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Painel Admin - Radar</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
      padding: 30px;
    }
    h1 {
      color: #333;
      margin-bottom: 30px;
      text-align: center;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      margin-bottom: 8px;
      color: #555;
      font-weight: 500;
    }
    input, textarea {
      width: 100%;
      padding: 12px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.3s;
    }
    input:focus, textarea:focus {
      outline: none;
      border-color: #3b9eff;
    }
    textarea {
      resize: vertical;
      min-height: 100px;
    }
    button {
      background: #3b9eff;
      color: white;
      border: none;
      padding: 14px 28px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      transition: background 0.3s;
    }
    button:hover {
      background: #2a7fd4;
    }
    button:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    .message {
      margin-top: 20px;
      padding: 12px;
      border-radius: 8px;
      display: none;
    }
    .message.success {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    .message.error {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-card h3 {
      color: #666;
      font-size: 14px;
      margin-bottom: 8px;
    }
    .stat-card .number {
      font-size: 32px;
      font-weight: bold;
      color: #3b9eff;
    }
    .tokens-section {
      margin-top: 40px;
      padding-top: 30px;
      border-top: 2px solid #e0e0e0;
    }
    .token-item {
      background: #f8f9fa;
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .token-item code {
      font-size: 12px;
      color: #666;
      word-break: break-all;
    }
    .delete-btn {
      background: #dc3545;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .delete-btn:hover {
      background: #c82333;
    }
    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
    }
    .tab-btn {
      flex: 1;
      background: #eef2ff;
      color: #3730a3;
      border: 1px solid #c7d2fe;
      padding: 10px 12px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
    }
    .tab-btn.active {
      background: #4f46e5;
      color: #fff;
      border-color: #4f46e5;
    }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }
    .login-panel {
      max-width: 400px;
      margin: 0 auto;
    }
    .login-panel h1 {
      margin-bottom: 24px;
    }
    .csv-drop {
      border: 2px dashed #cbd5e1;
      border-radius: 10px;
      padding: 16px;
      background: #f8fafc;
      margin-bottom: 12px;
    }
    .csv-meta {
      font-size: 13px;
      color: #475569;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px;
      margin-top: 10px;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="login-panel">
      <h1>🔐 Painel Admin - Login</h1>
      <form id="loginForm">
        <div class="form-group">
          <label for="loginEmail">Email</label>
          <input type="email" id="loginEmail" name="email" required placeholder="admin@exemplo.com">
        </div>
        <div class="form-group">
          <label for="loginPassword">Senha</label>
          <input type="password" id="loginPassword" name="password" required placeholder="••••••••">
        </div>
        <div id="loginError" class="message error" style="display:none;"></div>
        <button type="submit" id="loginBtn">Entrar</button>
      </form>
    </div>
  </div>

  <script>
    const API_URL = window.location.origin;
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('loginBtn');
      const errEl = document.getElementById('loginError');
      btn.disabled = true;
      errEl.style.display = 'none';
      try {
        const res = await fetch(API_URL + '/admin/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: document.getElementById('loginEmail').value,
            password: document.getElementById('loginPassword').value
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login falhou');
        window.location.href = '/admin/';
      } catch (err) {
        errEl.textContent = err.message || 'Erro ao fazer login';
        errEl.style.display = 'block';
      } finally {
        btn.disabled = false;
      }
    });
  </script>
</body>
</html>
`;

export async function adminRoutes(fastify: FastifyInstance) {
  // Login admin — não protegido
  fastify.post("/admin/auth/login", async (request, reply) => {
    try {
      const body = request.body as { email: string; password: string };
      if (!body.email || !body.password) {
        return reply.code(400).send({ error: "Email e senha são obrigatórios" });
      }
      const user = await prisma.user.findUnique({
        where: { email: body.email.trim().toLowerCase() },
      });
      if (!user) {
        return reply.code(401).send({ error: "Email ou senha incorretos" });
      }
      if (user.role !== "admin") {
        return reply.code(403).send({ error: "Acesso negado. Apenas administradores." });
      }
      const valid = await bcrypt.compare(body.password, user.password);
      if (!valid) {
        return reply.code(401).send({ error: "Email ou senha incorretos" });
      }
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
      reply.setCookie("admin_session", token, {
        path: "/admin",
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60,
        sameSite: "lax",
      });
      return reply.send({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      });
    } catch (error: any) {
      fastify.log.error({ error }, "Erro no login admin");
      return reply.code(500).send({ error: "Erro ao fazer login" });
    }
  });

  // /admin (exato) → redireciona para /admin/ (mapa)
  fastify.get("/admin", async (_request, reply) => {
    return reply.redirect(302, "/admin/");
  });

  // Login — sem proteção; após login redireciona para /admin (mapa)
  fastify.get("/admin/login", async (_request, reply) => {
    reply.type("text/html").send(loginHTML);
  });

  // Config do admin (token Mapbox em runtime; evita .env no build do embed)
  fastify.get("/admin/config", async (_request, reply) => {
    const mapboxToken =
      process.env.MAPBOX_TOKEN ||
      process.env.VITE_MAPBOX_TOKEN ||
      "";
    return reply.send({ mapboxToken });
  });

  // Rotas protegidas — exigem token admin
  fastify.get("/admin/csv/status", { preHandler: [requireAdmin] }, async (_request, reply) => {
    try {
      const status = getCsvImportStatus();
      return reply.send({ success: true, status });
    } catch (error: any) {
      fastify.log.error({ error }, "Erro ao obter status CSV");
      return reply.code(500).send({
        success: false,
        error: "Erro ao obter status CSV",
      });
    }
  });

  fastify.post("/admin/csv/upload", { preHandler: [requireAdmin] }, async (request, reply) => {
    try {
      const body = request.body as {
        csvText?: string;
        fileName?: string;
        force?: boolean;
      };
      if (!body?.csvText || String(body.csvText).trim().length === 0) {
        return reply.code(400).send({
          success: false,
          error: "csvText é obrigatório",
        });
      }

      const result = await importRadarCsv({
        csvText: body.csvText,
        fileName: body.fileName || "maparadar.csv",
        force: body.force === true,
      });

      // Invalidar cache e avisar clientes para recarregar
      invalidateRadarCache();

      // Avisar clientes para recarregar uma vez a base de radares
      fastify.wsBroadcast("radar:refresh", {
        at: new Date().toISOString(),
        reason: result.reason,
      });

      return reply.send({ success: true, ...result });
    } catch (error: any) {
      fastify.log.error({ error }, "Erro ao importar CSV");
      return reply.code(500).send({
        success: false,
        error: "Erro ao importar CSV",
        details: error?.message,
      });
    }
  });
}

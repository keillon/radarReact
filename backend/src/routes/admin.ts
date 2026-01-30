import { FastifyInstance } from "fastify";
import path from "path";
import fs from "fs";

/**
 * Painel Admin HTML simples para enviar notificações
 */
const adminHTML = `
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
  </style>
</head>
<body>
  <div class="container">
    <h1>🚨 Painel Admin - Notificações</h1>
    
    <div class="stats" id="stats">
      <div class="stat-card">
        <h3>Dispositivos Registrados</h3>
        <div class="number" id="deviceCount">-</div>
      </div>
    </div>

    <form id="notificationForm">
      <div class="form-group">
        <label for="title">Título da Notificação *</label>
        <input type="text" id="title" name="title" required placeholder="Ex: Novo Recurso Disponível">
      </div>
      
      <div class="form-group">
        <label for="body">Mensagem *</label>
        <textarea id="body" name="body" required placeholder="Ex: Agora você pode reportar radares em tempo real!"></textarea>
      </div>
      
      <button type="submit" id="submitBtn">Enviar Notificação</button>
    </form>

    <div class="message" id="message"></div>

    <div class="tokens-section">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h2 style="margin: 0;">Dispositivos Registrados</h2>
        <button onclick="loadStats()" style="background: #28a745; padding: 8px 16px; font-size: 14px; width: auto;">
          🔄 Atualizar
        </button>
      </div>
      <div id="tokensList"></div>
    </div>
  </div>

  <script>
    const API_URL = window.location.origin;

    // Carregar estatísticas e tokens
    async function loadStats() {
      try {
        const response = await fetch(API_URL + '/admin/notifications/tokens');
        
        if (!response.ok) {
          throw new Error(\`Erro HTTP: \${response.status} \${response.statusText}\`);
        }
        
        const data = await response.json();
        
        if (data.success) {
          document.getElementById('deviceCount').textContent = data.count || 0;
          displayTokens(data.tokens || []);
        } else {
          throw new Error(data.error || 'Erro ao carregar tokens');
        }
      } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
        document.getElementById('deviceCount').textContent = '?';
        document.getElementById('tokensList').innerHTML = 
          '<p style="color: #dc3545; text-align: center; padding: 20px;">❌ Erro ao carregar dispositivos. Tente atualizar a página.</p>';
        showMessage('Erro ao carregar dispositivos: ' + error.message, 'error');
      }
    }

    function displayTokens(tokens) {
      const container = document.getElementById('tokensList');
      if (!tokens || tokens.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">📱 Nenhum dispositivo registrado ainda.<br><small>Os dispositivos aparecerão aqui quando o app for aberto e registrar o token.</small></p>';
        return;
      }

      container.innerHTML = tokens.map(token => {
        const createdDate = new Date(token.createdAt);
        const updatedDate = token.updatedAt ? new Date(token.updatedAt) : null;
        const platformEmoji = token.platform === 'android' ? '🤖' : token.platform === 'ios' ? '🍎' : '📱';
        
        return \`
        <div class="token-item">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span style="font-size: 16px;">\${platformEmoji}</span>
              <code style="font-size: 11px; color: #666;">\${token.token.substring(0, 40)}...</code>
            </div>
            <div style="font-size: 11px; color: #999; margin-top: 4px;">
              <strong>Plataforma:</strong> \${token.platform || 'Desconhecido'} • 
              <strong>Criado:</strong> \${createdDate.toLocaleDateString('pt-BR')} \${createdDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              \${updatedDate ? \` • <strong>Atualizado:</strong> \${updatedDate.toLocaleDateString('pt-BR')} \${updatedDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}\` : ''}
            </div>
          </div>
          <button class="delete-btn" onclick="deleteToken('\${token.id}')">Remover</button>
        </div>
      \`;
      }).join('');
    }

    async function deleteToken(id) {
      if (!confirm('Tem certeza que deseja remover este dispositivo?')) {
        return;
      }

      try {
        const response = await fetch(API_URL + \`/admin/notifications/tokens/\${id}\`, {
          method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.success) {
          showMessage('Token removido com sucesso!', 'success');
          loadStats();
        } else {
          showMessage('Erro ao remover token', 'error');
        }
      } catch (error) {
        showMessage('Erro ao remover token', 'error');
      }
    }

    function showMessage(text, type) {
      const messageEl = document.getElementById('message');
      messageEl.textContent = text;
      messageEl.className = \`message \${type}\`;
      messageEl.style.display = 'block';
      
      setTimeout(() => {
        messageEl.style.display = 'none';
      }, 5000);
    }

    document.getElementById('notificationForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const submitBtn = document.getElementById('submitBtn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';

      const title = document.getElementById('title').value;
      const body = document.getElementById('body').value;

      try {
        const response = await fetch(API_URL + '/admin/notifications/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title,
            body,
            to: 'all'
          })
        });

        const data = await response.json();

        if (data.success) {
          showMessage(\`✅ Notificação enviada para \${data.sentTo} dispositivo(s)!\`, 'success');
          document.getElementById('notificationForm').reset();
        } else {
          showMessage('❌ Erro: ' + (data.error || 'Falha ao enviar notificação'), 'error');
        }
      } catch (error) {
        showMessage('❌ Erro ao enviar notificação: ' + error.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar Notificação';
      }
    });

    // Carregar ao iniciar
    loadStats();
    
    // Atualizar automaticamente a cada 30 segundos
    setInterval(loadStats, 30000);
    
    // Mostrar indicador de última atualização
    let lastUpdate = new Date();
    setInterval(() => {
      const now = new Date();
      const diff = Math.floor((now - lastUpdate) / 1000);
      if (diff >= 30) {
        lastUpdate = now;
      }
    }, 1000);
  </script>
</body>
</html>
`;

export async function adminRoutes(fastify: FastifyInstance) {
  // Servir painel admin
  fastify.get("/admin", async (request, reply) => {
    reply.type("text/html").send(adminHTML);
  });
}

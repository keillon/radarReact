import { FastifyInstance } from "fastify";
import path from "path";
import fs from "fs";
import { getCsvImportStatus, importRadarCsv } from "../services/csvRadarImport";

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
    <h1>🚨 Painel Admin - Notificações</h1>

    <div class="tabs">
      <button class="tab-btn active" data-tab="notifications">Notificações</button>
      <button class="tab-btn" data-tab="csv">CSV de Radares</button>
    </div>

    <div id="tab-notifications" class="tab-panel active">
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

    <div id="tab-csv" class="tab-panel">
      <h2 style="margin-bottom: 12px;">Atualizar Base CSV</h2>
      <p style="margin-bottom: 12px; color:#475569;">
        O backend só reprocessa quando o CSV mudar (hash diferente). Se for igual, ele ignora.
      </p>

      <div class="csv-drop">
        <input type="file" id="csvFile" accept=".csv,text/csv" />
        <p style="margin-top: 8px; color:#64748b; font-size: 13px;">
          Selecione um arquivo CSV atualizado. O conteúdo será enviado e persistido no backend.
        </p>
      </div>

      <button id="uploadCsvBtn" style="margin-bottom:10px;">Enviar CSV e Processar</button>
      <button id="refreshCsvStatusBtn" style="background:#16a34a;">Atualizar Status CSV</button>

      <div id="csvStatus" class="csv-meta">Carregando status...</div>
    </div>
  </div>

  <script>
    const API_URL = window.location.origin;

    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
      });
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === 'tab-' + tabId);
      });
    }

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

    async function loadCsvStatus() {
      const container = document.getElementById('csvStatus');
      try {
        const response = await fetch(API_URL + '/admin/csv/status');
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Falha ao carregar status');

        const s = data.status || {};
        const state = s.state || null;
        const info = s.csvInfo || {};
        container.textContent =
          'CSV atual: ' + (info.exists ? 'sim' : 'não') + '\\n' +
          'Tamanho: ' + (info.size || 0) + ' bytes\\n' +
          'Modificado em: ' + (info.mtimeMs ? new Date(info.mtimeMs).toLocaleString('pt-BR') : '-') + '\\n\\n' +
          'Último import: ' + (state?.importedAt ? new Date(state.importedAt).toLocaleString('pt-BR') : 'nunca') + '\\n' +
          'Arquivo: ' + (state?.fileName || '-') + '\\n' +
          'Rows: ' + (state?.totalRows || 0) + '\\n' +
          'Criados: ' + (state?.created || 0) + ' | Atualizados: ' + (state?.updated || 0) + ' | Inativados: ' + (state?.deactivated || 0);
      } catch (error) {
        container.textContent = 'Erro ao carregar status CSV: ' + error.message;
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

    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.getElementById('refreshCsvStatusBtn').addEventListener('click', loadCsvStatus);

    document.getElementById('uploadCsvBtn').addEventListener('click', async () => {
      const fileInput = document.getElementById('csvFile');
      const file = fileInput.files && fileInput.files[0];
      if (!file) {
        showMessage('Selecione um arquivo CSV.', 'error');
        return;
      }
      const btn = document.getElementById('uploadCsvBtn');
      btn.disabled = true;
      btn.textContent = 'Processando CSV...';
      try {
        const text = await file.text();
        const response = await fetch(API_URL + '/admin/csv/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            csvText: text,
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Falha ao processar CSV');
        }
        if (data.imported) {
          showMessage('✅ CSV processado com sucesso. Criados: ' + (data.stats?.created || 0) + ', Atualizados: ' + (data.stats?.updated || 0), 'success');
        } else {
          showMessage('ℹ️ CSV não processado: ' + (data.reason || 'sem mudanças'), 'success');
        }
        await loadCsvStatus();
      } catch (error) {
        showMessage('❌ Erro ao enviar CSV: ' + error.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Enviar CSV e Processar';
      }
    });

    // Carregar ao iniciar
    loadStats();
    loadCsvStatus();
    
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

  fastify.get("/admin/csv/status", async (_request, reply) => {
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

  fastify.post("/admin/csv/upload", async (request, reply) => {
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

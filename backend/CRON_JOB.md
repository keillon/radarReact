# Cron Job para Sincronização Automática de Radares ANTT

Este documento explica como configurar um cron job para sincronizar automaticamente os radares da ANTT, baixando apenas quando houver atualizações reais.

## Como Funciona

O script `syncANTTAuto.ts` verifica se o JSON oficial da ANTT foi atualizado usando:
- **Last-Modified header**: Verifica se a data de modificação mudou
- **ETag header**: Verifica se o conteúdo mudou (hash do servidor)
- **Content Hash**: Se não houver headers, baixa e compara hash do conteúdo

**Só baixa e processa se realmente houver atualização!**

## Configuração do Cron Job

### Linux/macOS

1. Abra o crontab:
```bash
crontab -e
```

2. Adicione uma linha para executar a cada 6 horas (ou o intervalo desejado):
```bash
# Sincronizar radares ANTT a cada 6 horas
0 */6 * * * cd /caminho/para/radar/backend && npm run sync:antt:auto >> /var/log/radar-sync.log 2>&1
```

3. Para executar diariamente às 2h da manhã:
```bash
# Sincronizar radares ANTT diariamente às 2h
0 2 * * * cd /caminho/para/radar/backend && npm run sync:antt:auto >> /var/log/radar-sync.log 2>&1
```

4. Para executar a cada 12 horas (meio-dia e meia-noite):
```bash
# Sincronizar radares ANTT a cada 12 horas
0 0,12 * * * cd /caminho/para/radar/backend && npm run sync:antt:auto >> /var/log/radar-sync.log 2>&1
```

### Windows (Task Scheduler)

1. Abra o **Agendador de Tarefas** (Task Scheduler)
2. Clique em **Criar Tarefa Básica**
3. Configure:
   - **Nome**: Sincronizar Radares ANTT
   - **Descrição**: Sincroniza radares da ANTT automaticamente
   - **Gatilho**: Diariamente / Repetir a cada X horas
   - **Ação**: Iniciar um programa
   - **Programa/script**: `npm`
   - **Argumentos**: `run sync:antt:auto`
   - **Iniciar em**: `C:\caminho\para\radar\backend`

### Usando PM2 (Recomendado para produção)

1. Instale o PM2:
```bash
npm install -g pm2
```

2. Crie um arquivo `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [
    {
      name: 'radar-sync',
      script: 'npm',
      args: 'run sync:antt:auto',
      cron_restart: '0 */6 * * *', // A cada 6 horas
      autorestart: false,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
```

3. Inicie o PM2:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Verificação Manual

Para testar manualmente se está funcionando:

```bash
cd backend
npm run sync:antt:auto
```

## Logs

Os logs são salvos em:
- **Arquivo de log** (se configurado no cron): `/var/log/radar-sync.log`
- **Console**: Saída padrão do script

## Monitoramento

O script retorna:
- ✅ **Sucesso sem atualização**: "Nenhuma atualização disponível"
- ✅ **Sucesso com atualização**: "Sincronização concluída: X criados, Y atualizados"
- ❌ **Erro**: Mensagem de erro detalhada

## Notificações no App

Quando uma atualização é detectada e sincronizada:
1. O backend salva a informação da última sincronização
2. Quando usuários abrem o app, verificam se há atualização disponível
3. Se houver, um **modal obrigatório** aparece bloqueando o uso do app
4. O usuário **deve atualizar** antes de continuar usando o app

## Troubleshooting

### Erro: "npm: command not found"
- Certifique-se de que o Node.js e npm estão no PATH do cron
- Use o caminho completo: `/usr/bin/npm` ou `/usr/local/bin/npm`

### Erro: "Cannot find module"
- Execute `npm install` no diretório do backend antes de configurar o cron

### Script não executa
- Verifique as permissões do arquivo
- Verifique os logs do cron: `grep CRON /var/log/syslog` (Linux)

### Atualizações não aparecem no app
- Verifique se o backend está rodando
- Verifique se o endpoint `/radars/check-updates` está acessível
- Verifique os logs do backend

## Recomendações

- **Frequência**: Execute a cada 6-12 horas (a ANTT atualiza esporadicamente)
- **Horário**: Evite horários de pico (madrugada é ideal)
- **Monitoramento**: Configure alertas se o script falhar consecutivamente
- **Backup**: Mantenha backup do banco de dados antes de grandes atualizações


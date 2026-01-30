#!/bin/bash
# Script para fazer deploy/atualização do backend

echo "🔄 Atualizando código do repositório..."
cd ~/apps/radar/backend
git pull

echo "📦 Instalando dependências (se necessário)..."
npm install

echo "🔨 Recompilando TypeScript..."
npm run build

echo "🗄️ Executando migrations do banco de dados..."
npx prisma migrate deploy || {
    echo "⚠️ Migrations falharam, tentando executar manualmente..."
    echo "📋 Se a tabela user_positions não existir, execute o script create_user_positions_table.sql no banco de dados"
}

echo "🔄 Reiniciando servidor PM2..."
pm2 restart radar-backend

echo "✅ Deploy concluído!"
echo "📊 Verificando status do servidor..."
pm2 status

echo "📋 Últimos logs:"
pm2 logs radar-backend --lines 10


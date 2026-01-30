#!/bin/bash
# Script para limpar cache do Prisma e regenerar o client

echo "🧹 Limpando cache do Prisma..."

cd ~/apps/radar/backend

# Remover node_modules/.prisma (cache do Prisma)
rm -rf node_modules/.prisma
rm -rf node_modules/@prisma/client

echo "🔄 Regenerando Prisma Client..."
npx prisma generate

echo "🔨 Recompilando TypeScript..."
npm run build

echo "🔄 Reiniciando servidor..."
pm2 restart radar-backend

echo "✅ Pronto! Verificando logs..."
pm2 logs radar-backend --lines 10


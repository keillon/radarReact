#!/bin/bash

echo "🔄 Forçando atualização completa do código..."

# Entrar no diretório do backend
cd "$(dirname "$0")" || exit 1

# Descartar todas as mudanças locais
echo "🗑️  Descartando mudanças locais..."
git reset --hard HEAD
git clean -fd

# Fazer pull forçado
echo "📥 Fazendo pull do repositório..."
git pull origin main --no-edit

# Remover node_modules e package-lock.json
echo "🧹 Limpando dependências antigas..."
rm -rf node_modules package-lock.json

# Reinstalar dependências
echo "📦 Reinstalando dependências..."
npm install

# Compilar
echo "🔨 Compilando TypeScript..."
npm run build

# Verificar se compilou
if [ $? -eq 0 ]; then
    echo "✅ Compilação concluída!"
    echo ""
    echo "🔄 Reinicie o servidor com: pm2 restart radar-backend"
else
    echo "❌ Erro na compilação!"
    exit 1
fi

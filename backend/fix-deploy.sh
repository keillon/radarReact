#!/bin/bash

echo "🔧 Corrigindo conflitos e reinstalando dependências..."

# Entrar no diretório do backend
cd "$(dirname "$0")" || exit 1

# Fazer stash das mudanças locais no package-lock.json
echo "📦 Fazendo stash do package-lock.json local..."
git stash push -m "Stash package-lock.json antes do pull" backend/package-lock.json 2>/dev/null || true

# Fazer pull novamente
echo "🔄 Fazendo pull do repositório..."
git pull origin main

# Remover node_modules e package-lock.json para reinstalação limpa
echo "🧹 Limpando node_modules e package-lock.json..."
rm -rf node_modules package-lock.json

# Reinstalar dependências
echo "📦 Reinstalando dependências..."
npm install

# Compilar
echo "🔨 Compilando TypeScript..."
npm run build

# Verificar se compilou sem erros
if [ $? -eq 0 ]; then
    echo "✅ Compilação concluída com sucesso!"
else
    echo "❌ Erro na compilação!"
    exit 1
fi

echo "✅ Correção concluída! Execute 'pm2 restart radar-backend' para aplicar as mudanças."

#!/bin/bash
# Deploy do backend: no servidor faz git pull, npm install (se precisar) e restart.
# Uso: ./scripts/deploy-backend.sh
# Ajuste abaixo: usuário, IP e pasta no servidor.

SERVER="usuario@72.60.247.18"
REPO_DIR="RadarREact"
PM2_NAME="backend"

set -e
echo "Conectando em $SERVER e atualizando backend..."
ssh "$SERVER" "cd $REPO_DIR && git pull origin main && cd backend && npm install --production && pm2 restart $PM2_NAME"
echo "Deploy concluído."

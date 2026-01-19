#!/bin/bash

# Script para iniciar o app Android com Metro bundler

echo "🚀 Iniciando RadarBot..."

# Iniciar Metro bundler em background
echo "📦 Iniciando Metro bundler..."
npm start &
METRO_PID=$!

# Aguardar Metro iniciar
sleep 5

# Configurar port forwarding (se adb estiver disponível)
if command -v adb &> /dev/null; then
    echo "🔌 Configurando port forwarding..."
    adb reverse tcp:8081 tcp:8081
fi

# Executar app Android
echo "📱 Executando app Android..."
npm run android

# Manter Metro rodando
wait $METRO_PID



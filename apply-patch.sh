#!/bin/bash
# Script para aplicar patches antes do build
# Garante que os patches sejam aplicados mesmo se os arquivos foram revertidos

echo "🔧 Aplicando patches..."
npx patch-package @pawan-pk/react-native-mapbox-navigation

if [ $? -eq 0 ]; then
  echo "✅ Patch aplicado com sucesso!"
else
  echo "❌ Erro ao aplicar patch"
  exit 1
fi


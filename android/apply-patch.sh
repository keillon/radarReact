#!/bin/bash
# Script para aplicar patch antes do build
cd "$(dirname "$0")/.."
npx patch-package @pawan-pk/react-native-mapbox-navigation


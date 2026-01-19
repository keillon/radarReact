@echo off
echo ============================================
echo Limpando tudo e reconstruindo...
echo ============================================

cd android

echo Limpando build do Gradle...
call gradlew clean

echo Limpando build do módulo MapboxNavigation...
if exist "..\node_modules\@pawan-pk\react-native-mapbox-navigation\android\build" (
    rmdir /s /q "..\node_modules\@pawan-pk\react-native-mapbox-navigation\android\build"
)

echo Aplicando patch...
cd ..
npx patch-package @pawan-pk/react-native-mapbox-navigation --use-yarn=false

echo.
echo ============================================
echo Iniciando build release...
echo ============================================
cd android
call gradlew assembleRelease --no-daemon

pause


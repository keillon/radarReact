@echo off
echo ============================================
echo APLICANDO PATCH DO MAPBOX NAVIGATION...
echo ============================================
echo.

REM Limpar build antigo
echo Limpando build antigo...
if exist "node_modules\@pawan-pk\react-native-mapbox-navigation\android\build" (
    rmdir /s /q "node_modules\@pawan-pk\react-native-mapbox-navigation\android\build"
)

REM Aplicar patch
echo Aplicando patch...
call npx patch-package @pawan-pk/react-native-mapbox-navigation --use-yarn=false

echo.
echo ============================================
echo PATCH APLICADO!
echo ============================================
echo.
echo Agora execute: npx react-native run-android
pause

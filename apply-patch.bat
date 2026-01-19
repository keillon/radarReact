@echo off
REM Script para aplicar patch antes do build
cd /d "%~dp0"
echo Limpando arquivos de build...
if exist "node_modules\@pawan-pk\react-native-mapbox-navigation\android\build" (
    rmdir /s /q "node_modules\@pawan-pk\react-native-mapbox-navigation\android\build"
    echo Arquivos de build removidos.
)
echo ========================================
echo Aplicando patch do Mapbox Navigation...
call npx patch-package @pawan-pk/react-native-mapbox-navigation --use-yarn=false
if %ERRORLEVEL% NEQ 0 (
    echo ERRO: Falha ao aplicar patch!
    exit /b %ERRORLEVEL%
)
echo Patch aplicado com sucesso!


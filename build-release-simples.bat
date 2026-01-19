@echo off
REM ============================================
REM Script SIMPLES para build de release
REM Apenas aplica o patch e faz build
REM ============================================
cd /d "%~dp0"

echo ============================================
echo Limpando build...
echo ============================================
if exist "node_modules\@pawan-pk\react-native-mapbox-navigation\android\build" (
    rmdir /s /q "node_modules\@pawan-pk\react-native-mapbox-navigation\android\build"
)

echo ============================================
echo Aplicando patch...
echo ============================================
call npx patch-package @pawan-pk/react-native-mapbox-navigation --use-yarn=false
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao aplicar patch!
    pause
    exit /b %ERRORLEVEL%
)

echo ============================================
echo Iniciando build de release...
echo ============================================
cd android
call gradlew assembleRelease
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Build falhou!
    pause
    exit /b %ERRORLEVEL%
)

echo ============================================
echo [SUCESSO] Build concluido!
echo ============================================
pause


@echo off
REM ============================================
REM Script DEFINITIVO - Aplica patch SEMPRE
REM ============================================
cd /d "%~dp0"

echo ============================================
echo PASSO 1: Limpando build...
echo ============================================
if exist "node_modules\@pawan-pk\react-native-mapbox-navigation\android\build" (
    rmdir /s /q "node_modules\@pawan-pk\react-native-mapbox-navigation\android\build"
    echo [OK] Build removido
)

echo ============================================
echo PASSO 2: Forçando código correto...
echo ============================================
call forcar-codigo-correto.bat
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao forçar código correto!
    pause
    exit /b %ERRORLEVEL%
)
echo [OK] Código corrigido forçadamente

echo ============================================
echo PASSO 3: Verificando se codigo esta correto...
echo ============================================
findstr /C:"style.styleSourceExists" "node_modules\@pawan-pk\react-native-mapbox-navigation\android\src\main\java\com\mapboxnavigation\MapboxNavigationView.kt" >nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Codigo NAO esta correto apos aplicar patch!
    echo O patch pode estar incorreto. Verifique o arquivo de patch.
    pause
    exit /b 1
)
echo [OK] Codigo verificado (usa API v11)

echo ============================================
echo PASSO 4: Iniciando build de release...
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

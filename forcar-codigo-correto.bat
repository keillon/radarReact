@echo off
REM ============================================
REM Script que FORÇA código correto no arquivo
REM Executa ANTES e DEPOIS de aplicar patch
REM ============================================
cd /d "%~dp0"

echo ============================================
echo FORÇANDO CÓDIGO CORRETO NO ARQUIVO...
echo ============================================

REM Executar script PowerShell SIMPLES
powershell -ExecutionPolicy Bypass -File "%~dp0forcar-codigo-correto-simples.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao forçar código correto!
    pause
    exit /b %ERRORLEVEL%
)

echo ============================================
echo Recriando patch com código correto...
echo ============================================
call npx patch-package @pawan-pk/react-native-mapbox-navigation --use-yarn=false

if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao criar patch!
    pause
    exit /b %ERRORLEVEL%
)

echo ============================================
echo Aplicando patch novamente...
echo ============================================
call npx patch-package @pawan-pk/react-native-mapbox-navigation --use-yarn=false

if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao aplicar patch!
    pause
    exit /b %ERRORLEVEL%
)

echo ============================================
echo Forçando código correto NOVAMENTE (após patch)...
echo ============================================
powershell -ExecutionPolicy Bypass -File "%~dp0forcar-codigo-correto.ps1"

echo ============================================
echo [SUCESSO] Código corrigido e patch atualizado!
echo ============================================
pause


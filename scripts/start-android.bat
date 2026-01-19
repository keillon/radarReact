@echo off
REM Script para iniciar o app Android com Metro bundler no Windows

echo 🚀 Iniciando RadarBot...

REM Iniciar Metro bundler em uma nova janela
echo 📦 Iniciando Metro bundler...
start "Metro Bundler" cmd /k "npm start"

REM Aguardar Metro iniciar
timeout /t 5 /nobreak >nul

REM Tentar configurar port forwarding (se o Android SDK estiver no PATH)
where adb >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo 🔌 Configurando port forwarding...
    adb reverse tcp:8081 tcp:8081
) else (
    echo ⚠️  ADB não encontrado no PATH. Configure manualmente:
    echo    - Abra o Android Studio
    echo    - Device Manager ^> Seu dispositivo ^> Port forwarding
    echo    - Adicione: Host port 8081 - Device port 8081
)

REM Executar app Android
echo 📱 Executando app Android...
call npm run android

pause



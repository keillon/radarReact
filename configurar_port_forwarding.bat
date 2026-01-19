@echo off
echo === Configurador de Port Forwarding ===
echo.

REM Caminho padrão do ADB
set ADB_PATH=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe

REM Verifica se o ADB existe
if exist "%ADB_PATH%" (
    echo Configurando port forwarding via ADB...
    "%ADB_PATH%" reverse tcp:8081 tcp:8081
    
    if %ERRORLEVEL% EQU 0 (
        echo.
        echo Port forwarding configurado com sucesso!
        echo.
        echo Verificando configuração...
        "%ADB_PATH%" reverse --list
    ) else (
        echo.
        echo Erro ao configurar port forwarding
        echo Tente o Metodo 2 (IP manual) no arquivo SOLUCAO_SEM_ANDROID_STUDIO.md
    )
) else (
    echo ADB nao encontrado no caminho padrao: %ADB_PATH%
    echo.
    echo === Metodo Alternativo: IP Manual ===
    echo.
    echo No dispositivo Android:
    echo 1. Abra o app RadarBot
    echo 2. Pressione Ctrl+M (ou agite o dispositivo)
    echo 3. Selecione Settings
    echo 4. Em 'Debug server host ^& port for device', digite: SEU_IP:8081
    echo 5. Feche e reabra o app
    echo.
    echo Para descobrir seu IP, execute: ipconfig
)

echo.
pause



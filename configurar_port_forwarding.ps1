# Script para configurar Port Forwarding automaticamente

Write-Host "=== Configurador de Port Forwarding ===" -ForegroundColor Cyan
Write-Host ""

# Caminho padrão do ADB
$adbPath = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"

# Verifica se o ADB existe
if (-not (Test-Path $adbPath)) {
    Write-Host "ADB não encontrado no caminho padrão: $adbPath" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Por favor, informe o caminho completo do adb.exe:" -ForegroundColor Yellow
    Write-Host "Exemplo: C:\Android\Sdk\platform-tools\adb.exe" -ForegroundColor Gray
    $customPath = Read-Host "Caminho do ADB"
    
    if (Test-Path $customPath) {
        $adbPath = $customPath
    } else {
        Write-Host "Caminho inválido! Usando método alternativo..." -ForegroundColor Red
        $adbPath = $null
    }
}

if ($adbPath -and (Test-Path $adbPath)) {
    Write-Host "Configurando port forwarding via ADB..." -ForegroundColor Green
    Write-Host "Executando: $adbPath reverse tcp:8081 tcp:8081" -ForegroundColor Gray
    
    & $adbPath reverse tcp:8081 tcp:8081
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Port forwarding configurado com sucesso!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Verificando configuração..." -ForegroundColor Cyan
        & $adbPath reverse --list
    } else {
        Write-Host "❌ Erro ao configurar port forwarding" -ForegroundColor Red
        Write-Host "Tente o Método 2 (IP manual) no arquivo SOLUCAO_SEM_ANDROID_STUDIO.md" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  ADB não encontrado. Use o Método 2 (IP manual)!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "=== Método Alternativo: IP Manual ===" -ForegroundColor Cyan
    Write-Host ""
    
    # Descobre o IP
    $ipAddress = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254.*"} | Select-Object -First 1).IPAddress
    
    if ($ipAddress) {
        Write-Host "Seu IP local é: $ipAddress" -ForegroundColor Green
        Write-Host ""
        Write-Host "No dispositivo Android:" -ForegroundColor Yellow
        Write-Host "1. Abra o app RadarBot" -ForegroundColor White
        Write-Host "2. Pressione Ctrl+M (ou agite o dispositivo)" -ForegroundColor White
        Write-Host "3. Selecione Settings" -ForegroundColor White
        Write-Host "4. Em 'Debug server host & port for device', digite:" -ForegroundColor White
        Write-Host "   $ipAddress:8081" -ForegroundColor Cyan
        Write-Host "5. Feche e reabra o app" -ForegroundColor White
    } else {
        Write-Host "Não foi possível descobrir o IP automaticamente." -ForegroundColor Red
        Write-Host "Execute 'ipconfig' no CMD para descobrir seu IP." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Pressione qualquer tecla para sair..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")



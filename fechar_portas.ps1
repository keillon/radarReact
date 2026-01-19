# Script para fechar processos usando portas de desenvolvimento

Write-Host "Fechando processos que estao usando portas de desenvolvimento..." -ForegroundColor Yellow

# Portas para verificar
$ports = @(8081, 8082, 8083)

foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    
    foreach ($conn in $connections) {
        $processId = $conn.OwningProcess
        try {
            $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
            if ($process) {
                Write-Host "Matando processo: $($process.ProcessName) (PID: $processId) na porta $port" -ForegroundColor Red
                Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
            }
        } catch {
            Write-Host "Erro ao matar processo PID $processId" -ForegroundColor Red
        }
    }
}

# Fecha todos os processos node.exe
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "Fechando processos node.exe..." -ForegroundColor Yellow
    Stop-Process -Name node -Force -ErrorAction SilentlyContinue
}

# Verifica portas
Write-Host "`nVerificando portas..." -ForegroundColor Cyan
foreach ($port in $ports) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        Write-Host "Porta $port ainda em uso" -ForegroundColor Red
    } else {
        Write-Host "Porta $port livre" -ForegroundColor Green
    }
}

Write-Host "`nProcesso concluido!" -ForegroundColor Green


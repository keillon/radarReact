# 🔧 Solução: Porta 8081 já está em uso

## Problema
O erro `EADDRINUSE: address already in use :::8081` significa que já existe um Metro bundler rodando na porta 8081.

## Soluções

### Opção 1: Usar o Metro bundler que já está rodando (Recomendado)

Se você já tem um Metro bundler rodando, **não precisa iniciar outro**!

1. **Verifique se há um Metro bundler rodando:**
   - Procure por uma janela de terminal com "Metro bundler" ou "React Native"
   - Ou acesse no navegador: http://localhost:8081

2. **Se estiver rodando, use esse mesmo:**
   - Configure o port forwarding normalmente
   - Abra o app no dispositivo
   - Ele deve conectar ao Metro que já está rodando

### Opção 2: Matar o processo que está usando a porta 8081

#### Windows PowerShell:
```powershell
# Encontrar o processo
$port = Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue
if ($port) {
    $pid = $port.OwningProcess
    Write-Host "Matando processo $pid"
    Stop-Process -Id $pid -Force
}
```

Ou execute:
```powershell
netstat -ano | findstr :8081
# Pegue o PID da última coluna e execute:
taskkill /PID <PID> /F
```

### Opção 3: Usar uma porta diferente

Se preferir usar outra porta:

1. **Inicie o Metro em outra porta:**
```bash
npm start -- --port 8082
```

2. **Configure o port forwarding para a nova porta:**
   - Android Studio: Device Manager > Port forwarding > 8082 → 8082
   - Ou via comando: `adb reverse tcp:8082 tcp:8082`

3. **No dispositivo, configure o IP manualmente:**
   - Abra o app > Ctrl+M > Settings
   - Debug server host: `10.0.2.2:8082`

## Recomendação

**Use a Opção 1** - Se já tem um Metro rodando, use ele! É mais simples e evita problemas de múltiplos processos.



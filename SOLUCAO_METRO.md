# Solução para o erro "Unable to load script"

O Metro bundler está rodando, mas o dispositivo não está conseguindo se conectar.

## Passos para resolver:

### 1. Certifique-se de que o Metro bundler está rodando
Abra um terminal e execute:
```bash
npm start
```
Deixe esse terminal aberto rodando.

### 2. Configure o port forwarding no dispositivo

Você precisa configurar o port forwarding manualmente no dispositivo Android:

#### Opção A: Via Android Studio (Mais fácil)
1. Abra o Android Studio
2. Conecte seu dispositivo via USB
3. Clique em "Device Manager" (ícone de dispositivo)
4. Clique em seu dispositivo conectado
5. Clique em "Port forwarding" ou use o atalho
6. Adicione: Host port: 8081, Device port: 8081

#### Opção B: Via linha de comando (se o Android SDK estiver no PATH)
1. Encontre o caminho do adb (geralmente em `%LOCALAPPDATA%\Android\Sdk\platform-tools\`)
2. Execute:
```cmd
%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe reverse tcp:8081 tcp:8081
```

### 3. Para dispositivos na mesma rede Wi-Fi
Se o dispositivo e o computador estão na mesma rede Wi-Fi:

1. Descubra o IP do seu computador:
   - Windows: `ipconfig` (procure por IPv4)
   - Exemplo: 192.168.1.100

2. No dispositivo Android, abra o app React Native
3. Pressione Ctrl+M (ou agite o dispositivo) para abrir o menu de desenvolvedor
4. Selecione "Settings"
5. Configure "Debug server host & port for device" para: `SEU_IP:8081`
   - Exemplo: `192.168.1.100:8081`

### 4. Reinicie o app
Depois de configurar o port forwarding ou o host:

1. Feche o app completamente
2. Reabra o app
3. Ou execute novamente: `npm run android`

## Verificações:

1. ✅ Metro bundler rodando na porta 8081
2. ✅ Dispositivo conectado via USB
3. ✅ Port forwarding configurado (8081 -> 8081)
4. ✅ App instalado no dispositivo

Se ainda não funcionar, tente:
- Desconectar e reconectar o cabo USB
- Reiniciar o Metro bundler (`Ctrl+C` e depois `npm start` novamente)
- Limpar cache: `npm start -- --reset-cache`



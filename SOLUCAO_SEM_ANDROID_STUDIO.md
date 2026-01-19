# 🔧 Solução SEM Android Studio - Port Forwarding

## 🎯 Método 1: Via Linha de Comando (ADB Direto)

### Passo 1: Encontre o caminho do ADB

O ADB geralmente está em:

```
C:\Users\Keillon\AppData\Local\Android\Sdk\platform-tools\adb.exe
```

### Passo 2: Configure o Port Forwarding

Abra um terminal (PowerShell ou CMD) e execute:

```powershell
# Substitua o caminho se necessário
C:\Users\Keillon\AppData\Local\Android\Sdk\platform-tools\adb.exe reverse tcp:8081 tcp:8081
```

Ou se você tiver o Android SDK em outro lugar, use o caminho completo.

### Passo 3: Verifique se funcionou

```powershell
C:\Users\Keillon\AppData\Local\Android\Sdk\platform-tools\adb.exe reverse --list
```

Você deve ver: `tcp:8081 tcp:8081`

---

## 🎯 Método 2: Configurar IP Manualmente no Dispositivo (MAIS FÁCIL!)

Este método **NÃO precisa de port forwarding**!

### Passo 1: Descubra o IP do seu computador

No PowerShell ou CMD, execute:

```powershell
ipconfig
```

Procure por **IPv4 Address** na seção da sua conexão de rede (Wi-Fi ou Ethernet).
Exemplo: `192.168.1.100`

### Passo 2: Certifique-se que o Metro bundler está rodando

```bash
npm start
```

### Passo 3: Configure no dispositivo Android

1. **Abra o app RadarBot** no dispositivo
2. Se aparecer erro, **pressione Ctrl+M** (ou agite o dispositivo)
   - Isso abre o menu de desenvolvedor do React Native
3. Selecione **Settings**
4. Em **Debug server host & port for device**, digite:
   ```
   SEU_IP:8081
   ```
   Exemplo: `192.168.1.100:8081`
5. **Feche e reabra o app**

**IMPORTANTE:** Dispositivo e computador devem estar na **mesma rede Wi-Fi**!

---

## 🎯 Método 3: Script Automático

Criei um script para facilitar! Execute:

### Windows PowerShell:

```powershell
powershell.exe -ExecutionPolicy Bypass -File configurar_port_forwarding.ps1
```

### Ou use o script batch:

```cmd
configurar_port_forwarding.bat
```

---

## 🎯 Método 4: Usar 10.0.2.2 (Para Emulador ou USB)

Se você estiver usando um **emulador Android** ou **USB debugging ativo**:

1. Abra o app no dispositivo/emulador
2. Pressione **Ctrl+M** (ou agite)
3. **Settings** > **Debug server host & port for device**
4. Digite: `10.0.2.2:8081`
5. Feche e reabra o app

---

## ✅ Qual método usar?

- **Método 1:** Se você tem acesso ao ADB e dispositivo via USB
- **Método 2:** **RECOMENDADO** - Mais fácil, funciona via Wi-Fi
- **Método 3:** Automático, se os scripts funcionarem
- **Método 4:** Para emuladores ou quando USB debugging está ativo

---

## 🆘 Ainda não funciona?

1. **Verifique se o Metro está rodando:**

   - Acesse: http://localhost:8081 no navegador
   - Deve aparecer uma página do React Native

2. **Verifique se dispositivo e PC estão na mesma rede:**

   - Ambos devem estar conectados ao mesmo Wi-Fi

3. **Tente reiniciar o Metro:**

   ```bash
   # Pare o Metro (Ctrl+C)
   # Limpe o cache e reinicie:
   npm start -- --reset-cache
   ```

4. **Verifique firewall:**
   - O Windows Firewall pode estar bloqueando a porta 8081
   - Tente desativar temporariamente para testar

---

**O Método 2 (IP manual) é o mais confiável e não precisa de Android Studio!** 🚀

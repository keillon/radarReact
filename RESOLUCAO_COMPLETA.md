# ✅ Solução Completa: "Unable to Load Script"

## 📊 Status Atual:
- ✅ **Build:** SUCESSO
- ✅ **App instalado:** SIM
- ✅ **Metro bundler rodando:** SIM (PID 28076 na porta 8081)

## 🎯 O Problema:
O app está instalado, mas não consegue carregar o JavaScript porque o **port forwarding não está configurado**.

## 🔧 Solução em 3 Passos:

### Passo 1: O Metro bundler já está rodando! ✅
**Não precisa fazer nada aqui** - já está rodando na porta 8081.

Se quiser verificar, acesse no navegador: http://localhost:8081

### Passo 2: Configure o Port Forwarding

#### Via Android Studio (Mais fácil):
1. Abra o **Android Studio**
2. Conecte seu dispositivo Android via USB
3. Clique no ícone **Device Manager** (ou View > Tool Windows > Device Manager)
4. Clique no seu dispositivo conectado
5. Clique em **Port forwarding** (ícone de engrenagem ou seta)
6. Clique no botão **+** (mais)
7. Preencha:
   - **Host port:** `8081`
   - **Device port:** `8081`
8. Clique em **OK**
9. Você deve ver uma regra aparecer: `8081 → 8081`

#### Via Linha de Comando (se tiver ADB no PATH):
```powershell
%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe reverse tcp:8081 tcp:8081
```

### Passo 3: Abra o App no Dispositivo

**Opção A - Automático (se o adb estiver no PATH):**
```bash
npm run android
```

**Opção B - Manual:**
1. No seu dispositivo Android, encontre o app **RadarBot** na lista de apps
2. Toque no ícone para abrir
3. O app deve se conectar ao Metro bundler e carregar! 🎉

### Se ainda aparecer "Unable to Load Script":

1. **No dispositivo Android**, abra o app RadarBot
2. Pressione **Ctrl+M** (se estiver com USB debugging) ou **agite o dispositivo**
3. Selecione **Settings**
4. Em **Debug server host & port for device**, digite:
   ```
   10.0.2.2:8081
   ```
   (Para USB) ou o IP do seu computador (para Wi-Fi)
5. Feche e reabra o app

## ✅ Checklist Final:
- [x] Metro bundler rodando (já está!)
- [ ] Port forwarding configurado (8081 → 8081)
- [ ] Dispositivo conectado via USB
- [ ] App aberto no dispositivo

Depois de configurar o port forwarding, o app deve carregar normalmente! 🚀



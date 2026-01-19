# 🚀 Instruções Rápidas para Resolver "Unable to Load Script"

## ✅ O que já está funcionando:

- ✅ Build do APK: **SUCCESSFUL**
- ✅ App instalado no dispositivo: **CONFIRMADO**

## 🔧 O que precisa fazer:

### Passo 1: Inicie o Metro Bundler

Abra um terminal e execute:

```bash
npm start
```

**DEIXE ESTE TERMINAL ABERTO E RODANDO**

### Passo 2: Configure o Port Forwarding

#### Opção A - Via Android Studio (Recomendado):

1. Abra o **Android Studio**
2. Clique no ícone **Device Manager** (ou vá em View > Tool Windows > Device Manager)
3. Selecione seu dispositivo conectado
4. Clique em **Port forwarding** (ou no ícone de engrenagem)
5. Clique no botão **+** para adicionar uma nova regra:
   - **Host port:** `8081`
   - **Device port:** `8081`
6. Clique em **OK**

#### Opção B - Via Linha de Comando:

Abra um novo terminal (PowerShell ou CMD) e execute:

```powershell
$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe reverse tcp:8081 tcp:8081
```

### Passo 3: Inicie o App Manualmente

Como o `adb` não está no PATH, você pode iniciar o app manualmente:

1. **No seu dispositivo Android**, encontre o app **RadarBot** na lista de apps
2. **Toque no ícone** para abrir
3. O app deve conectar ao Metro bundler e carregar

### Passo 4: Se ainda aparecer "Unable to Load Script"

**No dispositivo Android:**

1. Abra o app RadarBot
2. Pressione **Ctrl+M** (se estiver com USB debugging) ou **agite o dispositivo**
3. Selecione **Settings**
4. Em **Debug server host & port for device**, digite:
   ```
   10.0.2.2:8081
   ```
   (ou o IP do seu computador na rede Wi-Fi, se ambos estiverem na mesma rede)

## 🎯 Resumo:

1. ✅ Metro bundler rodando (`npm start`)
2. ✅ Port forwarding configurado (8081 → 8081)
3. ✅ Abrir app manualmente no dispositivo
4. ✅ Se necessário, configurar IP manualmente no menu de desenvolvedor

Depois disso, o app deve carregar normalmente! 🎉


# 🔌 Configurar Port Forwarding - Solução Definitiva

## 📱 Você está vendo o erro no dispositivo!
Isso significa que:
- ✅ App instalado corretamente
- ✅ App iniciado
- ❌ **Dispositivo não consegue acessar o Metro bundler**

## 🎯 SOLUÇÃO EM 3 PASSOS:

### Passo 1: Certifique-se que o Metro bundler está rodando

**O Metro bundler JÁ está rodando** (porta 8081).

Você pode verificar acessando no navegador do seu computador:
```
http://localhost:8081
```

Se aparecer uma página com informações do Metro, está funcionando! ✅

### Passo 2: Configure o Port Forwarding no Android Studio

**Este é o passo mais importante!**

1. **Abra o Android Studio**

2. **Conecte seu dispositivo Android via USB**

3. **Abra o Device Manager:**
   - Clique no ícone **Device Manager** na barra lateral direita
   - Ou vá em: View > Tool Windows > Device Manager

4. **Selecione seu dispositivo:**
   - Você verá seu dispositivo listado (ex: "M2101K6G - 13")
   - Clique nele

5. **Abra o Port Forwarding:**
   - Clique no ícone de **engrenagem** ou no menu do dispositivo
   - Ou procure por "Port forwarding" / "Port forwarding rules"

6. **Adicione uma nova regra:**
   - Clique no botão **+** (mais)
   - Preencha:
     ```
     Host port:    8081
     Device port:  8081
     ```
   - Clique em **OK**

7. **Verifique se a regra apareceu:**
   - Você deve ver: `8081 → 8081` na lista
   - Se aparecer, está configurado! ✅

### Passo 3: Recarregue o App no Dispositivo

**No seu dispositivo Android:**

1. **Pressione o botão "RELOAD (R, R)"** na tela de erro
   - Ou feche o app e abra novamente

2. **O app deve carregar normalmente!** 🎉

## 🆘 Se ainda não funcionar:

### Alternativa: Configurar IP Manualmente

1. **No dispositivo, pressione Ctrl+M** (ou agite o dispositivo)
   - Isso abre o menu de desenvolvedor do React Native

2. **Selecione "Settings"**

3. **Em "Debug server host & port for device":**
   - Para USB: Digite `10.0.2.2:8081`
   - Para Wi-Fi (mesma rede): Digite `SEU_IP:8081`
     - Para descobrir seu IP: `ipconfig` no PowerShell

4. **Feche e reabra o app**

## ✅ Checklist:

- [x] Metro bundler rodando na porta 8081
- [ ] Port forwarding configurado (8081 → 8081)
- [ ] Dispositivo conectado via USB
- [ ] App recarregado no dispositivo

## 📸 Onde encontrar Port Forwarding no Android Studio:

```
Android Studio
  └─> Device Manager (barra lateral direita)
      └─> Seu dispositivo (ex: "M2101K6G - 13")
          └─> Ícone de engrenagem ou menu
              └─> Port forwarding
                  └─> Botão + (adicionar)
                      └─> Host: 8081, Device: 8081
```

Depois de configurar, pressione **RELOAD** no app! 🚀


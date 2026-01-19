# 🚀 Como Iniciar o App RadarBot

## ✅ Status Atual:

- ✅ **Build:** SUCESSO
- ✅ **App instalado:** SIM (no dispositivo M2101K6G - 13)
- ⚠️ **Início automático:** Falhou (não é crítico)

## 🎯 Solução Simples:

### Passo 1: Inicie o Metro Bundler

Abra um terminal e execute:

```bash
npm start
```

**Deixe esse terminal aberto e rodando!**

### Passo 2: Configure o Port Forwarding

**No Android Studio:**

1. Abra o **Android Studio**
2. Clique no ícone **Device Manager** (barra lateral direita)
3. Selecione seu dispositivo **M2101K6G - 13**
4. Clique no ícone de **engrenagem** ou menu do dispositivo
5. Selecione **Port forwarding**
6. Clique no botão **+** (mais)
7. Configure:
   - **Host port:** `8081`
   - **Device port:** `8081`
8. Clique em **OK**

Você deve ver a regra: `8081 → 8081` aparecer na lista.

### Passo 3: Abra o App no Dispositivo

**No seu dispositivo Android (M2101K6G - 13):**

1. Encontre o app **RadarBot** na lista de apps
2. Toque no ícone para abrir
3. O app deve se conectar ao Metro bundler e carregar! 🎉

## 🆘 Se aparecer "Unable to Load Script":

1. **No dispositivo**, pressione **Ctrl+M** (ou agite o dispositivo)
2. Selecione **Settings**
3. Em **Debug server host & port for device**, digite:
   ```
   10.0.2.2:8081
   ```
4. Feche e reabra o app

## 📋 Checklist:

- [ ] Metro bundler rodando (`npm start`)
- [ ] Port forwarding configurado (8081 → 8081)
- [ ] Dispositivo conectado via USB
- [ ] App aberto no dispositivo

## 💡 Nota:

O erro que você viu (`Command failed with exit code 1: adb shell am start`) **não é crítico**. Significa apenas que o React Native CLI não conseguiu iniciar o app automaticamente porque o `adb` não está no PATH do sistema.

**Isso não impede o app de funcionar!** Basta abrir o app manualmente no dispositivo após configurar o port forwarding.

---

**Resumo:** O app está instalado e pronto. Configure o port forwarding e abra o app manualmente no dispositivo! 🚀

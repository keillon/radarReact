# Como Ver Logs em Build Release (APK)

## Método 1: Painel de Debug na Tela (Recomendado)

O app agora tem um **painel de debug** que mostra todos os logs diretamente na tela!

### Como usar:
1. **Toque 3 vezes** no ícone 📊 no canto superior direito da tela
2. O painel aparecerá mostrando todos os `console.log`, `console.warn` e `console.error`
3. Toque novamente para ocultar

### O que aparece:
- ✅ Todos os logs do app em tempo real
- ✅ Timestamp de cada log
- ✅ Cores diferentes para log/warn/error
- ✅ Últimos 50 logs (scroll para ver mais)

---

## Método 2: ADB Logcat (Logs do Android)

Para ver logs nativos do Android e do React Native:

### 1. Conectar dispositivo via USB
```bash
adb devices
```

### 2. Ver todos os logs do app
```bash
adb logcat | grep -E "ReactNativeJS|MapboxNavigationView|RadarBot"
```

### 3. Ver apenas logs do React Native (JavaScript)
```bash
adb logcat *:S ReactNativeJS:V
```

### 4. Ver logs do Mapbox Navigation
```bash
adb logcat | grep -i "mapbox\|radar"
```

### 5. Salvar logs em arquivo
```bash
adb logcat > logs.txt
# Depois pressione Ctrl+C para parar
```

### 6. Limpar logs anteriores e ver apenas novos
```bash
adb logcat -c && adb logcat | grep -E "ReactNativeJS|Mapbox"
```

---

## Método 3: React Native Debugger (Apenas em Dev)

Para builds de desenvolvimento, você pode usar:

1. **Shake o dispositivo** (ou `adb shell input keyevent 82`)
2. Selecione **"Debug"**
3. Abra o Chrome DevTools em `chrome://inspect`

**⚠️ Isso NÃO funciona em builds release!**

---

## Método 4: Habilitar Logs em Release Build

Se quiser forçar logs mesmo em release, edite `android/app/src/main/java/radarbot/MainApplication.kt`:

```kotlin
override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, /* native exopackage */ false)
    
    // Habilitar logs mesmo em release
    if (BuildConfig.DEBUG) {
        // Logs já habilitados em debug
    } else {
        // Forçar logs em release (remover em produção final!)
        android.util.Log.d("RadarBot", "Release build com logs habilitados")
    }
}
```

---

## Logs Importantes para Debug

### Verificar se radares estão sendo carregados:
```bash
adb logcat | grep -E "Map:|radares recebidos|GeoJSON"
```

### Verificar se imagens estão sendo carregadas:
```bash
adb logcat | grep -E "Imagem|Image|placa"
```

### Verificar erros do Mapbox:
```bash
adb logcat | grep -E "Mapbox|Error|Exception"
```

### Ver todos os logs do React Native:
```bash
adb logcat *:S ReactNativeJS:V ReactNative:V
```

---

## Dica: Filtrar Logs Específicos

### Apenas logs do componente Map:
```bash
adb logcat | grep "🗺️\|📍\|📦\|🖼️"
```

### Apenas erros:
```bash
adb logcat *:E
```

### Apenas warnings:
```bash
adb logcat *:W
```

---

## Troubleshooting

### "adb: command not found"
- Instale o Android SDK Platform Tools
- Adicione ao PATH: `C:\Users\SeuUsuario\AppData\Local\Android\Sdk\platform-tools`

### "device not found"
- Habilite "Depuração USB" nas opções de desenvolvedor
- Autorize o computador no dispositivo

### Logs não aparecem
- Verifique se o app está rodando
- Tente `adb logcat -c` para limpar cache
- Reinicie o app

---

## Exemplo de Uso Completo

```bash
# 1. Limpar logs antigos
adb logcat -c

# 2. Iniciar app no dispositivo

# 3. Ver logs em tempo real
adb logcat | grep -E "ReactNativeJS|MapboxNavigationView|RadarBot|Map:"
```


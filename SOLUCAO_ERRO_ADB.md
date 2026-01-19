# 🔧 Solução: Erro de Conexão ADB

## Problema
```
java.io.IOException: Uma conexão estabelecida foi anulada pelo software no computador host
com.android.ddmlib.InstallException: Uma conexão estabelecida foi anulada pelo software no computador host
```

Este erro ocorre quando a conexão ADB é interrompida durante a instalação do APK.

## Soluções

### 1. Reiniciar ADB
```bash
# No terminal (Git Bash ou CMD)
adb kill-server
adb start-server
adb devices
```

### 2. Verificar Conexão do Dispositivo
- Verifique se o cabo USB está bem conectado
- Tente usar outro cabo USB
- Verifique se o modo de depuração USB está ativo no dispositivo
- Tente desconectar e reconectar o dispositivo

### 3. Instalar APK Manualmente
Se o problema persistir, você pode instalar o APK manualmente:

```bash
# 1. Compilar o APK sem instalar
cd android
./gradlew assembleDebug

# 2. Instalar manualmente
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### 4. Limpar e Recompilar
```bash
cd android
./gradlew clean
cd ..
npx react-native run-android
```

### 5. Verificar se o Dispositivo Está Reconhecido
```bash
adb devices
```

Deve mostrar algo como:
```
List of devices attached
M2101K6G      device
```

Se mostrar "unauthorized", você precisa autorizar o dispositivo no celular.

## Solução Rápida

1. Desconecte e reconecte o dispositivo
2. Execute:
   ```bash
   adb kill-server && adb start-server
   ```
3. Tente novamente:
   ```bash
   npx react-native run-android
   ```

## Nota
Este erro não está relacionado ao código. É um problema de conexão entre o computador e o dispositivo Android.


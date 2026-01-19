# Como Gerar APK do RadarBot

## APK de Release (Produção)

### 1. Gerar APK Release

```bash
cd android
./gradlew assembleRelease
```

**Localização do APK:**

```
android/app/build/outputs/apk/release/app-release.apk
```

### 2. Gerar APK Assinado (Recomendado para produção)

Para publicar na Play Store, você precisa de um keystore assinado:

#### Criar Keystore (primeira vez):

```bash
cd android/app
keytool -genkeypair -v -storetype PKCS12 -keystore radarbot-release-key.keystore -alias radarbot-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

#### Configurar assinatura no `android/app/build.gradle`:

```gradle
android {
    ...
    signingConfigs {
        release {
            if (project.hasProperty('MYAPP_RELEASE_STORE_FILE')) {
                storeFile file(MYAPP_RELEASE_STORE_FILE)
                storePassword MYAPP_RELEASE_STORE_PASSWORD
                keyAlias MYAPP_RELEASE_KEY_ALIAS
                keyPassword MYAPP_RELEASE_KEY_PASSWORD
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled enableProguardInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
        }
    }
}
```

#### Criar arquivo `android/gradle.properties` (adicionar):

```
MYAPP_RELEASE_STORE_FILE=radarbot-release-key.keystore
MYAPP_RELEASE_KEY_ALIAS=radarbot-key-alias
MYAPP_RELEASE_STORE_PASSWORD=*****
MYAPP_RELEASE_KEY_PASSWORD=*****
```

### 3. Gerar AAB (Android App Bundle) para Play Store

```bash
cd android
./gradlew bundleRelease
```

**Localização do AAB:**

```
android/app/build/outputs/bundle/release/app-release.aab
```

## APK de Debug (Desenvolvimento)

```bash
cd android
./gradlew assembleDebug
```

**Localização do APK:**

```
android/app/build/outputs/apk/debug/app-debug.apk
```

## Tamanho do APK

O APK de release geralmente tem entre 30-50 MB devido às bibliotecas nativas do Mapbox.

## Notas Importantes

⚠️ **IMPORTANTE**: O APK atual está usando o keystore de debug. Para produção, você DEVE criar e usar um keystore próprio.

⚠️ **Segurança**: Nunca commite o arquivo `gradle.properties` com senhas no Git. Adicione ao `.gitignore`.

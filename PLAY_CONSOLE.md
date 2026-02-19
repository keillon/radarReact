# Publicar RadarZone no Google Play Console

Guia para a **primeira publicação** do app em produção no Google Play.

---

## 1. Pré-requisitos

- Conta Google (desenvolvedor)
- [Conta de desenvolvedor no Google Play](https://play.google.com/console/signup) (taxa única ~US$ 25)
- Java JDK instalado (para gerar o keystore)

---

## 2. Configurar assinatura de release

O app precisa ser assinado com um **keystore de release** (não use o debug na loja).

### 2.1 Gerar o keystore (uma vez só)

No Windows, na raiz do projeto:

```bash
npm run gen-keystore
```

Ou manualmente:

```bash
cd android\app
keytool -genkeypair -v -storetype PKCS12 -keystore radarzone-release.keystore -alias radarzone -keyalg RSA -keysize 2048 -validity 10000
```

Anote as senhas que você definir (senha da loja e senha da chave). **Guarde-as em local seguro** — sem elas você não consegue atualizar o app na Play Store.

### 2.2 Configurar keystore no projeto

1. Copie o modelo de configuração:
   - De: `android/keystore.properties.example`
   - Para: `android/keystore.properties`

2. Edite `android/keystore.properties` e preencha com as senhas que você definiu:

```properties
storeFile=radarzone-release.keystore
storePassword=SUA_SENHA_DA_LOJA
keyAlias=radarzone
keyPassword=SUA_SENHA_DA_CHAVE
```

3. **Nunca** faça commit de `keystore.properties` nem do arquivo `.keystore` (já estão no `.gitignore`).

---

## 3. Gerar o Android App Bundle (AAB)

A Play Store exige **AAB** (não mais APK) para novas publicações.

Na raiz do projeto (Windows):

```bash
npm run build:aab
```

Ou com patch aplicado e bundle completo:

```bash
npm run build:android:bundle:full
```

**Saída do AAB:**

- Caminho: `android/app/build/outputs/bundle/release/app-release.aab`

Em **Mac/Linux**, use:

```bash
cd android && ./gradlew bundleRelease
```

---

## 4. No Google Play Console

### 4.1 Criar o app

1. Acesse [Google Play Console](https://play.google.com/console).
2. **Criar app** → preencha nome do app, idioma padrão, tipo (app ou jogo), etc.

### 4.2 Conteúdo obrigatório antes de publicar

Preencha todas as seções do menu lateral:

| Seção | O que fazer |
|-------|-------------|
| **Painel** | Acompanhar status e tarefas pendentes |
| **Release** → Produção | Criar nova versão e fazer upload do **app-release.aab** |
| **Política** → Política de privacidade | URL de uma página com a política de privacidade do app (obrigatório) |
| **Política** → App access | Declarar se o app precisa de login ou é totalmente público |
| **Política** → Ads | Marcar “Sim” ou “Não” se o app exibe anúncios |
| **Crescimento** → Listagem na Play Store | Título, descrição curta, descrição longa, ícone 512x512, screenshots (mínimo por tipo de dispositivo) |
| **Crescimento** → Catálogo de apps | Categoria (ex.: Navegação ou Utilitários) |
| **Classificação** → Questionário de conteúdo | Preencher questionário de classificação etária |
| **Classificação** → Público-alvo | Faixa etária e se é para crianças ou não |

### 4.3 Fazer upload do AAB

1. **Release** → **Produção** (ou um track de teste primeiro).
2. **Criar nova versão**.
3. **Fazer upload** do arquivo `app-release.aab`.
4. Preencher **nome da versão** e **notas da versão** (o que mudou).
5. **Revisar e enviar** a versão para análise.

### 4.4 Permissões e declarações

O app usa **localização** e **notificações**. No Console:

- Em **Política** → **Permissões**, declare o uso de localização em primeiro plano (ex.: navegação).
- Se usar notificações, declare na lista de permissões e, se necessário, na política de privacidade.

---

## 5. Checklist antes de enviar

- [ ] Keystore de release gerado e **backup guardado** (arquivo + senhas).
- [ ] `android/keystore.properties` preenchido (e **não** versionado).
- [ ] AAB gerado com `npm run build:aab`.
- [ ] Política de privacidade publicada em uma URL acessível.
- [ ] Listagem da Play Store preenchida (título, descrição, ícone, screenshots).
- [ ] Questionário de conteúdo e público-alvo concluídos.
- [ ] Upload do `app-release.aab` em Produção (ou em um track de teste).

---

## 6. Atualizações futuras

Para cada nova versão:

1. Aumentar **versionCode** e **versionName** em `android/app/build.gradle`:
   - `versionCode 2` → 3, 4, …
   - `versionName "1.1"` → "1.2", …
2. Gerar novo AAB: `npm run build:aab`.
3. Em **Release** → **Produção**, criar nova versão e fazer upload do novo AAB.

---

## 7. Onde fica cada coisa no projeto

| Item | Caminho |
|------|---------|
| Versão do app (Android) | `android/app/build.gradle` → `versionCode`, `versionName` |
| applicationId (pacote) | `android/app/build.gradle` → `defaultConfig.applicationId` ("com.radarzone") |
| AAB de release | `android/app/build/outputs/bundle/release/app-release.aab` |
| Modelo de keystore | `android/keystore.properties.example` |
| Script gerar keystore | `scripts/gen-keystore.bat` ou `npm run gen-keystore` |

Se algo falhar no build, confira se o **MAPBOX_DOWNLOADS_TOKEN** está definido em `android/gradle.properties` (ou em variável de ambiente) para o build Android concluir.

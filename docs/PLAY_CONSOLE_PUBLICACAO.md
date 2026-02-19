# Publicar RadarZone no Google Play Console

Guia para a **primeira publicação** do app em produção.

---

## Parte 1: Preparar o build no projeto

### 1.1 Gerar keystore de release (uma vez só)

No Windows:
```bash
npm run gen-keystore
```

O script pede nome, organização e **duas senhas** (store e key). **Anote e guarde em lugar seguro**; sem elas você não consegue atualizar o app depois.

- Keystore gerado em: `android/app/radarzone-release.keystore`
- **Faça backup** desse arquivo (e das senhas). Se perder, não dá para publicar atualizações com o mesmo app.

### 1.2 Configurar assinatura

1. Copie o exemplo:
   - De: `android/keystore.properties.example`
   - Para: `android/keystore.properties`
2. Abra `android/keystore.properties` e preencha com as **mesmas senhas** que usou no passo anterior:
   - `storePassword` e `keyPassword` = senha que você definiu
   - `storeFile=radarzone-release.keystore`
   - `keyAlias=radarzone`

**Não versionar** `keystore.properties` nem o `.keystore` (já estão no `.gitignore`).

### 1.3 Gerar o AAB (Android App Bundle)

O Play Console exige **AAB**, não APK, para novas publicações.

**Windows (CMD/PowerShell):**
```bash
npm run build:android:bundle
```

**Mac/Linux ou Git Bash no Windows:**
```bash
npm run build:aab
```

Saída do AAB:
```
android/app/build/outputs/bundle/release/app-release.aab
```

Use esse arquivo para enviar na Play Console.

---

## Parte 2: Play Console (primeira vez)

Acesse: [Google Play Console](https://play.google.com/console).

### 2.1 Conta e pagamento

- Conta Google (ex.: Gmail).
- **Conta de desenvolvedor** (taxa única, ~US$ 25): em “Configurações” ou no fluxo de criação do app.
- Forma de pagamento ativa (mesmo para app gratuito).

### 2.2 Criar o app

1. **Criar aplicativo** (nome exibido: ex. **RadarZone**).
2. **Detalhes**:
   - App ou jogo: **App**  
   - Gratuito ou pago: **Gratuito** (ou pago, se for o caso)
3. Declarações: marque que concorda com política do desenvolvedor e que o app cumpre as políticas (incl. política de privacidade).

### 2.3 Ficha da loja (Store listing)

Preencher para pelo menos um idioma (ex.: Português – Brasil):

| Campo | Exemplo / orientação |
|-------|----------------------|
| Nome do app | RadarZone (até 30 caracteres) |
| Descrição curta | Até 80 caracteres. Ex.: "Alertas de radares e limites de velocidade no seu trajeto." |
| Descrição completa | Até 4000 caracteres. Descreva o que o app faz, recursos, uso de localização, etc. |
| Ícone do app | 512 x 512 px, PNG 32 bits |
| Gráfico de recursos (feature graphic) | 1024 x 500 px |
| Capturas de tela | Pelo menos 2 (phone e/ou 7" tablet), dentro dos tamanhos exigidos |

### 2.4 Política de privacidade

- **Obrigatório** ter uma URL pública com a política de privacidade.
- Deve explicar quais dados são coletados (ex.: localização, conta, uso do app), para que são usados e com quem são compartilhados.
- Se usar apenas localização em tempo real para alertas e não enviar para terceiros, deixe isso claro na política.
- Coloque a URL na Play Console em **Política do app** / **Política de privacidade**.

### 2.5 Classificação de conteúdo

- Inicie o questionário de **Classificação de conteúdo**.
- Responda conforme o app (ex.: sem conteúdo sensível, uso de localização, etc.).
- Guarde o resultado (ex.: “Para todos os públicos” ou “Adolescentes”) e o comprovante (ID) que a Play Console gera.

### 2.6 Público-alvo e notícias

- **Público-alvo**: defina faixa etária (e se há crianças).
- **Notícias**: se o app não for para crianças, declare que não é direcionado a crianças, conforme solicitado.

### 2.7 Segurança de dados (formulário de privacidade)

- Preencha o formulário sobre coleta de dados (localização, identificadores, etc.).
- Indique se os dados são compartilhados com terceiros, se são opcionais ou obrigatórios, e se são criptografados em trânsito.

### 2.8 Enviar a versão para produção

1. No menu do app: **Versão** > **Produção** (ou **Produção** > **Versões**).
2. **Criar nova versão**.
3. **Fazer upload do AAB**:  
   `android/app/build/outputs/bundle/release/app-release.aab`
4. **Nome da versão**: ex. “1.0 (1)” (ou o que a console sugerir).
5. **Notas da versão**: texto que o usuário vê na loja (ex.: “Primeira versão. Alertas de radares e limites de velocidade.”).
6. Salvar e depois **Revisar e enviar para produção** (ou equivalente).
7. O app entra em análise; a primeira revisão pode levar alguns dias.

---

## Resumo rápido (já com keystore e keystore.properties prontos)

1. Gerar AAB: `npm run build:android:bundle` (Windows) ou `npm run build:aab` (Mac/Linux).
2. Abrir Play Console → seu app → Versão → Produção.
3. Fazer upload de `android/app/build/outputs/bundle/release/app-release.aab`.
4. Preencher notas da versão e enviar para revisão.

---

## Dados do app (referência)

| Campo | Valor |
|-------|--------|
| **applicationId** | `com.radarzone` |
| **versionCode** | 1 (em `android/app/build.gradle`; incremente a cada release) |
| **versionName** | 1.0 (exibido na loja; ex.: 1.1, 2.0) |

Para próximas versões: aumente `versionCode` (obrigatório) e, se quiser, `versionName` em `android/app/build.gradle`, gere um novo AAB e envie na mesma trilha de Produção.

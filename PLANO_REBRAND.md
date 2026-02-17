# Plano de Rebrand: radarbot → radarZone + Tema Amarelo/Preto/Branco

## Parte 1: Renomear radarbot → radarZone

### 1.1 Android (Kotlin/Java)

| Item | Localização | Alteração |
|------|-------------|-----------|
| **Pasta do pacote** | `android/app/src/main/java/radarbot/` | Renomear para `radarzone/` |
| **Subpasta** | `android/app/src/main/java/radarbot/navigation/` | → `radarzone/navigation/` |
| **MainActivity.kt** | `package radarbot` | → `package radarzone` |
| **MainApplication.kt** | `package radarbot` | → `package radarzone` |
| **VolumeModule.kt** | `package radarbot` | → `package radarzone` |
| **VolumePackage.kt** | `package radarbot` | → `package radarzone` |
| **CustomNavigationPackage.kt** | `package radarbot` | → `package radarzone` |
| **CustomNavigationManager.kt** | `package radarbot` + `import radarbot.navigation` | → `package radarzone` + `import radarzone.navigation` |
| **CustomNavigationEngine.kt** | `package radarbot.navigation` | → `package radarzone.navigation` |
| **build.gradle** | `namespace "radarbot"` | → `namespace "radarzone"` |
| **build.gradle** | `applicationId "com.radarbot"` | → `applicationId "com.radarzone"` |

**Arquivos afetados:**
- `android/app/src/main/java/radarbot/*.kt` (todos)
- `android/app/build.gradle`
- `AndroidManifest.xml` usa `.MainApplication` e `.MainActivity` (relativos ao namespace) — **verificar** se continua válido após mudança de namespace

> ⚠️ **Atenção:** Alterar `applicationId` faz o app ser tratado como um app **novo** na Play Store. Usuários precisarão desinstalar o antigo e instalar o novo. Faça backup antes.

### 1.2 JavaScript/TypeScript

| Localização | Chave/Valor atual | Novo valor |
|-------------|-------------------|------------|
| `package.json` | `"name": "radarbot"` | `"name": "radarzone"` |
| `package-lock.json` | `"name": "radarbot"` | `"name": "radarzone"` |
| `utils/settingsStore.ts` | `SETTINGS_KEY = "radarbot_settings"` | `"radarzone_settings"` |
| `services/authApi.ts` | `AUTH_TOKEN_KEY = "radarbot_auth_token"` | `"radarzone_auth_token"` |
| `services/authApi.ts` | `AUTH_USER_KEY = "radarbot_auth_user"` | `"radarzone_auth_user"` |
| `screens/Home.tsx` | `DEVICE_USER_ID_KEY = "radarbot_device_user_id"` | `"radarzone_device_user_id"` |

### 1.3 strings.xml (Android)

| Atual | Novo |
|-------|------|
| `<string name="app_name">RadarBot</string>` | `<string name="app_name">RadarZone</string>` |

### 1.4 Backend (opcional, se quiser consistência)

Se o backend mencionar "radarbot" em rotas, emails ou logs, ajustar para "radarzone". Não obrigatório para o app mobile.

---

## Parte 2: Tema Amarelo / Preto / Branco

### 2.1 Paleta de cores

| Uso | Cor hex | Descrição |
|-----|---------|-----------|
| **Primary (botões, destaque, ativo)** | `#FFC107` ou `#FBBF24` | Amarelo principal |
| **Primary escuro (hover/pressed)** | `#E6A800` ou `#D4A017` | Amarelo mais escuro |
| **Background escuro** | `#0d0d0d` / `#1a1a1a` / `#262626` | Preto e tons |
| **Background claro** | `#ffffff` / `#f5f5f5` | Branco e cinza claro |
| **Texto em fundo escuro** | `#ffffff` / `#e8e8e8` | Branco |
| **Texto em fundo claro** | `#111111` / `#333333` | Preto/cinza escuro |
| **Texto secundário** | `#808080` / `#999999` | Cinza neutro |
| **Borda/cards escuros** | `#333333` / `#404040` | Cinza escuro |
| **Borda/cards claros** | `#d1d1d1` / `#e5e5e5` | Cinza claro |
| **Erro** | `#dc2626` ou `#ef4444` | Vermelho (manter) |
| **Sucesso** | `#FFC107` ou `#22c55e` | Amarelo ou verde (escolher um) |

### 2.2 Arquivo de constantes (RECOMENDADO)

Criar `utils/theme.ts`:

```ts
export const colors = {
  primary: "#FFC107",
  primaryDark: "#E6A800",
  background: "#0d0d0d",
  backgroundCard: "#1a1a1a",
  backgroundLight: "#ffffff",
  backgroundLightSecondary: "#f5f5f5",
  text: "#ffffff",
  textSecondary: "#a0a0a0",
  textDark: "#111111",
  textDarkSecondary: "#666666",
  border: "#333333",
  borderLight: "#e0e0e0",
  error: "#ef4444",
  success: "#22c55e",
};
```

### 2.3 Arquivos a alterar (por componente)

| Arquivo | Cores atuais | O que trocar |
|---------|--------------|---------------|
| `components/MenuModal.tsx` | #3b82f6, #1e293b, #334155, #64748b, #94a3b8, #e2e8f0, #1e40af, #9d174d | → tema amarelo/preto/branco |
| `components/SearchContainer.tsx` | #3b82f6, #d1d5db, #f3f4f6, #111827, #374151 | → tema |
| `components/Map.tsx` | #3b82f6, #60a5fa, #10b981, #f59e0b, #ef4444 | → amarelo para primary, manter semântica (verde=ok, vermelho=erro) |
| `components/NavigationView.tsx` | #1f2937, #3b82f6, #dc2626, #374151 | → tema |
| `components/SimpleNavigation.tsx` | #4285F4, #4CAF50, #F44336 | → amarelo/preto |
| `components/VignetteOverlay.tsx` | rgba(0,0,0,0.5), #fff | → ajustar se necessário |
| `components/DebugPanel.tsx` | rgba, #fff | → manter escuro, ajustar detalhes |
| `screens/Home.tsx` | Muitas cores inline | → substituir por theme |
| `screens/LoginScreen.tsx` | #0f172a, #1e293b, #334155, #3b82f6 | → tema |
| `screens/RegisterScreen.tsx` | Idem | → tema |
| `screens/RadarEditorScreen.tsx` | Idem | → tema |
| `App.tsx` | #3b82f6 (ActivityIndicator) | → colors.primary |
| `admin/src/App.tsx` | Se o admin for parte do ecossistema | → tema |
| `admin/src/Map.tsx` | #fbbf24, etc | → alinhar com app |

### 2.4 Mapeamento de substituição em massa

| Cor antiga | Uso | Nova cor |
|------------|-----|----------|
| `#3b82f6` | Primary, botões, links | `#FFC107` |
| `#1e40af` | Primary escuro | `#E6A800` |
| `#1e293b` | Background escuro | `#1a1a1a` |
| `#0f172a` | Background muito escuro | `#0d0d0d` |
| `#334155` | Cards, bordas | `#262626` |
| `#64748b` | Texto secundário | `#999999` |
| `#94a3b8` | Texto terciário | `#808080` |
| `#e2e8f0` | Texto claro | `#e8e8e8` |
| `#9d174d` | Feminino (rosa) | `#B45309` (âmbar) ou manter contraste |
| `#f3f4f6` | BG claro | `#f5f5f5` |
| `#e5e7eb` | Borda claro | `#e0e0e0` |
| `#374151` | Texto escuro | `#333333` |
| `#1f2937` | Header/bg | `#1a1a1a` |
| `#111827` | Mais escuro | `#0d0d0d` |
| `#dc2626` | Erro/botão parar | Manter ou `#ef4444` |
| `#10b981` | Sucesso | `#22c55e` ou `#FFC107` |
| `#60a5fa` | Azul claro | `#FFD54F` (amarelo claro) |

---

## Ordem de execução sugerida

### Fase 1: Preparação
1. Criar branch: `git checkout -b rebrand-radarzone`
2. Criar `utils/theme.ts` com as constantes de cores
3. Backup/cópia dos arquivos Android antes de mexer nas pastas

### Fase 2: radarbot → radarZone
1. Criar `android/app/src/main/java/radarzone/` e `radarzone/navigation/`
2. Copiar arquivos `.kt` para as novas pastas
3. Atualizar todos os `package` e `import` nos arquivos Kotlin
4. Remover pasta `radarbot/` antiga
5. Atualizar `build.gradle` (namespace, applicationId)
6. Atualizar `strings.xml` (app_name)
7. Atualizar `package.json`, `package-lock.json`
8. Atualizar chaves em `settingsStore.ts`, `authApi.ts`, `Home.tsx`
9. Rodar `npm run android` e validar

### Fase 3: Tema Amarelo/Preto/Branco
1. Importar `colors` de `utils/theme.ts` em cada componente
2. Substituir cores hardcoded por `colors.xxx`
3. Para cores em estilos inline/objeto, usar as constantes
4. Testar todos os fluxos: login, cadastro, menu, navegação, reportar radar, etc.
5. Rodar `npm run android` e validar visualmente

### Fase 4: Validação final
1. Testar em dispositivo físico
2. Verificar ícones/launcher (opcional: trocar para amarelo/preto)
3. Limpar build: `cd android && ./gradlew clean` (ou gradlew.bat)
4. Rebuild completo

---

## Checklist antes de commitar

- [ ] App inicia sem crash
- [ ] Login e cadastro funcionam
- [ ] Menu e configurações abrem
- [ ] Navegação inicia e mostra radares
- [ ] Reportar radar funciona
- [ ] Cores aplicadas em todos os fluxos
- [ ] Nenhuma referência a "radarbot" restante (exceto em comentários/migrations se necessário)

# Billing – Planos RadarZone

O app tem **dois planos**:

1. **Grátis (com anúncios)** – tudo liberado por **1 mês** (configurável). Depois o usuário pode assinar PRO.
2. **PRO** – R$ 9,90/mês nos **3 primeiros meses**, depois **R$ 14,90/mês**. Sem anúncios.

---

## ID do produto (assinatura PRO)

```
radarzone_premium_mensal
```

Use este ID na Play Console e no App Store Connect para a assinatura PRO.

---

## Plano grátis (1 mês com anúncios)

- Na **primeira abertura** do app é gravada a data de início do período grátis (AsyncStorage).
- Durante **30 dias** o usuário tem acesso completo com **anúncios** (banner na parte inferior).
- Após 30 dias, o app continua funcionando; a tela de assinatura mostra que o período grátis acabou e incentiva assinar PRO.

### Como mudar a duração do período grátis

No código, em **`constants/iap.ts`**:

```ts
export const FREE_PERIOD_DURATION_DAYS = 30;  // Altere para 14, 60, etc.
```

Para mudar **sem nova versão** no futuro, você pode:
- Ler esse valor de um **Remote Config** (Firebase, etc.) e usar no IAPContext, ou
- Ajustar em uma atualização do app.

---

## Plano PRO (R$ 9,90 → R$ 14,90)

- **Preço introdutório:** R$ 9,90/mês nos **3 primeiros meses**.
- **Preço padrão:** R$ 14,90/mês após os 3 meses.

Configure isso nas lojas usando **oferta introdutória** (não é preciso criar dois produtos).

---

## Google Play Console (Android)

1. **Monetização** → **Produtos** → **Assinaturas** → **Criar assinatura**.
2. **ID do produto:** `radarzone_premium_mensal`.
3. **Nome:** RadarZone PRO.
4. **Plano de cobrança (base):**
   - Período: **Mensal**.
   - Preço: **R$ 14,90** (preço após a oferta).
5. **Oferta introdutória:**
   - Adicione uma **oferta** com preço **R$ 9,90** por **3 períodos** (3 meses).
   - Assim a loja cobra 9,90 nos 3 primeiros meses e 14,90 depois.
6. Salve e ative. Use **licenças de teste** para testar compras.

---

## App Store Connect (iOS)

1. **Assinaturas** → grupo (ex.: "PRO") → **Criar assinatura** (Auto-Renovável).
2. **ID de referência:** `radarzone_premium_mensal`.
3. **Preço:** nível que corresponda a **R$ 14,90/mês** no Brasil.
4. **Oferta introdutória:**
   - Adicione **Preço introdutório** ou **Oferta** com **R$ 9,90** por **3 meses**.
5. Para testar use **Sandbox** (Usuários e acesso → Sandbox).

---

## Anúncios (plano grátis)

- O banner aparece na **parte inferior** da tela principal quando o usuário está no **período grátis** e **não** é assinante PRO.
- Hoje o app usa um **placeholder** (área reservada). Para exibir anúncios reais:

1. Crie um app no **Google AdMob** e obtenha o **App ID** (Android e iOS) e um **ID de banner**.
2. Instale: `npm install react-native-google-mobile-ads`.
3. Configure o App ID no projeto (Android: `AndroidManifest.xml` / `build.gradle`; iOS: `Info.plist`). Siga a documentação do [react-native-google-mobile-ads](https://github.com/invertase/react-native-google-mobile-ads).
4. No componente **`AdBanner`** (`components/AdBanner.tsx`), passe seu **ad unit ID** pela prop `adUnitId` ou substitua os IDs de teste pelos seus.

Os IDs de **teste** do Google já estão no `AdBanner` para desenvolvimento; em produção use seus próprios IDs.

---

## No app

- **Menu** → **Assinatura Premium**: mostra se está no plano **Grátis** (badge “Grátis”) ou **PRO** (badge “PRO”), e a tela com preço “R$ 9,90/mês nos 3 primeiros meses, depois R$ 14,90/mês”.
- **Acesso completo** = assinante PRO **ou** dentro do período grátis (`hasFullAccess` no `IAPContext`).

---

## Resumo

| Item | Valor |
|------|--------|
| ID produto PRO | `radarzone_premium_mensal` |
| Período grátis | 30 dias (alterar em `constants/iap.ts`) |
| PRO intro | R$ 9,90/mês × 3 meses |
| PRO padrão | R$ 14,90/mês |
| Anúncios | Banner no rodapé no plano grátis (AdMob opcional) |

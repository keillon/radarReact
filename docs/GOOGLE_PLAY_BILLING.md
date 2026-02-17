# Integração Google Play Billing (In-App / Assinaturas)

## 1. O que você precisa ter

### 1.1 Google Play Console
- **Conta desenvolvedor** – [play.google.com/console](https://play.google.com/console) (taxa única ~US$ 25).
- **App criado** – mesmo que em teste fechado; o app precisa existir e estar em algum track (interno, fechado ou produção) para criar produtos.
- **App publicado em pelo menos um track** – para compras reais, o app precisa estar publicado (pode ser só “teste interno” ou “teste fechado”).

### 1.2 No Console: monetização
- Em **Monetização** → **Produtos** → **Assinaturas** ou **Produtos no app**:
  - Criar os produtos (ex.: `radarzone_premium_mensal`, `radarzone_premium_anual`).
  - Definir preços e períodos (para assinaturas).
- **Conta merchant** – vincular conta do Google Pay/merchant para receber pagamentos (se ainda não tiver).
- **Testadores de licença** – em **Configurações** → **Testadores de licença**, adicionar os e-mails das contas Google que vão testar compras sem cobrança real.

### 1.3 No projeto (React Native)
- **Biblioteca:** por exemplo **react-native-iap** (Google Play Billing + Apple IAP no mesmo código).
- **Versão do app:** o build que você usa para testar compras deve ser o **mesmo** que está publicado no track (mesmo `versionCode` no Android). Para desenvolvimento, use **testadores de licença** para não ser cobrado.

---

## 2. Fluxo resumido

1. **Play Console** – criar produtos (IDs, preços, tipo: compra única ou assinatura).
2. **App** – instalar `react-native-iap`, inicializar, listar produtos pelos IDs, chamar compra e tratar conclusão/erro.
3. **Opcional (recomendado para assinaturas)** – backend seu que valida o **purchase token** com a API do Google (evita fraudes e gerencia renovação/cancelamento).

---

## 3. IDs e tipos de produto

- **Produto no app (one-time):** ex. `radarzone_desbloqueio_vitalicio`.
- **Assinatura:** ex. `radarzone_premium_mensal`, `radarzone_premium_anual`.

Use os **mesmos IDs** no código e no Play Console (exatamente iguais).

---

## 4. Validação no backend (opcional mas recomendado)

- Após a compra, o app envia o **purchase token** + **productId** (e, para assinatura, **orderId**) ao seu servidor.
- O servidor chama a **Google Play Developer API** (Android Publisher) para validar o token e saber se a assinatura está ativa.
- Exige **Service Account** no Google Cloud, com acesso à API Android Publisher e permissão no app no Play Console.

---

## 5. Próximos passos no código

1. Instalar: `npm install react-native-iap`
2. Configurar no Android (geralmente só linking; em RN 0.74 pode ser automático).
3. Criar um módulo/serviço (ex.: `services/purchases.ts`) que:
   - Inicializa a conexão com o Google Play (quando o app abre).
   - Lista produtos pelos IDs configurados.
   - Expõe função “comprar” (productId) e trata sucesso/erro/cancelamento.
   - (Opcional) Envia token + productId ao seu backend para validação.
4. Na UI: tela ou modal de “Premium” que lista planos e chama esse serviço para comprar/assinar.
5. Guardar estado “usuário premium” (ex.: AsyncStorage + backend) e usar isso para liberar ou bloquear funcionalidades.

Se quiser, na próxima mensagem podemos fazer passo a passo: instalação da lib, criação do serviço de compras e uma tela simples de “Assinatura” usando os IDs que você definir no Play Console.

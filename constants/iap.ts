/**
 * IDs de produtos de IAP (Google Play e App Store).
 */
/** Deve ser exatamente o "ID do produto" da assinatura no Play Console. */
export const SUBSCRIPTION_PRODUCT_ID = "1";

/** Preço exibido quando a loja ainda não retornou (fallback). */
export const SUBSCRIPTION_PRICE_DISPLAY = "R$ 9,90/mês";

// --- Plano grátis (com anúncios) ---
/** Chave no AsyncStorage para a data de início do período grátis (timestamp). */
export const FREE_PERIOD_START_KEY = "@radarzone/free_period_start";

/**
 * Duração do período grátis em dias (tudo liberado + anúncios).
 * Altere este valor para mudar o tempo (ex.: 14, 60).
 * No futuro pode vir de remote config para alterar sem nova versão.
 */
export const FREE_PERIOD_DURATION_DAYS = 30;

// --- Plano PRO (texto para a UI) ---
/** Preço introdutório PRO: primeiros 3 meses. */
export const PRO_PRICE_INTRO = "R$ 9,90";
/** Preço padrão PRO: após os 3 primeiros meses. */
export const PRO_PRICE_STANDARD = "R$ 14,90";
/** Texto resumido para o botão/lista. */
export const PRO_PRICING_LABEL = "R$ 9,90/mês nos 3 primeiros meses, depois R$ 14,90/mês";

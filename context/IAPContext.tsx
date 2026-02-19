import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  endConnection,
  getAvailablePurchases,
  getSubscriptions,
  initConnection,
  requestSubscription,
} from "react-native-iap";
import {
  FREE_PERIOD_DURATION_DAYS,
  FREE_PERIOD_START_KEY,
  SUBSCRIPTION_PRICE_DISPLAY,
  SUBSCRIPTION_PRODUCT_ID,
} from "../constants/iap";

const ENTITLEMENT_STORAGE_KEY = "@radarzone/premium_entitlement";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type IAPContextValue = {
  isSubscribed: boolean;
  isLoading: boolean;
  subscriptionPrice: string;
  /** Usuário está no período grátis (1 mês com anúncios, tudo liberado). */
  isInFreePeriod: boolean;
  /** Acesso completo: PRO ou período grátis. */
  hasFullAccess: boolean;
  /** Data (timestamp) em que o período grátis termina (para exibir na UI). */
  freePeriodEndsAt: number | null;
  purchaseSubscription: () => Promise<{ success: boolean; error?: string }>;
  restorePurchases: () => Promise<{ success: boolean; error?: string }>;
  refreshSubscriptionStatus: () => Promise<void>;
};

const IAPContext = createContext<IAPContextValue | null>(null);

export function useIAP(): IAPContextValue {
  const ctx = useContext(IAPContext);
  if (!ctx) throw new Error("useIAP must be used within IAPProvider");
  return ctx;
}

function isSubscriptionActive(p: { expirationDate?: number; expirationTime?: string }): boolean {
  if (typeof p.expirationDate === "number") return p.expirationDate > Date.now();
  if (typeof p.expirationTime === "string") {
    const t = parseInt(p.expirationTime, 10);
    if (!isNaN(t)) return t > Date.now();
  }
  return true;
}

/** Produto de assinatura do Android (com subscriptionOfferDetails para offerToken). */
type AndroidSubscriptionProduct = {
  productId?: string;
  subscriptionOfferDetails?: Array<{ offerToken: string }>;
};

export function IAPProvider({ children }: { children: React.ReactNode }) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [subscriptionPrice, setSubscriptionPrice] = useState(SUBSCRIPTION_PRICE_DISPLAY);
  const [freePeriodEndsAt, setFreePeriodEndsAt] = useState<number | null>(null);
  const connected = useRef(false);
  const androidSubscriptionRef = useRef<AndroidSubscriptionProduct | null>(null);

  const isInFreePeriod = freePeriodEndsAt != null && Date.now() < freePeriodEndsAt;
  const hasFullAccess = isSubscribed || isInFreePeriod;

  const refreshSubscriptionStatus = useCallback(async () => {
    try {
      const purchases = await getAvailablePurchases();
      const ourSubscription = purchases.find((p: { productId?: string; productIdentifier?: string }) => {
        const id = p.productId ?? (p as { productIdentifier?: string }).productIdentifier;
        return id === SUBSCRIPTION_PRODUCT_ID;
      });
      const active = ourSubscription != null && isSubscriptionActive(ourSubscription as { expirationDate?: number; expirationTime?: string });
      setIsSubscribed(active);
      await AsyncStorage.setItem(ENTITLEMENT_STORAGE_KEY, active ? "1" : "0");
    } catch (err) {
      setIsSubscribed(false);
      await AsyncStorage.setItem(ENTITLEMENT_STORAGE_KEY, "0");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        let startRaw = await AsyncStorage.getItem(FREE_PERIOD_START_KEY);
        if (startRaw == null) {
          const now = Date.now();
          await AsyncStorage.setItem(FREE_PERIOD_START_KEY, String(now));
          startRaw = String(now);
        }
        const start = parseInt(startRaw, 10);
        if (!isNaN(start) && mounted) {
          setFreePeriodEndsAt(start + FREE_PERIOD_DURATION_DAYS * MS_PER_DAY);
        }

        await initConnection();
        if (!mounted) return;
        connected.current = true;
        const skus = [SUBSCRIPTION_PRODUCT_ID];
        const subs = await getSubscriptions({ skus });
        if (mounted && Array.isArray(subs) && subs.length > 0) {
          const firstSub = subs[0] as { localizedPrice?: string; price?: string; subscriptionOfferDetails?: Array<{ offerToken: string }> };
          if (firstSub.localizedPrice) setSubscriptionPrice(firstSub.localizedPrice + "/mês");
          else if (firstSub.price) setSubscriptionPrice(firstSub.price + "/mês");
          if (Platform.OS === "android" && firstSub.subscriptionOfferDetails?.length) {
            androidSubscriptionRef.current = {
              productId: SUBSCRIPTION_PRODUCT_ID,
              subscriptionOfferDetails: firstSub.subscriptionOfferDetails,
            };
          }
        }
        await refreshSubscriptionStatus();
        const cached = await AsyncStorage.getItem(ENTITLEMENT_STORAGE_KEY);
        if (mounted && cached === "1") setIsSubscribed(true);
      } catch (err) {
        if (mounted) {
          const cached = await AsyncStorage.getItem(ENTITLEMENT_STORAGE_KEY);
          setIsSubscribed(cached === "1");
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
      if (connected.current) {
        endConnection();
        connected.current = false;
      }
    };
  }, [refreshSubscriptionStatus]);

  const purchaseSubscription = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    try {
      if (Platform.OS === "android") {
        let sub = androidSubscriptionRef.current;
        let offers = sub?.subscriptionOfferDetails;
        if (!offers?.length) {
          const skus = [SUBSCRIPTION_PRODUCT_ID];
          const subs = await getSubscriptions({ skus });
          const first = subs?.[0] as { subscriptionOfferDetails?: Array<{ offerToken: string }> } | undefined;
          offers = first?.subscriptionOfferDetails;
          if (offers?.length) {
            androidSubscriptionRef.current = {
              productId: SUBSCRIPTION_PRODUCT_ID,
              subscriptionOfferDetails: offers,
            };
          }
        }
        if (!offers?.length) {
          return {
            success: false,
            error: "Oferta da assinatura não carregada. Verifique se o app está em um track de teste no Play Console e se o produto está ativo.",
          };
        }
        await requestSubscription({
          sku: SUBSCRIPTION_PRODUCT_ID,
          subscriptionOffers: [{ sku: SUBSCRIPTION_PRODUCT_ID, offerToken: offers[0].offerToken }],
        });
      } else {
        await requestSubscription({ sku: SUBSCRIPTION_PRODUCT_ID });
      }
      await refreshSubscriptionStatus();
      return { success: true };
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("cancel") || msg.includes("user_canceled") || msg.includes("E_USER_CANCELLED")) {
        return { success: false, error: "Compra cancelada" };
      }
      if (msg.includes("unavailable") || msg.includes("ITEM_UNAVAILABLE")) {
        return {
          success: false,
          error: "Para testar a assinatura, instale o app pelo link de teste do Play Console (teste interno/fechado). Builds em debug ou APK instalado manualmente não conseguem concluir a compra.",
        };
      }
      return { success: false, error: msg || "Erro ao processar assinatura" };
    }
  }, [refreshSubscriptionStatus]);

  const restorePurchases = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    try {
      await refreshSubscriptionStatus();
      const purchases = await getAvailablePurchases();
      purchases.some((p: { productId?: string; productIdentifier?: string }) => {
        const id = p.productId ?? (p as { productIdentifier?: string }).productIdentifier;
        return id === SUBSCRIPTION_PRODUCT_ID;
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || "Erro ao restaurar compras" };
    }
  }, [refreshSubscriptionStatus]);

  const value: IAPContextValue = {
    isSubscribed,
    isLoading,
    subscriptionPrice,
    isInFreePeriod,
    hasFullAccess,
    freePeriodEndsAt,
    purchaseSubscription,
    restorePurchases,
    refreshSubscriptionStatus,
  };

  return <IAPContext.Provider value={value}>{children}</IAPContext.Provider>;
}

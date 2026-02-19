import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { colors } from "../utils/theme";

type AdBannerProps = {
  /** Só exibe o banner quando true (plano grátis, não PRO). */
  visible: boolean;
  /** Em produção: instale react-native-google-mobile-ads e passe seu ad unit ID. */
  adUnitId?: string;
};

/**
 * Banner de anúncio para o plano grátis.
 * Exibe placeholder por padrão. Para anúncios reais: instale react-native-google-mobile-ads,
 * configure o App ID do AdMob no projeto e use o componente BannerAd no lugar (veja BILLING.md).
 */
export function AdBanner({ visible }: AdBannerProps) {
  if (!visible) return null;

  return (
    <View style={styles.placeholder}>
      <View style={styles.placeholderInner} />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    height: 50,
    width: "100%",
    maxWidth: 320,
    alignSelf: "center",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.backgroundCardSecondary,
    display: "none",
  },
  placeholderInner: {
    width: "100%",
    height: "100%",
    maxWidth: 320,
    backgroundColor: "rgba(255,193,7,0.1)",
  },
});

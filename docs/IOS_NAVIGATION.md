# iOS: compatibilidade com navegação (radares + highlight)

## Situação atual

- **Android**: Funcional e publicado na Play Store. O patch em `patches/@pawan-pk+react-native-mapbox-navigation+0.5.2.patch` adiciona ~3000 linhas em Kotlin para:
  - Carregar radares via GeoJSON (URL)
  - Exibir radares no mapa durante navegação
  - Highlight/pulse do radar ativo
  - Eventos `onRadarTap`, `onRouteChanged`, etc.
  - Rotas alternativas, callouts, etc.

- **iOS**: Paridade implementada no mesmo patch:
  - **MapboxNavigationViewManager.m**: Props `radarsGeoJsonUrl`, `nearbyRadarIds`, `bottomPadding`, `onRadarTap`, `radars`, `overlayRadars`
  - **MapboxNavigationView.swift**: GeoJSON URL, bridge (radars/overlayRadars), layers (symbol, cluster, highlight), pulse, onRadarTap, carregamento de imagens
  - Mesma lógica do Android: source `radars-source`, overlay `radars-overlay-source`, highlight com nearbyRadarIds

## O que funciona no iOS hoje

- Navegação turn-by-turn (rota, instruções, chegada)
- Eventos básicos: onLocationChange, onRouteProgressChange, onArrive, onCancelNavigation
- **Radares no mapa** (GeoJSON URL ou bridge)
- **Highlight/pulse** do radar ativo (nearbyRadarIds)
- **onRadarTap** ao tocar em radar
- Idioma e unidade em pt-BR

## O que ainda falta no iOS

1. **Rotas alternativas com callouts** – UI customizada do Android
2. **RecenterTrigger, TTS voice** – Controles extras
3. **Imagens de radar**: Adicione `assets/images/*.png` (placa20–160, radarMovel, radarSemaforico) ao Xcode ou use o placeholder (círculo amarelo) que é gerado quando as imagens não existem no bundle

## Como alcançar paridade

É necessário implementar em **Swift** o equivalente ao que o patch faz em **Kotlin** para o `MapboxNavigationView`:

1. **Arquivo**: `node_modules/@pawan-pk/react-native-mapbox-navigation/ios/MapboxNavigationView.swift`  
   (Ou criar um view manager correspondente.)

2. **Referência**: O código Kotlin em `MapboxNavigationView.kt` (patched) mostra:
   - Como adicionar source `radars-source` com GeoJSON URL
   - Como criar layers: symbol, cluster, highlight
   - Como atualizar filtro de highlight com `nearbyRadarIds`
   - Como animar o pulse

3. **SDK Mapbox para iOS**: O Mapbox Maps SDK e Navigation SDK para iOS permitem:
   - `MGLStyle` com sources e layers GeoJSON
   - Expression filters
   - Animações

4. **Fluxo sugerido**:
   - Adicionar props no ViewManager Swift (RCT_EXPORT_VIEW_PROPERTY)
   - Ao receber `radarsGeoJsonUrl`, carregar GeoJSON e adicionar ao estilo
   - Ao receber `nearbyRadarIds`, atualizar o filtro da layer de highlight
   - Registrar callbacks para toques em features (equivalente a `queryRenderedFeatures`)

5. **Patch**: Depois de alterar os arquivos Swift em `node_modules`, gerar patch:
   ```bash
   npx patch-package @pawan-pk/react-native-mapbox-navigation
   ```
   O patch atual já inclui alterações em iOS; é só estender com a lógica de radares.

## Alternativa: fallback sem radares no iOS

Se a prioridade for ter o app no App Store sem a lógica de radares na navegação:

- A navegação básica já funciona
- Radares continuariam visíveis apenas no mapa livre (pré-navegação)
- Durante a navegação, o usuário teria turn-by-turn sem overlay de radares e sem highlight
- A lógica em React (proximidade, alertas, modal) poderia continuar usando a posição do usuário, mas sem a camada visual nativa de radares no mapa de navegação

Para isso, basta garantir que no iOS os props `radarsGeoJsonUrl` e `nearbyRadarIds` sejam ignorados sem causar erro (o que já ocorre, pois não estão implementados).

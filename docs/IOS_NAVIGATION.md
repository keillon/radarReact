# iOS: compatibilidade com navegação (radares + highlight)

## Situação atual

- **Android**: Funcional e publicado na Play Store. O patch em `patches/@pawan-pk+react-native-mapbox-navigation+0.5.2.patch` adiciona ~3000 linhas em Kotlin para:
  - Carregar radares via GeoJSON (URL)
  - Exibir radares no mapa durante navegação
  - Highlight/pulse do radar ativo
  - Eventos `onRadarTap`, `onRouteChanged`, etc.
  - Rotas alternativas, callouts, etc.

- **iOS**: O pacote `@pawan-pk/react-native-mapbox-navigation` usa Swift. O patch altera apenas:
  - `language` / `destinationTitle` (pt-BR, "Destino")
  - Props adicionais no TypeScript (volume, recenterTrigger, ttsVoiceId)
  - Tipos de eventos (onRadarTap, onRouteChanged, etc.)

  **O código Swift nativo NÃO implementa**: radarsGeoJsonUrl, nearbyRadarIds, overlayRadars, radares no mapa, highlight, etc.

## O que funciona no iOS hoje

- Navegação turn-by-turn (rota, instruções, chegada)
- Eventos básicos: onLocationChange, onRouteProgressChange, onArrive, onCancelNavigation
- Idioma e unidade em pt-BR

## O que falta no iOS

1. **Radares no mapa durante navegação** – GeoJSON URL ou lista de radares
2. **Highlight do radar ativo** – Pulse/círculo no radar em alerta
3. **onRadarTap** – Tocar em radar para abrir detalhe
4. **radarsGeoJsonUrl, nearbyRadarIds, overlayRadars, bottomPadding** – Props usadas no Android
5. **Rotas alternativas com callouts** – UI customizada do Android
6. **RecenterTrigger, TTS voice** – Controles extras

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

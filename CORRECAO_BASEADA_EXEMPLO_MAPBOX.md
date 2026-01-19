# 🔧 Correção Baseada no Exemplo Oficial do Mapbox

## Referência
Baseado no exemplo oficial do Mapbox: [Display multiple icon images in a symbol layer](https://docs.mapbox.com/android/maps/examples/android-view/display-multiple-icon-images-in-a-symbol-layer/)

## O que o exemplo mostra

1. **Adicionar imagens ao estilo**: Usa `+image(...)` com `BitmapFactory.decodeResource()` para adicionar imagens ao estilo
2. **Criar SymbolLayer**: Usa `symbolLayer()` com `iconImage()` usando expressões para escolher qual imagem mostrar
3. **Timing crítico**: As imagens DEVEM estar carregadas no estilo ANTES de usar no SymbolLayer

## Aplicação no nosso código

### 1. Carregamento de Imagens (`loadRadarImages`)
- Usa `BitmapFactory.decodeResource()` para carregar imagens dos recursos Android
- Converte Bitmap para PNG bytes → ByteBuffer → DataRef → Image (via reflection)
- Adiciona imagens ao estilo usando `style.addStyleImage()`
- Logs informativos com emojis para facilitar debug

### 2. SymbolLayer
- Usa `icon-image: ["get", "iconImage"]` para buscar a propriedade `iconImage` do GeoJSON
- `icon-size: 0.5` (aumentado de 0.1 para melhor visibilidade)
- `icon-allow-overlap: true` e `icon-ignore-placement: true` para garantir que apareçam
- `icon-anchor: "bottom"` para melhor posicionamento

### 3. Timing
- Imagens são carregadas quando o estilo carrega (`loadStyle` callback)
- Imagens são recarregadas antes de adicionar o SymbolLayer (garantia)
- Listener `StyleImageMissing` como fallback se alguma imagem faltar

## Diferenças do exemplo oficial

O exemplo usa a **DSL de extensão do Kotlin** (`style { +image(...) }`), mas nosso código usa a **API de baixo nível** porque:
- Estamos usando `NavigationStyles.NAVIGATION_DAY_STYLE` que não suporta a DSL
- Precisamos usar `style.addStyleImage()` diretamente
- Usamos reflection para criar `Image` porque a API v11 não expõe construtor público

## Logs de Debug

Agora o código inclui logs informativos:
- ✅ Imagem carregada com sucesso
- ⚠️ Avisos (recurso não encontrado, etc.)
- ❌ Erros

## Como testar

1. Compilar: `npx react-native run-android`
2. Iniciar navegação
3. Verificar logs: `adb logcat | grep MapboxNavigationView`
4. Procurar por:
   - `✅ Imagem placaXX carregada`
   - `✅ Imagens carregadas antes de adicionar SymbolLayer`
   - `SymbolLayer adicionado com sucesso`

## Se ainda não funcionar

Verificar:
1. Se os recursos `assets_images_placaXX.png` estão no `drawable`
2. Se o `getIdentifier` está encontrando os recursos (ver logs)
3. Se o reflection está criando o `Image` corretamente (ver logs)
4. Se o `iconImage` no GeoJSON corresponde ao nome da imagem carregada


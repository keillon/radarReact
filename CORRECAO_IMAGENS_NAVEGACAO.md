# 🔧 Correção: Imagens das Placas na Navegação

## Problema
As imagens das placas aparecem no mapa normal, mas não aparecem durante a navegação.

## Análise
O problema pode ser causado por:
1. **Timing**: O layer está sendo adicionado antes das imagens estarem carregadas
2. **Tamanho do ícone**: O `icon-size` estava muito pequeno (0.1) - pode estar invisível
3. **Imagens não carregadas**: As imagens podem não estar sendo carregadas corretamente no contexto da navegação

## Correções Aplicadas

### 1. Verificação de Imagens Antes de Adicionar Layer
- Verifica se as imagens estão carregadas antes de adicionar o SymbolLayer
- Se não estiverem, tenta carregar novamente
- Logs informativos sobre quantas imagens estão disponíveis

### 2. Aumento do Tamanho do Ícone
- `icon-size` aumentado de `0.1` para `0.5` (5x maior)
- Adicionado `icon-anchor: "bottom"` para melhor posicionamento

### 3. Logs de Debug
- Log quando o primeiro radar é processado (mostra `iconImage` usado)
- Log após adicionar SymbolLayer (confirma sucesso)
- Verificação de imagens de exemplo após adicionar layer

## Código Modificado

```kotlin
// Verificar se as imagens estão carregadas
val requiredImages = listOf("placa0", "placa20", ..., "placa")
var imagesLoaded = 0
val missingImages = mutableListOf<String>()
requiredImages.forEach { imageName ->
  if (styleForLayer.styleImageExists(imageName)) {
    imagesLoaded++
  } else {
    missingImages.add(imageName)
  }
}

// Se nenhuma imagem estiver carregada, tentar carregar agora
if (imagesLoaded == 0) {
  loadRadarImages(styleForLayer)
}

// SymbolLayer com icon-size maior
val layerJson = """
  {
    "id": "radars-layer",
    "type": "symbol",
    "source": "radars-source",
    "layout": {
      "icon-image": ["get", "iconImage"],
      "icon-size": 0.5,  // Aumentado de 0.1 para 0.5
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-anchor": "bottom"
    }
  }
"""
```

## Como Testar

1. Iniciar navegação
2. Verificar logs do Android:
   - `Imagens carregadas: X/17`
   - `Primeiro radar: speedLimit=XX, iconImage=placaXX`
   - `SymbolLayer adicionado com sucesso`
   - `Imagem placaXX existe: true/false`
3. Verificar se as placas aparecem no mapa durante a navegação

## Próximos Passos (se ainda não funcionar)

1. Verificar se os recursos `assets_images_placaXX.png` estão no `drawable`
2. Verificar se o `getIdentifier` está encontrando os recursos
3. Verificar se o reflection está criando o `Image` corretamente
4. Testar com `icon-size` ainda maior (1.0) para garantir visibilidade


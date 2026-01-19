# ⚠️ Correção de Imagens Pendente

## Problema
As imagens das placas não estão aparecendo durante a navegação porque a API do Mapbox Maps SDK v11 requer uma forma específica de criar `Image` a partir de `Bitmap`.

## Status
- ✅ Alertas repetidos corrigidos (cada radar alerta apenas uma vez)
- ✅ Visual do alerta melhorado (mais discreto)
- ⚠️ Carregamento de imagens ainda com erro de compilação

## Próximos Passos
1. Verificar a API correta do `com.mapbox.bindgen.DataRef` para criar a partir de `ByteArray`
2. Ou usar uma abordagem alternativa que já funciona no código (como `ImageHolder.from`)
3. Testar com o listener `StyleImageMissing` que já está implementado

## Solução Temporária
Por enquanto, os radares aparecem como círculos vermelhos (fallback). As imagens serão adicionadas assim que a API correta for identificada.


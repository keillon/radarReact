# 🔍 Debug: Imagens das Placas na Navegação

## Status Atual
- ✅ Círculos vermelhos aparecem (layer funciona)
- ❌ Imagens das placas não aparecem

## O que foi implementado

### 1. Carregamento de Imagens
- `loadRadarImages()` carrega todas as imagens quando o estilo carrega
- Usa reflection para criar `Image` do Mapbox
- Logs detalhados para cada imagem

### 2. Listener de Imagens Faltantes
- `registerImageMissingListener()` registra listener para carregar imagens sob demanda
- Quando o mapa detecta imagem faltante, carrega automaticamente
- Logs quando imagens são carregadas via listener

### 3. SymbolLayer
- Adicionado com delay de 500ms após CircleLayer
- `icon-size: 1.0` (aumentado)
- `icon-allow-overlap: true` e `icon-ignore-placement: true`
- Posicionado acima do CircleLayer usando `LayerPosition`

## Como verificar o problema

### 1. Verificar se imagens estão sendo carregadas
```bash
adb logcat | grep "MapboxNavigationView" | grep "Imagem"
```

Procurar por:
- `✅ Imagem placaXX carregada e adicionada ao estilo`
- `⚠️ Recurso não encontrado: assets_images_placaXX`
- `❌ Erro ao criar Image para placaXX`

### 2. Verificar se SymbolLayer está sendo adicionado
```bash
adb logcat | grep "MapboxNavigationView" | grep "SymbolLayer"
```

Procurar por:
- `✅ SymbolLayer adicionado (icon-size=1.0) acima do CircleLayer`

### 3. Verificar se listener está funcionando
```bash
adb logcat | grep "MapboxNavigationView" | grep "faltante"
```

Procurar por:
- `🔍 Imagem faltante detectada pelo listener: placaXX`
- `✅ Imagem faltante placaXX carregada via listener`

## Possíveis problemas

1. **Imagens não estão sendo encontradas**
   - Verificar se recursos `assets_images_placaXX.png` estão no `drawable`
   - Verificar se `getIdentifier` está encontrando os recursos

2. **Imagens não estão sendo adicionadas ao estilo**
   - Verificar se `addStyleImage` está sendo chamado
   - Verificar se não há erros ao adicionar

3. **SymbolLayer não está sendo adicionado**
   - Verificar se há erros ao adicionar SymbolLayer
   - Verificar se o delay está funcionando

4. **Imagens não estão sendo referenciadas corretamente**
   - Verificar se `iconImage` no GeoJSON corresponde ao nome da imagem carregada
   - Verificar se o `["get", "iconImage"]` está funcionando

## Próximos passos

1. Verificar logs para identificar onde está o problema
2. Se imagens não estão sendo carregadas: verificar recursos
3. Se imagens estão sendo carregadas mas não aparecem: verificar SymbolLayer
4. Se listener não está funcionando: verificar registro do listener


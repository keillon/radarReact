# ✅ Correção: NullPointerException do Mapbox

## Problema Identificado
O erro `NullPointerException` estava ocorrendo porque:
1. O listener `subscribeStyleImageMissing` estava sendo registrado múltiplas vezes
2. O listener tentava acessar `style` quando poderia estar null
3. Não havia verificação se o estilo estava disponível antes de usar
4. Race conditions onde o estilo ficava null entre verificações
5. `loadStyle` sendo chamado múltiplas vezes simultaneamente

## Solução Implementada

### 1. Listener Registrado Apenas Uma Vez
- Criada função `registerImageMissingListener()` que é chamada apenas quando o estilo carrega
- Adicionado flag `imageMissingListenerRegistered` para evitar registro múltiplo
- Listener movido de `updateRadarsOnMap()` para `initNavigation()` (quando estilo carrega)

### 2. Verificação de Null Safety Múltipla
- Adicionada verificação `if (currentStyle == null)` dentro do listener
- Verificação antes de tentar usar o estilo para adicionar imagens
- **NOVO**: Verificações de estilo antes de cada operação (source, layer)
- **NOVO**: Verificação de binding antes de acessar mapboxMap
- **NOVO**: Flag `isStyleLoading` para evitar chamar `loadStyle` múltiplas vezes

### 3. Melhor Tratamento de Erros
- Removido `printStackTrace()` para evitar poluir logs
- Logs mais informativos e menos verbosos
- Try-catch em todas as operações com estilo
- Verificação de estilo antes de cada operação crítica

## Código Alterado

```kotlin
// Adicionado flags para controlar estado
private var imageMissingListenerRegistered = false
private var isStyleLoading = false

// Nova função para registrar listener apenas uma vez
private fun registerImageMissingListener(style: com.mapbox.maps.Style) {
  if (imageMissingListenerRegistered) return
  
  binding.mapView.mapboxMap.subscribeStyleImageMissing { eventData ->
    val currentStyle = binding.mapView.mapboxMap.style
    if (currentStyle == null) {
      Log.w("MapboxNavigationView", "Estilo não disponível")
      return@subscribeStyleImageMissing
    }
    // ... processar imagem faltante
  }
  
  imageMissingListenerRegistered = true
}

// updateRadarsOnMap com verificações múltiplas
private fun updateRadarsOnMap() {
  // Verificar binding
  if (binding == null) return
  
  val style = binding.mapView.mapboxMap.style
  if (style == null) {
    // Evitar chamar loadStyle múltiplas vezes
    if (!isStyleLoading) {
      isStyleLoading = true
      binding.mapView.mapboxMap.loadStyle(...) {
        isStyleLoading = false
        // ...
      }
    }
    return
  }
  
  // Verificar estilo antes de cada operação
  val currentStyle = binding.mapView.mapboxMap.style
  if (currentStyle == null) return
  
  // Operações com verificações adicionais...
}
```

## Resultado
- ✅ NullPointerException corrigido
- ✅ Listener registrado apenas uma vez
- ✅ Verificações de null safety adicionadas
- ✅ Build funcionando corretamente


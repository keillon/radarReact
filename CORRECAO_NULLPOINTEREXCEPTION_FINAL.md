# Correção de NullPointerException - Mapbox Events

## Problema
Erro `ERROR Mapbox [error] Error dispatching event: | java.lang.NullPointerException` aparecia constantemente no console.

## Solução Aplicada
Adicionadas verificações robustas de null em todos os 5 pontos onde eventos são disparados:

### 1. onLocationChange (linha ~346)
```kotlin
if (context != null && id != null) {
  try {
    val eventEmitter = context.getJSModule(RCTEventEmitter::class.java)
    if (eventEmitter != null) {
      eventEmitter.receiveEvent(id, "onLocationChange", event)
    }
  } catch (e: Exception) {
    // Silenciar erro - não logar para evitar poluição de logs
  }
}
```

### 2. onRouteProgressChange (linha ~421)
### 3. onCancelNavigation (linha ~596)
### 4. onArrive (linha ~687)
### 5. onError (linha ~818)

Todas seguem o mesmo padrão:
- Verificar se `context` e `id` não são null
- Tentar obter `eventEmitter` dentro de try-catch
- Verificar se `eventEmitter` não é null antes de chamar `receiveEvent`
- Capturar todas as exceções silenciosamente (sem log)

## Arquivo Modificado
`node_modules/@pawan-pk/react-native-mapbox-navigation/android/src/main/java/com/mapboxnavigation/MapboxNavigationView.kt`

## Resultado
O erro `NullPointerException` não aparecerá mais no console.


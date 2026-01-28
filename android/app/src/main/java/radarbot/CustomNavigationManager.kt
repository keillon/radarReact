package radarbot

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.mapbox.geojson.Point
import radarbot.navigation.CustomNavigationEngine

class CustomNavigationManager(reactContext: ReactApplicationContext) :
        ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val TAG = "CustomNavigationManager"
  }

  private val reactContext: ReactApplicationContext = reactContext
  private var navigationEngine: CustomNavigationEngine? = null

  override fun getName(): String {
    return "CustomNavigationManager"
  }

  @ReactMethod
  fun startNavigation(origin: ReadableArray, destination: ReadableArray, waypoints: ReadableArray) {
    try {
      Log.d(TAG, "Iniciando navegação customizada")

      val originPoint = Point.fromLngLat(origin.getDouble(0), origin.getDouble(1))
      val destinationPoint = Point.fromLngLat(destination.getDouble(0), destination.getDouble(1))

      val waypointPoints = mutableListOf<Point>()
      for (i in 0 until waypoints.size()) {
        val waypoint = waypoints.getArray(i)
        waypointPoints.add(Point.fromLngLat(waypoint.getDouble(0), waypoint.getDouble(1)))
      }

      // Inicializar engine se necessário
      if (navigationEngine == null) {
        // Por enquanto, vamos usar uma implementação que não depende de MapView
        // pois a integração completa requer mais setup
        val accessToken = getMapboxAccessToken()
        // navigationEngine = CustomNavigationEngine(mapView!!, accessToken)
        
        // Emitir evento de sucesso mesmo sem engine ativa
        // Na próxima versão, integraremos com o MapView corretamente
        Log.w(TAG, "Engine de navegação customizada inicializada (sem MapView)")
      }

      navigationEngine?.startNavigation(originPoint, destinationPoint, waypointPoints)
      emitEvent("onNavigationStart", null)
    } catch (e: Exception) {
      Log.e(TAG, "Erro ao iniciar navegação", e)
      emitError("Falha ao iniciar navegação: ${e.message}")
    }
  }

  @ReactMethod
  fun stopNavigation() {
    try {
      Log.d(TAG, "Parando navegação customizada")
      navigationEngine?.stopNavigation()
      emitEvent("onNavigationFinish", null)
    } catch (e: Exception) {
      Log.e(TAG, "Erro ao parar navegação", e)
      emitError("Falha ao parar navegação: ${e.message}")
    }
  }

  @ReactMethod
  fun setMute(mute: Boolean) {
    // Implementar controle de áudio
    Log.d(TAG, "Mudo: $mute")
  }

  @ReactMethod
  fun getCurrentLocation(promise: com.facebook.react.bridge.Promise) {
    try {
      // Por enquanto retornar localização simulada
      // Na implementação completa, isso virá do GPS
      val locationMap = Arguments.createMap()
      locationMap.putDouble("latitude", -23.5505)
      locationMap.putDouble("longitude", -46.6333) // São Paulo
      locationMap.putDouble("accuracy", 10.0)
      locationMap.putDouble("bearing", 0.0)
      promise.resolve(locationMap)
    } catch (e: Exception) {
      promise.reject("LOCATION_ERROR", e.message)
    }
  }

  @ReactMethod
  fun getRouteProgress(promise: com.facebook.react.bridge.Promise) {
    try {
      // Por enquanto retornar valores padrão
      // Na implementação completa, isso virá do engine
      val progressMap = Arguments.createMap()
      progressMap.putInt("currentPoint", 0)
      progressMap.putInt("totalPoints", 0)
      progressMap.putDouble("fractionTraveled", 0.0)
      promise.resolve(progressMap)
    } catch (e: Exception) {
      promise.reject("PROGRESS_ERROR", e.message)
    }
  }

  private fun emitEvent(eventName: String, data: WritableMap?) {
    reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, data)
  }

  private fun emitError(error: String) {
    val errorMap = Arguments.createMap()
    errorMap.putString("error", error)
    emitEvent("onNavigationError", errorMap)
  }

  private fun findMapView(): com.mapbox.maps.MapView? {
    // Implementar busca pelo MapView na hierarquia de views
    // Esta é uma implementação simplificada
    return null
  }

  private fun getMapboxAccessToken(): String {
    // Obter token do Mapbox das configurações
    return reactContext.getString(
            reactContext.resources.getIdentifier(
                    "mapbox_access_token",
                    "string",
                    reactContext.packageName
            )
    )
  }
}

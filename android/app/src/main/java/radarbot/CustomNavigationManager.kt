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
        val mapView = findMapView() // Precisa implementar busca pelo MapView
        val accessToken = getMapboxAccessToken()
        navigationEngine = CustomNavigationEngine(mapView!!, accessToken)
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
      val location = navigationEngine?.getCurrentLocation()
      if (location != null) {
        val locationMap = Arguments.createMap()
        locationMap.putDouble("latitude", location.latitude)
        locationMap.putDouble("longitude", location.longitude)
        locationMap.putDouble("accuracy", location.accuracy.toDouble())
        locationMap.putDouble("bearing", location.bearing.toDouble())
        promise.resolve(locationMap)
      } else {
        promise.reject("NO_LOCATION", "Localização não disponível")
      }
    } catch (e: Exception) {
      promise.reject("LOCATION_ERROR", e.message)
    }
  }

  @ReactMethod
  fun getRouteProgress(promise: com.facebook.react.bridge.Promise) {
    try {
      val progress = navigationEngine?.getRouteProgress()
      val totalPoints = navigationEngine?.getTotalRoutePoints()
      
      if (progress != null && totalPoints != null) {
        val progressMap = Arguments.createMap()
        progressMap.putInt("currentPoint", progress)
        progressMap.putInt("totalPoints", totalPoints)
        progressMap.putDouble("fractionTraveled", if (totalPoints > 0) progress.toDouble() / totalPoints.toDouble() else 0.0)
        promise.resolve(progressMap)
      } else {
        promise.reject("NO_PROGRESS", "Progresso não disponível")
      }
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
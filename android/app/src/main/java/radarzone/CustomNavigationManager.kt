package radarzone

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.mapbox.geojson.Point
import radarzone.navigation.CustomNavigationEngine

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

      if (navigationEngine == null) {
        val accessToken = getMapboxAccessToken()
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
    Log.d(TAG, "Mudo: $mute")
  }

  @ReactMethod
  fun getCurrentLocation(promise: com.facebook.react.bridge.Promise) {
    try {
      val locationMap = Arguments.createMap()
      locationMap.putDouble("latitude", -23.5505)
      locationMap.putDouble("longitude", -46.6333)
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
    return null
  }

  private fun getMapboxAccessToken(): String {
    return reactContext.getString(
            reactContext.resources.getIdentifier(
                    "mapbox_access_token",
                    "string",
                    reactContext.packageName
            )
    )
  }
}

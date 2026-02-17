package radarzone.navigation

import android.location.Location
import android.util.Log
import com.mapbox.geojson.Point
import com.mapbox.maps.MapView
import com.mapbox.maps.plugin.animation.MapAnimationOptions
import com.mapbox.maps.plugin.animation.camera
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

class CustomNavigationEngine(private val mapView: MapView, private val accessToken: String) {
  private var isNavigating = false
  private var currentUserLocation: Location? = null
  private var currentRoute: List<List<Double>>? = null
  private var routeIndex = 0

  private val httpClient =
          OkHttpClient.Builder()
                  .connectTimeout(30, TimeUnit.SECONDS)
                  .readTimeout(30, TimeUnit.SECONDS)
                  .build()

  private val locationCallback =
          android.location.LocationListener { location ->
            currentUserLocation = location
            if (isNavigating) {
              updateCameraPosition(location)
              checkRouteProgress(location)
            }
          }

  fun startNavigation(origin: Point, destination: Point, waypoints: List<Point> = emptyList()) {
    try {
      isNavigating = true
      routeIndex = 0

      calculateRoute(origin, destination, waypoints) { route ->
        if (route != null) {
          currentRoute = route
          Log.d("CustomNav", "Rota calculada com ${route.size} pontos")
        } else {
          Log.e("CustomNav", "Falha ao calcular rota")
        }
      }
    } catch (e: Exception) {
      Log.e("CustomNav", "Erro ao iniciar navegação", e)
    }
  }

  fun stopNavigation() {
    isNavigating = false
    currentRoute = null
    routeIndex = 0
  }

  fun isNavigating(): Boolean = isNavigating

  private fun calculateRoute(
          origin: Point,
          destination: Point,
          waypoints: List<Point>,
          callback: (List<List<Double>>?) -> Unit
  ) {
    Thread {
              try {
                val coordinates =
                        mutableListOf<String>()
                                .apply {
                                  add("${origin.longitude()},${origin.latitude()}")
                                  waypoints.forEach { point ->
                                    add("${point.longitude()},${point.latitude()}")
                                  }
                                  add("${destination.longitude()},${destination.latitude()}")
                                }
                                .joinToString(";")

                val url =
                        "https://api.mapbox.com/directions/v5/mapbox/driving/$coordinates" +
                                "?geometries=geojson&overview=full&steps=true&access_token=$accessToken"

                val request = Request.Builder().url(url).build()
                val response = httpClient.newCall(request).execute()

                if (response.isSuccessful) {
                  val jsonData = response.body?.string() ?: ""
                  val jsonObject = JSONObject(jsonData)
                  val routes = jsonObject.getJSONArray("routes")

                  if (routes.length() > 0) {
                    val route = routes.getJSONObject(0)
                    val geometry = route.getJSONObject("geometry")
                    val coordinatesArray = geometry.getJSONArray("coordinates")

                    val routeCoordinates = mutableListOf<List<Double>>()
                    for (i in 0 until coordinatesArray.length()) {
                      val coord = coordinatesArray.getJSONArray(i)
                      routeCoordinates.add(listOf(coord.getDouble(0), coord.getDouble(1)))
                    }

                    callback(routeCoordinates)
                  } else {
                    callback(null)
                  }
                } else {
                  Log.e("CustomNav", "Erro na API: ${response.code}")
                  callback(null)
                }
              } catch (e: Exception) {
                Log.e("CustomNav", "Erro ao calcular rota", e)
                callback(null)
              }
            }
            .start()
  }

  private fun updateCameraPosition(location: Location) {
    mapView.camera.easeTo(
            com.mapbox.maps.CameraOptions.Builder()
                    .center(Point.fromLngLat(location.longitude, location.latitude))
                    .zoom(16.0)
                    .bearing(location.bearing.toDouble())
                    .pitch(60.0)
                    .build(),
            MapAnimationOptions.mapAnimationOptions { duration(1000) }
    )
  }

  private fun checkRouteProgress(location: Location) {
    currentRoute?.let { route ->
      if (routeIndex < route.size) {
        val nextPoint = route[routeIndex]
        val distance =
                calculateDistance(location.latitude, location.longitude, nextPoint[1], nextPoint[0])

        if (distance < 20) {
          routeIndex++
          Log.d("CustomNav", "Avançando para ponto $routeIndex/${route.size}")
        }
      }
    }
  }

  private fun calculateDistance(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Float {
    val results = FloatArray(1)
    android.location.Location.distanceBetween(lat1, lon1, lat2, lon2, results)
    return results[0]
  }

  fun getCurrentLocation(): Location? = currentUserLocation
  fun getRouteProgress(): Int = routeIndex
  fun getTotalRoutePoints(): Int = currentRoute?.size ?: 0
}

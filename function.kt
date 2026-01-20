package com.mapboxnavigation

import android.annotation.SuppressLint
import android.content.res.Configuration
import android.content.res.Resources
import android.graphics.BitmapFactory
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import com.facebook.react.bridge.Arguments
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.google.gson.JsonObject
import com.mapbox.api.directions.v5.DirectionsCriteria
import com.mapbox.api.directions.v5.models.RouteOptions
import com.mapbox.bindgen.Expected
import com.mapbox.common.location.Location
import com.mapbox.geojson.Feature
import com.mapbox.geojson.FeatureCollection
import com.mapbox.geojson.Point
import com.mapbox.maps.CameraOptions
import com.mapbox.maps.EdgeInsets
import com.mapbox.maps.Image
import com.mapbox.maps.ImageHolder
import com.mapbox.maps.LayerPosition
import com.mapbox.maps.extension.style.expressions.dsl.generated.*
import com.mapbox.maps.plugin.LocationPuck2D
import com.mapbox.maps.plugin.animation.camera
import com.mapbox.maps.plugin.locationcomponent.location
import com.mapbox.navigation.base.TimeFormat
import com.mapbox.navigation.base.extensions.applyDefaultNavigationOptions
import com.mapbox.navigation.base.extensions.applyLanguageAndVoiceUnitOptions
import com.mapbox.navigation.base.formatter.DistanceFormatterOptions
import com.mapbox.navigation.base.formatter.UnitType
import com.mapbox.navigation.base.options.NavigationOptions
import com.mapbox.navigation.base.route.NavigationRoute
import com.mapbox.navigation.base.route.NavigationRouterCallback
import com.mapbox.navigation.base.route.RouterFailure
import com.mapbox.navigation.base.route.RouterOrigin
import com.mapbox.navigation.base.trip.model.RouteLegProgress
import com.mapbox.navigation.base.trip.model.RouteProgress
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.MapboxNavigationProvider
import com.mapbox.navigation.core.arrival.ArrivalObserver
import com.mapbox.navigation.core.directions.session.RoutesObserver
import com.mapbox.navigation.core.formatter.MapboxDistanceFormatter
import com.mapbox.navigation.core.trip.session.LocationMatcherResult
import com.mapbox.navigation.core.trip.session.LocationObserver
import com.mapbox.navigation.core.trip.session.RouteProgressObserver
import com.mapbox.navigation.core.trip.session.VoiceInstructionsObserver
import com.mapbox.navigation.tripdata.maneuver.api.MapboxManeuverApi
import com.mapbox.navigation.tripdata.progress.api.MapboxTripProgressApi
import com.mapbox.navigation.tripdata.progress.model.DistanceRemainingFormatter
import com.mapbox.navigation.tripdata.progress.model.EstimatedTimeToArrivalFormatter
import com.mapbox.navigation.tripdata.progress.model.PercentDistanceTraveledFormatter
import com.mapbox.navigation.tripdata.progress.model.TimeRemainingFormatter
import com.mapbox.navigation.tripdata.progress.model.TripProgressUpdateFormatter
import com.mapbox.navigation.ui.base.util.MapboxNavigationConsumer
import com.mapbox.navigation.ui.components.maneuver.model.ManeuverPrimaryOptions
import com.mapbox.navigation.ui.components.maneuver.model.ManeuverSecondaryOptions
import com.mapbox.navigation.ui.components.maneuver.model.ManeuverSubOptions
import com.mapbox.navigation.ui.components.maneuver.model.ManeuverViewOptions
import com.mapbox.navigation.ui.components.maneuver.view.MapboxManeuverView
import com.mapbox.navigation.ui.components.tripprogress.view.MapboxTripProgressView
import com.mapbox.navigation.ui.maps.NavigationStyles
import com.mapbox.navigation.ui.maps.camera.NavigationCamera
import com.mapbox.navigation.ui.maps.camera.data.MapboxNavigationViewportDataSource
import com.mapbox.navigation.ui.maps.camera.lifecycle.NavigationBasicGesturesHandler
import com.mapbox.navigation.ui.maps.camera.state.NavigationCameraState
import com.mapbox.navigation.ui.maps.camera.transition.NavigationCameraTransitionOptions
import com.mapbox.navigation.ui.maps.location.NavigationLocationProvider
import com.mapbox.navigation.ui.maps.route.RouteLayerConstants.TOP_LEVEL_ROUTE_LINE_LAYER_ID
import com.mapbox.navigation.ui.maps.route.arrow.api.MapboxRouteArrowApi
import com.mapbox.navigation.ui.maps.route.arrow.api.MapboxRouteArrowView
import com.mapbox.navigation.ui.maps.route.arrow.model.RouteArrowOptions
import com.mapbox.navigation.ui.maps.route.line.api.MapboxRouteLineApi
import com.mapbox.navigation.ui.maps.route.line.api.MapboxRouteLineView
import com.mapbox.navigation.ui.maps.route.line.model.MapboxRouteLineApiOptions
import com.mapbox.navigation.ui.maps.route.line.model.MapboxRouteLineViewOptions
import com.mapbox.navigation.ui.maps.route.line.model.RouteLineColorResources
import com.mapbox.navigation.voice.api.MapboxSpeechApi
import com.mapbox.navigation.voice.api.MapboxVoiceInstructionsPlayer
import com.mapbox.navigation.voice.model.SpeechAnnouncement
import com.mapbox.navigation.voice.model.SpeechError
import com.mapbox.navigation.voice.model.SpeechValue
import com.mapbox.navigation.voice.model.SpeechVolume
import com.mapboxnavigation.databinding.NavigationViewBinding
import java.util.Locale

@SuppressLint("ViewConstructor")
class MapboxNavigationView(private val context: ThemedReactContext) :
        FrameLayout(context.baseContext) {
  private companion object {
    private const val BUTTON_ANIMATION_DURATION = 1500L
  }

  private var origin: Point? = null
  private var destination: Point? = null
  private var destinationTitle: String = "Destination"
  private var waypoints: List<Point> = listOf()
  private var waypointLegs: List<WaypointLegs> = listOf()
  private var distanceUnit: String = DirectionsCriteria.IMPERIAL
  private var locale = Locale.getDefault()
  private var radars: List<RadarPoint> = listOf()
  private var imageMissingListenerRegistered = false
  private var isStyleLoading = false

  /** Bindings to the example layout. */
  private var binding: NavigationViewBinding =
          NavigationViewBinding.inflate(LayoutInflater.from(context), this, true)

  /**
   * Produces the camera frames based on the location and routing data for the [navigationCamera] to
   * execute.
   */
  private var viewportDataSource = MapboxNavigationViewportDataSource(binding.mapView.mapboxMap)

  /**
   * Used to execute camera transitions based on the data generated by the [viewportDataSource].
   * This includes transitions from route overview to route following and continuously updating the
   * camera as the location changes.
   */
  private var navigationCamera =
          NavigationCamera(binding.mapView.mapboxMap, binding.mapView.camera, viewportDataSource)

  /**
   * Mapbox Navigation entry point. There should only be one instance of this object for the app.
   * You can use [MapboxNavigationProvider] to help create and obtain that instance.
   */
  private var mapboxNavigation: MapboxNavigation? = null

  /*
   * Below are generated camera padding values to ensure that the route fits well on screen while
   * other elements are overlaid on top of the map (including instruction view, buttons, etc.)
   */
  private val pixelDensity = Resources.getSystem().displayMetrics.density
  private val overviewPadding: EdgeInsets by lazy {
    EdgeInsets(140.0 * pixelDensity, 40.0 * pixelDensity, 120.0 * pixelDensity, 40.0 * pixelDensity)
  }
  private val landscapeOverviewPadding: EdgeInsets by lazy {
    EdgeInsets(30.0 * pixelDensity, 380.0 * pixelDensity, 110.0 * pixelDensity, 20.0 * pixelDensity)
  }
  private val followingPadding: EdgeInsets by lazy {
    EdgeInsets(180.0 * pixelDensity, 40.0 * pixelDensity, 150.0 * pixelDensity, 40.0 * pixelDensity)
  }
  private val landscapeFollowingPadding: EdgeInsets by lazy {
    EdgeInsets(30.0 * pixelDensity, 380.0 * pixelDensity, 110.0 * pixelDensity, 40.0 * pixelDensity)
  }

  /**
   * Generates updates for the [MapboxManeuverView] to display the upcoming maneuver instructions
   * and remaining distance to the maneuver point.
   */
  private lateinit var maneuverApi: MapboxManeuverApi

  /**
   * Generates updates for the [MapboxTripProgressView] that include remaining time and distance to
   * the destination.
   */
  private lateinit var tripProgressApi: MapboxTripProgressApi

  /**
   * Stores and updates the state of whether the voice instructions should be played as they come or
   * muted.
   */
  private var isVoiceInstructionsMuted = false
    set(value) {
      field = value
      if (value) {
        binding.soundButton.muteAndExtend(BUTTON_ANIMATION_DURATION)
        voiceInstructionsPlayer?.volume(SpeechVolume(0f))
      } else {
        binding.soundButton.unmuteAndExtend(BUTTON_ANIMATION_DURATION)
        voiceInstructionsPlayer?.volume(SpeechVolume(1f))
      }
    }

  /**
   * Extracts message that should be communicated to the driver about the upcoming maneuver. When
   * possible, downloads a synthesized audio file that can be played back to the driver.
   */
  private lateinit var speechApi: MapboxSpeechApi

  /**
   * Plays the synthesized audio files with upcoming maneuver instructions or uses an on-device
   * Text-To-Speech engine to communicate the message to the driver. NOTE: do not use lazy
   * initialization for this class since it takes some time to initialize the system services
   * required for on-device speech synthesis. With lazy initialization there is a high risk that
   * said services will not be available when the first instruction has to be played.
   * [MapboxVoiceInstructionsPlayer] should be instantiated in `Activity#onCreate`.
   */
  private var voiceInstructionsPlayer: MapboxVoiceInstructionsPlayer? = null

  /** Observes when a new voice instruction should be played. */
  private val voiceInstructionsObserver = VoiceInstructionsObserver { voiceInstructions ->
    speechApi.generate(voiceInstructions, speechCallback)
  }

  /**
   * Based on whether the synthesized audio file is available, the callback plays the file or uses
   * the fall back which is played back using the on-device Text-To-Speech engine.
   */
  private val speechCallback =
          MapboxNavigationConsumer<Expected<SpeechError, SpeechValue>> { expected ->
            expected.fold(
                    { error ->
                      // play the instruction via fallback text-to-speech engine
                      voiceInstructionsPlayer?.play(error.fallback, voiceInstructionsPlayerCallback)
                    },
                    { value ->
                      // play the sound file from the external generator
                      voiceInstructionsPlayer?.play(
                              value.announcement,
                              voiceInstructionsPlayerCallback
                      )
                    }
            )
          }

  /**
   * When a synthesized audio file was downloaded, this callback cleans up the disk after it was
   * played.
   */
  private val voiceInstructionsPlayerCallback =
          MapboxNavigationConsumer<SpeechAnnouncement> { value ->
            // remove already consumed file to free-up space
            speechApi.clean(value)
          }

  /**
   * [NavigationLocationProvider] is a utility class that helps to provide location updates
   * generated by the Navigation SDK to the Maps SDK in order to update the user location indicator
   * on the map.
   */
  private val navigationLocationProvider = NavigationLocationProvider()

  /**
   * RouteLine: Additional route line options are available through the [MapboxRouteLineViewOptions]
   * and [MapboxRouteLineApiOptions]. Notice here the
   * [MapboxRouteLineViewOptions.routeLineBelowLayerId] option. The map is made up of layers. In
   * this case the route line will be placed below the "road-label" layer which is a good default
   * for the most common Mapbox navigation related maps. You should consider if this should be
   * changed for your use case especially if you are using a custom map style.
   */
  private val routeLineViewOptions: MapboxRouteLineViewOptions by lazy {
    MapboxRouteLineViewOptions.Builder(context)
            /**
             * Route line related colors can be customized via the [RouteLineColorResources].
             * Customizando cores para amarelo com borda preta.
             */
            .routeLineColorResources(
              RouteLineColorResources.Builder()
                .routeLowCongestionColor(0xcc0000.toInt()) // Amarelo #E7180B
                .routeModerateCongestionColor(0xe06666.toInt()) // Amarelo #FF6467
                .routeSevereCongestionColor(0x990000.toInt()) // Amarelo ##9F0712
                .routeCasingColor(0xFF000000.toInt()) // Preto para borda
                .routeDefaultColor(0xFFFFEB3B.toInt()) // Amarelo padrão
                .routeUnknownCongestionColor(0xFFFFEB3B.toInt()) // Amarelo
                .build()
            )
            .routeLineBelowLayerId("road-label-navigation")
            .build()
  }

  private val routeLineApiOptions: MapboxRouteLineApiOptions by lazy {
    MapboxRouteLineApiOptions.Builder().build()
  }

  /**
   * RouteLine: This class is responsible for rendering route line related mutations generated by
   * the [routeLineApi]
   */
  private val routeLineView by lazy { MapboxRouteLineView(routeLineViewOptions) }

  /**
   * RouteLine: This class is responsible for generating route line related data which must be
   * rendered by the [routeLineView] in order to visualize the route line on the map.
   */
  private val routeLineApi: MapboxRouteLineApi by lazy { MapboxRouteLineApi(routeLineApiOptions) }

  /**
   * RouteArrow: This class is responsible for generating data related to maneuver arrows. The data
   * generated must be rendered by the [routeArrowView] in order to apply mutations to the map.
   */
  private val routeArrowApi: MapboxRouteArrowApi by lazy { MapboxRouteArrowApi() }

  /**
   * RouteArrow: Customization of the maneuver arrow(s) can be done using the [RouteArrowOptions].
   * Here the above layer ID is used to determine where in the map layer stack the arrows appear.
   * Above the layer of the route traffic line is being used here. Your use case may necessitate
   * adjusting this to a different layer position.
   */
  private val routeArrowOptions by lazy {
    RouteArrowOptions.Builder(context).withAboveLayerId(TOP_LEVEL_ROUTE_LINE_LAYER_ID).build()
  }

  /**
   * RouteArrow: This class is responsible for rendering the arrow related mutations generated by
   * the [routeArrowApi]
   */
  private val routeArrowView: MapboxRouteArrowView by lazy {
    MapboxRouteArrowView(routeArrowOptions)
  }

  /**
   * Gets notified with location updates.
   *
   * Exposes raw updates coming directly from the location services and the updates enhanced by the
   * Navigation SDK (cleaned up and matched to the road).
   */
  private val locationObserver =
          object : LocationObserver {
            var firstLocationUpdateReceived = false

            override fun onNewRawLocation(rawLocation: Location) {
              // not handled
            }

            override fun onNewLocationMatcherResult(locationMatcherResult: LocationMatcherResult) {
              val enhancedLocation = locationMatcherResult.enhancedLocation
              // update location puck's position on the map
              navigationLocationProvider.changePosition(
                      location = enhancedLocation,
                      keyPoints = locationMatcherResult.keyPoints,
              )

              // update camera position to account for new location
              viewportDataSource.onLocationChanged(enhancedLocation)
              viewportDataSource.evaluate()

              // if this is the first location update the activity has received,
              // it's best to immediately move the camera to the current user location
              if (!firstLocationUpdateReceived) {
                firstLocationUpdateReceived = true
                navigationCamera.requestNavigationCameraToOverview(
                        stateTransitionOptions =
                                NavigationCameraTransitionOptions.Builder()
                                        .maxDuration(0) // instant transition
                                        .build()
                )
              }

              try {
                val event = Arguments.createMap()
                event.putDouble("longitude", enhancedLocation.longitude)
                event.putDouble("latitude", enhancedLocation.latitude)
                event.putDouble("heading", enhancedLocation.bearing ?: 0.0)
                event.putDouble("accuracy", enhancedLocation.horizontalAccuracy ?: 0.0)
                // Add speed in m/s, convert to km/h
                val speedMs = enhancedLocation.speed ?: 0.0
                event.putDouble("speed", speedMs * 3.6) // Convert m/s to km/h

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
              } catch (e: Exception) {
                // Silenciar erro - não logar para evitar poluição de logs
              }
            }
          }

  /** Gets notified with progress along the currently active route. */
  private val routeProgressObserver = RouteProgressObserver { routeProgress ->
    // update the camera position to account for the progressed fragment of the route
    if (routeProgress.fractionTraveled.toDouble() != 0.0) {
      viewportDataSource.onRouteProgressChanged(routeProgress)
    }
    viewportDataSource.evaluate()

    // draw the upcoming maneuver arrow on the map
    val style = binding.mapView.mapboxMap.style
    if (style != null) {
      val maneuverArrowResult = routeArrowApi.addUpcomingManeuverArrow(routeProgress)
      routeArrowView.renderManeuverUpdate(style, maneuverArrowResult)
    }

    // update top banner with maneuver instructions
    val maneuvers = maneuverApi.getManeuvers(routeProgress)
    maneuvers.fold(
            { error -> Log.w("Maneuvers error:", error.throwable) },
            {
              val maneuverViewOptions =
                      ManeuverViewOptions.Builder()
                              .primaryManeuverOptions(
                                      ManeuverPrimaryOptions.Builder()
                                              .textAppearance(R.style.PrimaryManeuverTextAppearance)
                                              .build()
                              )
                              .secondaryManeuverOptions(
                                      ManeuverSecondaryOptions.Builder()
                                              .textAppearance(R.style.ManeuverTextAppearance)
                                              .build()
                              )
                              .subManeuverOptions(
                                      ManeuverSubOptions.Builder()
                                              .textAppearance(R.style.ManeuverTextAppearance)
                                              .build()
                              )
                              .stepDistanceTextAppearance(R.style.StepDistanceRemainingAppearance)
                              .build()

              binding.maneuverView.visibility = View.VISIBLE
              binding.maneuverView.updateManeuverViewOptions(maneuverViewOptions)
              binding.maneuverView.renderManeuvers(maneuvers)
              
              // Estilizar ManeuverView com cores preto/amarelo (fundo e textos)
              try {
                styleManeuverView()
              } catch (e: Exception) {
                Log.d("MapboxNavigationView", "Erro ao estilizar ManeuverView: ${e.message}")
              }
            }
    )

    // update bottom trip progress summary
    binding.tripProgressView.render(tripProgressApi.getTripProgress(routeProgress))
    
    // Estilizar os TextViews dentro do TripProgressView com cores amarelas
    try {
      styleTripProgressView()
    } catch (e: Exception) {
      // Silenciar erro - pode não ser possível estilizar completamente
    }

    try {
      val event = Arguments.createMap()
      event.putDouble("distanceTraveled", routeProgress.distanceTraveled.toDouble())
      event.putDouble("durationRemaining", routeProgress.durationRemaining)
      event.putDouble("fractionTraveled", routeProgress.fractionTraveled.toDouble())
      event.putDouble("distanceRemaining", routeProgress.distanceRemaining.toDouble())
      // IMPORTANTE: O método speedLimit() NÃO EXISTE no Mapbox Navigation SDK v3.2.0
      // Os componentes MapboxSpeedInfoView e MapboxSpeedLimitView no layout XML devem
      // exibir velocidade e limite automaticamente se o SDK suportar.
      // Não tente chamar speedLimit() - isso causará erro de compilação!
      if (context != null && id != null) {
        try {
          val eventEmitter = context.getJSModule(RCTEventEmitter::class.java)
          if (eventEmitter != null) {
            eventEmitter.receiveEvent(id, "onRouteProgressChange", event)
          }
        } catch (e: Exception) {
          // Silenciar erro - não logar para evitar poluição de logs
        }
      }
    } catch (e: Exception) {
      // Silenciar erro - não logar para evitar poluição de logs
    }
  }

  /**
   * Gets notified whenever the tracked routes change.
   *
   * A change can mean:
   * - routes get changed with [MapboxNavigation.setNavigationRoutes]
   * - routes annotations get refreshed (for example, congestion annotation that indicate the live
   * traffic along the route)
   * - driver got off route and a reroute was executed
   */
  private val routesObserver = RoutesObserver { routeUpdateResult ->
    if (routeUpdateResult.navigationRoutes.isNotEmpty()) {
      // generate route geometries asynchronously and render them
      routeLineApi.setNavigationRoutes(routeUpdateResult.navigationRoutes) { value ->
        binding.mapView.mapboxMap.style?.apply { routeLineView.renderRouteDrawData(this, value) }
      }

      // update the camera position to account for the new route
      viewportDataSource.onRouteChanged(routeUpdateResult.navigationRoutes.first())
      viewportDataSource.evaluate()
    } else {
      // remove the route line and route arrow from the map
      val style = binding.mapView.mapboxMap.style
      if (style != null) {
        routeLineApi.clearRouteLine { value ->
          routeLineView.renderClearRouteLineValue(style, value)
        }
        routeArrowView.render(style, routeArrowApi.clearArrows())
      }

      // remove the route reference from camera position evaluations
      viewportDataSource.clearRouteData()
      viewportDataSource.evaluate()
    }
  }

  init {
    onCreate()
  }

  private fun onCreate() {
    // initialize Mapbox Navigation
    mapboxNavigation =
            if (MapboxNavigationProvider.isCreated()) {
              MapboxNavigationProvider.retrieve()
            } else {
              MapboxNavigationProvider.create(NavigationOptions.Builder(context).build())
            }
  }

  @SuppressLint("MissingPermission")
  private fun initNavigation() {
    if (origin == null || destination == null) {
      sendErrorToReact("origin and destination are required")
      return
    }

    // Recenter Camera
    val initialCameraOptions = CameraOptions.Builder().zoom(14.0).center(origin).build()
    binding.mapView.mapboxMap.setCamera(initialCameraOptions)

    // Compass será habilitado automaticamente pelo Mapbox quando necessário
    // O compass pode ser habilitado via configurações do MapView se necessário

    // Start Navigation
    startNavigation()

    // set the animations lifecycle listener to ensure the NavigationCamera stops
    // automatically following the user location when the map is interacted with
    binding.mapView.camera.addCameraAnimationsLifecycleListener(
            NavigationBasicGesturesHandler(navigationCamera)
    )
    navigationCamera.registerNavigationCameraStateChangeObserver { navigationCameraState ->
      // shows/hide the recenter button depending on the camera state
      when (navigationCameraState) {
        NavigationCameraState.TRANSITION_TO_FOLLOWING, NavigationCameraState.FOLLOWING ->
                binding.recenter.visibility = View.INVISIBLE
        NavigationCameraState.TRANSITION_TO_OVERVIEW,
        NavigationCameraState.OVERVIEW,
        NavigationCameraState.IDLE -> binding.recenter.visibility = View.VISIBLE
      }
    }
    // set the padding values depending on screen orientation and visible view layout
    if (this.resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE) {
      viewportDataSource.overviewPadding = landscapeOverviewPadding
    } else {
      viewportDataSource.overviewPadding = overviewPadding
    }
    if (this.resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE) {
      viewportDataSource.followingPadding = landscapeFollowingPadding
    } else {
      viewportDataSource.followingPadding = followingPadding
    }

    // make sure to use the same DistanceFormatterOptions across different features
    val unitType = if (distanceUnit == "imperial") UnitType.IMPERIAL else UnitType.METRIC
    val distanceFormatterOptions =
            DistanceFormatterOptions.Builder(context).unitType(unitType).build()

    // initialize maneuver api that feeds the data to the top banner maneuver view
    maneuverApi = MapboxManeuverApi(MapboxDistanceFormatter(distanceFormatterOptions))

    // initialize bottom progress view
    tripProgressApi =
            MapboxTripProgressApi(
                    TripProgressUpdateFormatter.Builder(context)
                            .distanceRemainingFormatter(
                                    DistanceRemainingFormatter(distanceFormatterOptions)
                            )
                            .timeRemainingFormatter(TimeRemainingFormatter(context))
                            .percentRouteTraveledFormatter(PercentDistanceTraveledFormatter())
                            .estimatedTimeToArrivalFormatter(
                                    EstimatedTimeToArrivalFormatter(
                                            context,
                                            TimeFormat.NONE_SPECIFIED
                                    )
                            )
                            .build()
            )
    // initialize voice instructions api and the voice instruction player
    speechApi = MapboxSpeechApi(context, locale.toLanguageTag())
    voiceInstructionsPlayer = MapboxVoiceInstructionsPlayer(context, locale.toLanguageTag())

    // load map style
    Log.d("MapboxNavigationView", "🎨 INICIANDO loadStyle(NAVIGATION_DAY_STYLE)")
    binding.mapView.mapboxMap.loadStyle(NavigationStyles.NAVIGATION_DAY_STYLE) {
      Log.d("MapboxNavigationView", "🎨 Estilo NAVIGATION_DAY_STYLE carregado, iniciando setup")
      try {
        // Ensure that the route line related layers are present before the route arrow
        routeLineView.initializeLayers(it)
        // Carregar imagens das placas previamente (com tratamento de erro)
        Log.d("MapboxNavigationView", "🖼️ Carregando imagens das placas...")
        try {
          loadRadarImages(it)
          Log.d("MapboxNavigationView", "✅ loadRadarImages concluído")
        } catch (e: Exception) {
          Log.e("MapboxNavigationView", "❌ Erro ao carregar imagens prévias", e)
          // Continuar mesmo se falhar - listener vai carregar sob demanda
        }
        // Registrar listener de imagens faltantes apenas uma vez
        try {
          registerImageMissingListener(it)
          Log.d("MapboxNavigationView", "✅ Listener de imagens faltantes registrado")
        } catch (e: Exception) {
          Log.e("MapboxNavigationView", "❌ Erro ao registrar listener de imagens", e)
        }
        // Atualizar radares após o estilo carregar
        Log.d("MapboxNavigationView", "🔄 Chamando updateRadarsOnMap() após estilo carregar")
        updateRadarsOnMap()
      } catch (e: Exception) {
        Log.e("MapboxNavigationView", "❌ Erro ao inicializar estilo", e)
        // Tentar atualizar radares mesmo se houver erro
        try {
          updateRadarsOnMap()
        } catch (e2: Exception) {
          Log.e("MapboxNavigationView", "❌ Erro ao atualizar radares após erro de estilo", e2)
        }
      }
    }

    // initialize view interactions
    binding.stop.setOnClickListener {
      val event = Arguments.createMap()
      event.putString("message", "Navigation Cancel")
      if (context != null && id != null) {
        try {
          val eventEmitter = context.getJSModule(RCTEventEmitter::class.java)
          if (eventEmitter != null) {
            eventEmitter.receiveEvent(id, "onCancelNavigation", event)
          }
        } catch (e: Exception) {
          // Silenciar erro - não logar para evitar poluição de logs
        }
      }
    }

    binding.recenter.setOnClickListener {
      navigationCamera.requestNavigationCameraToFollowing()
      binding.routeOverview.showTextAndExtend(BUTTON_ANIMATION_DURATION)
    }
    binding.routeOverview.setOnClickListener {
      navigationCamera.requestNavigationCameraToOverview()
      binding.recenter.showTextAndExtend(BUTTON_ANIMATION_DURATION)
    }
    binding.soundButton.setOnClickListener {
      // mute/unmute voice instructions
      isVoiceInstructionsMuted = !isVoiceInstructionsMuted
    }

    // Check initial muted or not
    if (this.isVoiceInstructionsMuted) {
      binding.soundButton.mute()
      voiceInstructionsPlayer?.volume(SpeechVolume(0f))
    } else {
      binding.soundButton.unmute()
      voiceInstructionsPlayer?.volume(SpeechVolume(1f))
    }
  }

  private fun onDestroy() {
    maneuverApi.cancel()
    routeLineApi.cancel()
    routeLineView.cancel()
    speechApi.cancel()
    voiceInstructionsPlayer?.shutdown()
    mapboxNavigation?.stopTripSession()
  }

  private fun startNavigation() {
    // initialize location puck
    binding.mapView.location.apply {
      setLocationProvider(navigationLocationProvider)
      this.locationPuck =
              LocationPuck2D(
                      bearingImage =
                              ImageHolder.Companion.from(
                                      com.mapbox
                                              .navigation
                                              .ui
                                              .maps
                                              .R
                                              .drawable
                                              .mapbox_navigation_puck_icon
                              )
              )
      puckBearingEnabled = true
      enabled = true
    }

    startRoute()
  }

  private val arrivalObserver =
          object : ArrivalObserver {

            override fun onWaypointArrival(routeProgress: RouteProgress) {
              onArrival(routeProgress)
            }

            override fun onNextRouteLegStart(routeLegProgress: RouteLegProgress) {
              // do something when the user starts a new leg
            }

            override fun onFinalDestinationArrival(routeProgress: RouteProgress) {
              onArrival(routeProgress)
            }
          }

  private fun onArrival(routeProgress: RouteProgress) {
    val leg = routeProgress.currentLegProgress
    if (leg != null) {
      val event = Arguments.createMap()
      event.putInt("index", leg.legIndex)
      event.putDouble("latitude", leg.legDestination?.location?.latitude() ?: 0.0)
      event.putDouble("longitude", leg.legDestination?.location?.longitude() ?: 0.0)
      if (context != null && id != null) {
        try {
          val eventEmitter = context.getJSModule(RCTEventEmitter::class.java)
          if (eventEmitter != null) {
            eventEmitter.receiveEvent(id, "onArrive", event)
          }
        } catch (e: Exception) {
          // Silenciar erro - não logar para evitar poluição de logs
        }
      }
    }
  }

  override fun requestLayout() {
    super.requestLayout()
    post(measureAndLayout)
  }

  private val measureAndLayout = Runnable {
    measure(
            MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
    )
    layout(left, top, right, bottom)
  }

  private fun findRoute(coordinates: List<Point>) {
    // Separate legs work
    val indices = mutableListOf<Int>()
    val names = mutableListOf<String>()
    indices.add(0)
    names.add("origin")
    indices.addAll(waypointLegs.map { it.index })
    names.addAll(waypointLegs.map { it.name })
    indices.add(coordinates.count() - 1)
    names.add(destinationTitle)

    mapboxNavigation?.requestRoutes(
            RouteOptions.builder()
                    .applyDefaultNavigationOptions()
                    .applyLanguageAndVoiceUnitOptions(context)
                    .coordinatesList(coordinates)
                    .waypointIndicesList(indices)
                    .waypointNamesList(names)
                    .language(locale.toLanguageTag())
                    .steps(true)
                    .voiceInstructions(true)
                    .voiceUnits(distanceUnit)
                    .build(),
            object : NavigationRouterCallback {
              override fun onCanceled(
                      routeOptions: RouteOptions,
                      @RouterOrigin routerOrigin: String
              ) {
                // no implementation
              }

              override fun onFailure(reasons: List<RouterFailure>, routeOptions: RouteOptions) {
                sendErrorToReact("Error finding route $reasons")
              }

              override fun onRoutesReady(
                      routes: List<NavigationRoute>,
                      @RouterOrigin routerOrigin: String
              ) {
                setRouteAndStartNavigation(routes)
              }
            }
    )
  }

  @SuppressLint("MissingPermission")
  private fun setRouteAndStartNavigation(routes: List<NavigationRoute>) {
    // set routes, where the first route in the list is the primary route that
    // will be used for active guidance
    mapboxNavigation?.setNavigationRoutes(routes)

    // show UI elements
    binding.soundButton.visibility = View.VISIBLE
    binding.routeOverview.visibility = View.VISIBLE
    binding.tripProgressCard.visibility = View.VISIBLE
    
    // Estilizar o TripProgressView com cores preto/amarelo
    try {
      // Tentar aplicar tema personalizado ao TripProgressView
      binding.tripProgressView.setBackgroundColor(0x00000000) // Transparente
      
      // Tentar encontrar e estilizar TextViews dentro do TripProgressView
      // Isso pode não funcionar dependendo da implementação interna do SDK
      val tripProgressContainer = binding.tripProgressView
      if (tripProgressContainer != null) {
        tripProgressContainer.setBackgroundColor(0x00000000) // Fundo transparente
      }
    } catch (e: Exception) {
      // Silenciar erro se não for possível estilizar
      Log.d("MapboxNavigationView", "Não foi possível estilizar TripProgressView completamente: ${e.message}")
    }

    // move the camera to overview when new route is available
    //    navigationCamera.requestNavigationCameraToOverview()
    mapboxNavigation?.startTripSession(withForegroundService = true)
  }

  private fun startRoute() {
    // register event listeners
    mapboxNavigation?.registerRoutesObserver(routesObserver)
    mapboxNavigation?.registerArrivalObserver(arrivalObserver)
    mapboxNavigation?.registerRouteProgressObserver(routeProgressObserver)
    mapboxNavigation?.registerLocationObserver(locationObserver)
    mapboxNavigation?.registerVoiceInstructionsObserver(voiceInstructionsObserver)

    // Create a list of coordinates that includes origin, destination
    val coordinatesList = mutableListOf<Point>()
    this.origin?.let { coordinatesList.add(it) }
    this.waypoints.let { coordinatesList.addAll(waypoints) }
    this.destination?.let { coordinatesList.add(it) }

    findRoute(coordinatesList)
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    mapboxNavigation?.unregisterRoutesObserver(routesObserver)
    mapboxNavigation?.unregisterArrivalObserver(arrivalObserver)
    mapboxNavigation?.unregisterLocationObserver(locationObserver)
    mapboxNavigation?.unregisterRouteProgressObserver(routeProgressObserver)
    mapboxNavigation?.unregisterVoiceInstructionsObserver(voiceInstructionsObserver)

    // Clear routs and end
    mapboxNavigation?.setNavigationRoutes(listOf())

    // hide UI elements
    binding.soundButton.visibility = View.INVISIBLE
    binding.maneuverView.visibility = View.INVISIBLE
    binding.routeOverview.visibility = View.INVISIBLE
    binding.tripProgressCard.visibility = View.INVISIBLE
  }

  private fun sendErrorToReact(error: String?) {
    if (context == null || id == null) {
      return
    }
    
    try {
      val event = Arguments.createMap()
      event.putString("error", error ?: "Unknown error")
      
      if (context != null && id != null) {
        try {
          val eventEmitter = context.getJSModule(RCTEventEmitter::class.java)
          if (eventEmitter != null) {
            eventEmitter.receiveEvent(id, "onError", event)
          }
        } catch (e: Exception) {
          // Silenciar erro - não logar para evitar poluição de logs
        }
      }
    } catch (e: Exception) {
      // Silenciar erro - não logar para evitar poluição de logs
    }
  }

  fun onDropViewInstance() {
    this.onDestroy()
  }

  fun setStartOrigin(origin: Point?) {
    this.origin = origin
  }

  fun setDestination(destination: Point?) {
    this.destination = destination
  }

  fun setDestinationTitle(title: String) {
    this.destinationTitle = title
  }

  fun setWaypointLegs(legs: List<WaypointLegs>) {
    this.waypointLegs = legs
  }

  fun setWaypoints(waypoints: List<Point>) {
    this.waypoints = waypoints
  }

  fun setDirectionUnit(unit: String) {
    this.distanceUnit = unit
    initNavigation()
  }

  fun setLocal(language: String) {
    val locals = language.split("-")
    when (locals.size) {
      1 -> locale = Locale(locals.first())
      2 -> locale = Locale(locals.first(), locals.last())
    }
    // Reinitialize voice instructions with new locale if already initialized
    if (::speechApi.isInitialized) {
      speechApi = MapboxSpeechApi(context, locale.toLanguageTag())
      voiceInstructionsPlayer = MapboxVoiceInstructionsPlayer(context, locale.toLanguageTag())
    }
  }

  fun setMute(mute: Boolean) {
    this.isVoiceInstructionsMuted = mute
  }

  fun setShowCancelButton(show: Boolean) {
    binding.stop.visibility = if (show) View.VISIBLE else View.INVISIBLE
  }

  fun setRadars(radars: List<RadarPoint>) {
    this.radars = radars
    Log.d("MapboxNavigationView", "📡 setRadars chamado com ${radars.size} radares")
    if (radars.isNotEmpty()) {
      Log.d(
              "MapboxNavigationView",
              "📍 Primeiro radar: lat=${radars[0].latitude}, lng=${radars[0].longitude}, speedLimit=${radars[0].speedLimit}"
      )
    }
    updateRadarsOnMap()
  }

  private fun loadRadarImages(style: com.mapbox.maps.Style) {
    // Carregar todas as imagens das placas usando ImageHolder.fromBitmap() (API correta do SDK v11)
    // Baseado no exemplo oficial do Mapbox Maps SDK v11:
    // https://docs.mapbox.com/android/maps/examples/android-view/display-multiple-icon-images-in-a-symbol-layer/
    Log.d("MapboxNavigationView", "🔄 INICIANDO loadRadarImages() - usando style.addImage() com Bitmap")
    
    var imagesLoaded = 0
    var imagesFailed = 0
    
    try {
      val imageNames =
              listOf(
                      "placa0",
                      "placa20",
                      "placa30",
                      "placa40",
                      "placa50",
                      "placa60",
                      "placa70",
                      "placa80",
                      "placa90",
                      "placa100",
                      "placa110",
                      "placa120",
                      "placa130",
                      "placa140",
                      "placa150",
                      "placa160",
                      "placa"
              )

      imageNames.forEach { imageName ->
        try {
          val resourceName = "assets_images_$imageName"
          val resourceId =
                  context.resources.getIdentifier(resourceName, "drawable", context.packageName)
          
          if (resourceId == 0) {
            Log.w("MapboxNavigationView", "⚠️ Recurso não encontrado: $resourceName")
            imagesFailed++
            return@forEach
          }
          
          val bitmap = BitmapFactory.decodeResource(context.resources, resourceId)
          if (bitmap == null) {
            Log.w("MapboxNavigationView", "⚠️ Bitmap null para $resourceName")
            imagesFailed++
            return@forEach
          }
          
          // USAR style.addImage() - API CORRETA DO MAPBOX SDK v11
          // Não usar reflection, DataRef ou Image diretamente
          try {
            // Verificar se a imagem já existe no estilo antes de adicionar
            val imageExists = try {
              style.getStyleImage(imageName) != null
            } catch (e: Exception) {
              false
            }
            
            if (!imageExists) {
              // Usar addImage() que aceita Bitmap diretamente (API v11)
              style.addImage(imageName, bitmap)
              imagesLoaded++
              Log.d(
                      "MapboxNavigationView",
                      "✅ Imagem $imageName carregada (${bitmap.width}x${bitmap.height}) - Total: $imagesLoaded"
              )
            } else {
              Log.d("MapboxNavigationView", "ℹ️ Imagem $imageName já existe no estilo")
            }
          } catch (e: Exception) {
            Log.e(
                    "MapboxNavigationView",
                    "❌ Erro ao adicionar imagem $imageName ao estilo usando ImageHolder",
                    e
            )
            imagesFailed++
          }
        } catch (e: Exception) {
          Log.e("MapboxNavigationView", "❌ Erro ao carregar imagem $imageName", e)
          imagesFailed++
        }
      }
      
      Log.d(
              "MapboxNavigationView",
              "✅ Carregamento concluído: $imagesLoaded carregadas, $imagesFailed falharam"
      )
    } catch (e: Exception) {
      Log.e("MapboxNavigationView", "❌ Erro geral ao carregar imagens", e)
    }
  }

  private fun registerImageMissingListener(style: com.mapbox.maps.Style) {
    // Registrar listener apenas uma vez
    if (imageMissingListenerRegistered) {
      Log.d("MapboxNavigationView", "Listener de imagens faltantes já registrado")
      return
    }

    binding.mapView.mapboxMap.subscribeStyleImageMissing { eventData ->
      val missingId = eventData.imageId
      Log.d("MapboxNavigationView", "🔍 Imagem faltante detectada pelo listener: $missingId")

      // Verificar se o estilo ainda está disponível
      val currentStyle = binding.mapView.mapboxMap.style
      if (currentStyle == null) {
        Log.w(
                "MapboxNavigationView",
                "Estilo não disponível ao processar imagem faltante: $missingId"
        )
        return@subscribeStyleImageMissing
      }

      // Tentar carregar a imagem faltante
      try {
        val resourceName = "assets_images_$missingId"
        val resourceId =
                context.resources.getIdentifier(resourceName, "drawable", context.packageName)
        if (resourceId != 0) {
              val bitmap = BitmapFactory.decodeResource(context.resources, resourceId)
              if (bitmap != null) {
                // USAR style.addImage() - API CORRETA DO MAPBOX SDK v11
                try {
                  // Verificar se a imagem já existe antes de adicionar
                  val imageExists = try {
                    currentStyle.getStyleImage(missingId) != null
                  } catch (e: Exception) {
                    false
                  }
                  
                  if (!imageExists) {
                    // Usar addImage() que aceita Bitmap diretamente (API v11)
                    currentStyle.addImage(missingId, bitmap)
                    Log.d(
                            "MapboxNavigationView",
                            "✅ Imagem faltante $missingId carregada via listener (${bitmap.width}x${bitmap.height})"
                    )
                    Log.d("MapboxNavigationView", "🔄 Imagem $missingId deve aparecer no mapa agora")
                  } else {
                    Log.d("MapboxNavigationView", "ℹ️ Imagem $missingId já existe no estilo")
                  }
                } catch (e: Exception) {
                  Log.e("MapboxNavigationView", "❌ Erro ao carregar imagem $missingId usando ImageHolder", e)
                }
              }
        } else {
          Log.w(
                  "MapboxNavigationView",
                  "Recurso não encontrado para imagem faltante: $resourceName"
          )
        }
      } catch (e: Exception) {
        Log.e("MapboxNavigationView", "Erro ao processar imagem faltante $missingId", e)
        // Não fazer printStackTrace para evitar poluir logs
      }
    }

    imageMissingListenerRegistered = true
    Log.d("MapboxNavigationView", "Listener de imagens faltantes registrado com sucesso")
  }

  private fun updateRadarsOnMap() {
    Log.d("MapboxNavigationView", "🔄 INICIANDO updateRadarsOnMap() com ${radars.size} radares")
    Log.d("MapboxNavigationView", "📋 Binding disponível: ${binding != null}")
    // Verificar se binding está disponível
    if (binding == null) {
      Log.w("MapboxNavigationView", "⚠️ Binding não disponível - ABORTANDO updateRadarsOnMap")
      return
    }

    val style = binding.mapView.mapboxMap.style
    if (style == null) {
      Log.w("MapboxNavigationView", "Estilo do mapa ainda não está pronto, aguardando...")
      // Evitar chamar loadStyle múltiplas vezes
      if (!isStyleLoading) {
        isStyleLoading = true
        binding.mapView.mapboxMap.loadStyle(NavigationStyles.NAVIGATION_DAY_STYLE) {
          isStyleLoading = false
          routeLineView.initializeLayers(it)
          Log.d("MapboxNavigationView", "🔄 Carregando imagens no loadStyle (updateRadarsOnMap)")
          try {
            loadRadarImages(it)
          } catch (e: Exception) {
            Log.e("MapboxNavigationView", "❌ Erro ao carregar imagens no loadStyle", e)
          }
          registerImageMissingListener(it)
          updateRadarsOnMap()
        }
      }
      return
    }

    Log.d("MapboxNavigationView", "Atualizando ${radars.size} radares no mapa")

    // Criar GeoJSON FeatureCollection com os radares
    val features =
            radars.map { radar ->
              // Mapear velocidade para nome da imagem (mesma lógica do React Native)
              val speedLimit = radar.speedLimit ?: 0.0
              val speeds = listOf(20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160)
              val closestSpeed =
                      if (speedLimit > 0) {
                        speeds.minByOrNull { kotlin.math.abs(it - speedLimit) } ?: 0
                      } else {
                        0
                      }
              val iconImage = if (closestSpeed > 0) "placa$closestSpeed" else "placa0"

              // Log para debug (apenas primeiro radar para não poluir logs)
              if (radars.indexOf(radar) == 0) {
                Log.d(
                        "MapboxNavigationView",
                        "Primeiro radar: speedLimit=${radar.speedLimit}, iconImage=$iconImage"
                )
              }

              Feature.fromGeometry(
                      Point.fromLngLat(radar.longitude, radar.latitude),
                      JsonObject().apply {
                        addProperty("id", radar.id)
                        addProperty("speedLimit", radar.speedLimit?.toString() ?: "")
                        addProperty("iconImage", iconImage)
                      }
              )
            }

    if (features.isEmpty()) {
      Log.d("MapboxNavigationView", "Nenhum radar para adicionar")
      return
    }

    val featureCollection = FeatureCollection.fromFeatures(features.toList())
    Log.d("MapboxNavigationView", "FeatureCollection criado com ${features.size} features")

    // Verificar novamente se o estilo ainda está disponível antes de usar
    val currentStyle = binding.mapView.mapboxMap.style
    if (currentStyle == null) {
      Log.w("MapboxNavigationView", "Estilo ficou null durante atualização, abortando")
      return
    }

    // Remover source e layer existentes se houver
    try {
      if (currentStyle.styleSourceExists("radars-source")) {
        currentStyle.removeStyleSource("radars-source")
        Log.d("MapboxNavigationView", "🗑️ Source radars-source removido")
      }
      // Remover CircleLayer se existir (não estamos mais usando)
      if (currentStyle.styleLayerExists("radars-layer")) {
        currentStyle.removeStyleLayer("radars-layer")
        Log.d("MapboxNavigationView", "🗑️ Layer radars-layer (CircleLayer) removido")
      }
      if (currentStyle.styleLayerExists("radars-layer-symbol")) {
        currentStyle.removeStyleLayer("radars-layer-symbol")
        Log.d("MapboxNavigationView", "🗑️ Layer radars-layer-symbol removido")
      }
    } catch (e: Exception) {
      Log.w("MapboxNavigationView", "⚠️ Erro ao remover source/layer existente: ${e.message}")
      // Continuar mesmo se houver erro ao remover
    }

    // Adicionar GeoJSON source usando a API do Mapbox Maps SDK v11
    try {
      // Verificar estilo novamente antes de adicionar source
      val styleForSource = binding.mapView.mapboxMap.style
      if (styleForSource == null) {
        Log.w("MapboxNavigationView", "Estilo ficou null antes de adicionar source")
        return
      }

      val geoJsonString = featureCollection.toJson()
      val sourceJson =
              """
        {
          "type": "geojson",
          "data": $geoJsonString
        }
      """.trimIndent()

      val sourceValueResult = com.mapbox.bindgen.Value.fromJson(sourceJson)
      when (val value = sourceValueResult.value) {
        null -> {
          Log.e("MapboxNavigationView", "Erro ao criar Value do JSON: ${sourceValueResult.error}")
          return
        }
        else -> {
          styleForSource.addStyleSource("radars-source", value)
          Log.d(
                  "MapboxNavigationView",
                  "GeoJSON source adicionado com sucesso: ${radars.size} radares"
          )
        }
      }
    } catch (e: Exception) {
      Log.e("MapboxNavigationView", "Erro ao adicionar GeoJSON source", e)
      // Não fazer return aqui para tentar adicionar o layer mesmo se o source falhar
    }

    // O listener de imagens faltantes é registrado apenas uma vez em registerImageMissingListener()

    // Adicionar SymbolLayer para renderizar os radares com ícones usando API v11
    try {
      // Verificar estilo novamente antes de adicionar layer
      val styleForLayer = binding.mapView.mapboxMap.style
      if (styleForLayer == null) {
        Log.w("MapboxNavigationView", "Estilo ficou null antes de adicionar layer")
        return
      }

      // PASSO 1: Carregar TODAS as imagens ANTES de criar qualquer layer
      // CRÍTICO: As imagens DEVEM estar no estilo ANTES do SymbolLayer ser criado
      Log.d("MapboxNavigationView", "🖼️ PASSO 1: Carregando imagens ANTES de criar layers...")
      try {
        loadRadarImages(styleForLayer)
        
        // Verificar se as imagens foram realmente adicionadas ao estilo
        val requiredImages = listOf("placa0", "placa20", "placa60", "placa")
        var allImagesLoaded = true
        requiredImages.forEach { imgName ->
          val exists = try {
            styleForLayer.getStyleImage(imgName) != null
          } catch (e: Exception) {
            false
          }
          if (exists) {
            Log.d("MapboxNavigationView", "✅ Verificação: Imagem $imgName existe no estilo")
          } else {
            Log.w("MapboxNavigationView", "⚠️ Verificação: Imagem $imgName NÃO encontrada no estilo")
            allImagesLoaded = false
          }
        }
        
        if (!allImagesLoaded) {
          Log.w("MapboxNavigationView", "⚠️ Algumas imagens não foram carregadas - SymbolLayer pode não funcionar")
        } else {
          Log.d("MapboxNavigationView", "✅ Todas as imagens necessárias foram carregadas")
        }
      } catch (e: Exception) {
        Log.e("MapboxNavigationView", "❌ Erro crítico ao carregar imagens", e)
        // NÃO continuar se as imagens não foram carregadas
        return
      }

      // PASSO 2: Adicionar SymbolLayer com as placas (sem CircleLayer/fallback)
      Log.d("MapboxNavigationView", "🖼️ PASSO 2: Adicionando SymbolLayer (apenas placas, sem fallback)")
      
      try {
        // Criar SymbolLayer com icon-image dinâmico usando propriedade do GeoJSON
        val layerJson = """
          {
            "id": "radars-layer-symbol",
            "type": "symbol",
            "source": "radars-source",
            "layout": {
              "icon-image": ["get", "iconImage"],
              "icon-size": 0.2,
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              "icon-anchor": "bottom",
              "icon-pitch-alignment": "viewport"
            },
            "paint": {}
          }
        """.trimIndent()

        val layerValueResult = com.mapbox.bindgen.Value.fromJson(layerJson)
        when (val value = layerValueResult.value) {
          null -> {
            Log.e(
                    "MapboxNavigationView",
                    "❌ Erro ao criar SymbolLayer: ${layerValueResult.error}"
            )
          }
          else -> {
            try {
              // Adicionar SymbolLayer diretamente (sem CircleLayer)
              styleForLayer.addStyleLayer(value, null)
              Log.d(
                      "MapboxNavigationView",
                      "✅ SymbolLayer adicionado com sucesso (icon-size=1.0) - apenas placas"
              )
              Log.d(
                      "MapboxNavigationView",
                      "📋 SymbolLayer configurado para usar iconImage do GeoJSON"
              )
            } catch (e: Exception) {
              Log.e("MapboxNavigationView", "❌ Erro ao adicionar SymbolLayer", e)
            }
          }
        }
      } catch (e: Exception) {
        Log.e("MapboxNavigationView", "❌ Erro ao processar SymbolLayer", e)
      }
    } catch (e: Exception) {
      Log.e("MapboxNavigationView", "Erro ao processar layer", e)
      // Não fazer printStackTrace para evitar poluir logs
    }
  }
  
  /**
   * Função para estilizar o TripProgressView com cores preto/amarelo
   * Tenta encontrar e estilizar todos os TextViews e ImageViews dentro do TripProgressView
   */
  private fun styleTripProgressView() {
    try {
      val tripProgressView = binding.tripProgressView
      
      // Definir fundo transparente
      tripProgressView.setBackgroundColor(0x00000000)
      
      // Função recursiva para encontrar e estilizar todos os TextViews e ImageViews
      fun styleViews(view: View) {
        when (view) {
          is TextView -> {
            // Aplicar cor amarela aos textos
            view.setTextColor(0xFFFFEB3B.toInt()) // Amarelo #FFEB3B
          }
          is android.widget.ImageView -> {
            // Aplicar cor branca aos ícones
            view.colorFilter = android.graphics.PorterDuffColorFilter(
              0xFFFFFFFF.toInt(), // Branco #FFFFFF
              android.graphics.PorterDuff.Mode.SRC_ATOP
            )
          }
        }
        
        if (view is ViewGroup) {
          for (i in 0 until view.childCount) {
            styleViews(view.getChildAt(i))
          }
        }
      }
      
      // Estilizar após um pequeno delay para garantir que a view foi renderizada
      tripProgressView.post {
        styleViews(tripProgressView)
      }
    } catch (e: Exception) {
      // Silenciar erro - pode não ser possível estilizar completamente
      Log.d("MapboxNavigationView", "Erro ao estilizar TripProgressView: ${e.message}")
    }
  }
  
  /**
   * Função para estilizar os botões de navegação (soundButton, routeOverview, recenter)
   * Aplica cores amarelas aos ícones dos botões
   */
  private fun styleNavigationButtons() {
    try {
      // Estilizar SoundButton
      try {
        val soundButton = binding.soundButton
        // Tentar encontrar ImageViews dentro do botão e aplicar cor amarela
        styleButtonViews(soundButton)
      } catch (e: Exception) {
        Log.d("MapboxNavigationView", "Erro ao estilizar soundButton: ${e.message}")
      }
      
      // Estilizar RouteOverviewButton
      try {
        val routeOverview = binding.routeOverview
        styleButtonViews(routeOverview)
      } catch (e: Exception) {
        Log.d("MapboxNavigationView", "Erro ao estilizar routeOverview: ${e.message}")
      }
      
      // Estilizar RecenterButton
      try {
        val recenter = binding.recenter
        styleButtonViews(recenter)
      } catch (e: Exception) {
        Log.d("MapboxNavigationView", "Erro ao estilizar recenter: ${e.message}")
      }
    } catch (e: Exception) {
      Log.d("MapboxNavigationView", "Erro ao estilizar botões de navegação: ${e.message}")
    }
  }
  
  /**
   * Função auxiliar para estilizar views dentro de um botão
   * Melhorada para encontrar ImageViews em diferentes estruturas de layout
   */
  private fun styleButtonViews(view: View) {
    // Função recursiva para encontrar e estilizar ImageViews e aplicar tint
    fun styleViewsRecursive(v: View) {
      when (v) {
        is ImageView -> {
          // Aplicar cor amarela aos ícones dos botões
          v.colorFilter = android.graphics.PorterDuffColorFilter(
            0xFFFFEB3B.toInt(), // Amarelo #FFEB3B
            android.graphics.PorterDuff.Mode.SRC_ATOP
          )
          // Também tentar aplicar tint diretamente se disponível
          try {
            v.imageTintList = android.content.res.ColorStateList.valueOf(0xFFFFEB3B.toInt())
          } catch (e: Exception) {
            // Se não suportar tint, usar apenas colorFilter
          }
        }
        is android.widget.ImageButton -> {
          // Para ImageButton, aplicar cor amarela
          v.colorFilter = android.graphics.PorterDuffColorFilter(
            0xFFFFEB3B.toInt(), // Amarelo #FFEB3B
            android.graphics.PorterDuff.Mode.SRC_ATOP
          )
          try {
            v.imageTintList = android.content.res.ColorStateList.valueOf(0xFFFFEB3B.toInt())
          } catch (e: Exception) {
            // Ignorar se não suportar
          }
        }
      }
      
      if (v is ViewGroup) {
        for (i in 0 until v.childCount) {
          styleViewsRecursive(v.getChildAt(i))
        }
      }
      
      // Tentar aplicar tint no próprio view se for compatível com tint
      try {
        val viewClass = v.javaClass.name
        if (viewClass.contains("AppCompatImageButton") || 
            viewClass.contains("MaterialButton") ||
            viewClass.contains("ImageButton")) {
          val tintMethod = v.javaClass.getMethod("setImageTintList", android.content.res.ColorStateList::class.java)
          tintMethod.invoke(v, android.content.res.ColorStateList.valueOf(0xFFFFEB3B.toInt()))
        }
      } catch (e: Exception) {
        // Ignorar se não suportar - não logar para evitar poluição
      }
    }
    
    // Estilizar imediatamente e depois novamente após delay para garantir
    styleViewsRecursive(view)
    view.post {
      styleViewsRecursive(view)
      // Tentar mais uma vez após renderização completa
      view.postDelayed({
        styleViewsRecursive(view)
      }, 100)
    }
  }
  
  /**
   * Função para estilizar o ManeuverView (Turn by Turn) com cores preto/amarelo
   * Aplica fundo preto com borda amarela diretamente no ManeuverView
   */
  private fun styleManeuverView() {
    try {
      val maneuverView = binding.maneuverView
      
      // Aplicar fundo preto semi-transparente com borda amarela diretamente no ManeuverView
      try {
        val backgroundDrawable = android.graphics.drawable.GradientDrawable()
        backgroundDrawable.setColor(0xE6000000.toInt()) // Preto semi-transparente
        backgroundDrawable.setStroke(2, 0xFFFFEB3B.toInt()) // Borda amarela de 2dp
        backgroundDrawable.cornerRadius = 16f * context.resources.displayMetrics.density // 16dp em pixels
        
        maneuverView.background = backgroundDrawable
        maneuverView.setPadding(
          (16 * context.resources.displayMetrics.density).toInt(), // 16dp padding
          (16 * context.resources.displayMetrics.density).toInt(),
          (16 * context.resources.displayMetrics.density).toInt(),
          (16 * context.resources.displayMetrics.density).toInt()
        )
      } catch (e: Exception) {
        Log.d("MapboxNavigationView", "Erro ao aplicar fundo no ManeuverView: ${e.message}")
      }
      
      // Função recursiva para encontrar e estilizar todos os TextViews e ImageViews
      fun styleViews(view: View) {
        when (view) {
          is TextView -> {
            // Aplicar cor amarela aos textos
            view.setTextColor(0xFFFFEB3B.toInt()) // Amarelo #FFEB3B
          }
          is ImageView -> {
            // Aplicar cor amarela aos ícones de seta/manobra
            view.colorFilter = android.graphics.PorterDuffColorFilter(
              0xFFFFEB3B.toInt(), // Amarelo #FFEB3B
              android.graphics.PorterDuff.Mode.SRC_ATOP
            )
          }
        }
        
        if (view is ViewGroup) {
          for (i in 0 until view.childCount) {
            styleViews(view.getChildAt(i))
          }
        }
      }
      
      // Estilizar após um pequeno delay para garantir que a view foi renderizada
      maneuverView.post {
        styleViews(maneuverView)
      }
    } catch (e: Exception) {
      // Silenciar erro - pode não ser possível estilizar completamente
      Log.d("MapboxNavigationView", "Erro ao estilizar ManeuverView: ${e.message}")
    }
  }
}

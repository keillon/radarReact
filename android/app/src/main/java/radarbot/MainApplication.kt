package radarbot

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.SoLoader
import com.mapboxnavigation.MapboxNavigationViewPackage
import com.radarbot.CustomNavigationPackage

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
          object : DefaultReactNativeHost(this) {
            override fun getPackages(): List<ReactPackage> {
              val packages = PackageList(this).packages.toMutableList()
              // Verificar se MapboxNavigationViewPackage já foi adicionado pelo autolinking
              val hasMapboxNav =
                      packages.any { it.javaClass.simpleName == "MapboxNavigationViewPackage" }
              android.util.Log.d(
                      "MainApplication",
                      "MapboxNavigationViewPackage encontrado: $hasMapboxNav"
              )
              if (!hasMapboxNav) {
                android.util.Log.d(
                        "MainApplication",
                        "Adicionando MapboxNavigationViewPackage manualmente"
                )
                packages.add(MapboxNavigationViewPackage())
              }

              // Adicionar nosso package de navegação customizada
              packages.add(CustomNavigationPackage())
              android.util.Log.d("MainApplication", "CustomNavigationPackage adicionado")
              return packages
            }

            override fun getJSMainModuleName(): String = "index"

            override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

            override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
            override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
          }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, false)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
  }
}

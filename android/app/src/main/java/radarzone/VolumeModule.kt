package radarzone

import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.modules.core.DeviceEventManagerModule
import android.content.Context

class VolumeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "VolumeModule"

    private val audioManager: AudioManager? by lazy {
        reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var pollRunnable: Runnable? = null
    private var lastEmittedVolume = -1.0

    private fun getNormalizedVolume(): Double {
        val am = audioManager ?: return 1.0
        val current = am.getStreamVolume(AudioManager.STREAM_MUSIC)
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        return if (max > 0) current.toDouble() / max else 1.0
    }

    private fun emitVolumeChange(normalized: Double) {
        if (kotlin.math.abs(normalized - lastEmittedVolume) < 0.001) return
        lastEmittedVolume = normalized
        val params = Arguments.createMap().apply { putDouble("volume", normalized) }
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit("onVolumeChange", params)
    }

    @ReactMethod
    fun getVolume(promise: Promise) {
        try {
            val am = audioManager ?: run {
                promise.reject("NO_AUDIO", "AudioManager não disponível")
                return
            }
            val current = am.getStreamVolume(AudioManager.STREAM_MUSIC)
            val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            val normalized = if (max > 0) current.toDouble() / max else 1.0
            promise.resolve(normalized)
        } catch (e: Exception) {
            promise.reject("VOLUME_ERROR", e.message)
        }
    }

    @ReactMethod
    fun startListening(promise: Promise) {
        try {
            if (audioManager == null) {
                promise.reject("NO_AUDIO", "AudioManager não disponível")
                return
            }
            if (pollRunnable != null) {
                promise.resolve(null)
                return
            }
            lastEmittedVolume = getNormalizedVolume()
            val runnable = object : Runnable {
                override fun run() {
                    val v = getNormalizedVolume()
                    mainHandler.post { emitVolumeChange(v) }
                    mainHandler.postDelayed(this, 400)
                }
            }
            pollRunnable = runnable
            mainHandler.postDelayed(runnable, 400)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("VOLUME_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopListening(promise: Promise) {
        try {
            pollRunnable?.let { mainHandler.removeCallbacks(it) }
            pollRunnable = null
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("VOLUME_ERROR", e.message)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Listener para compatibilidade com NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Remover listeners
    }
}

package com.limushu.hm.host

import android.app.Activity
import android.content.res.Configuration
import android.graphics.Color
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class HostOptions { var theme: String? = null }

@TauriPlugin
class HostPlugin(private val activity: Activity) : Plugin(activity) {
    private var webview: WebView? = null
    private var theme: String? = null

    override fun load(webView: WebView) {
        webview = webView
        WindowCompat.setDecorFitsSystemWindows(activity.window, false)
        if (Build.VERSION.SDK_INT >= 33) webView.settings.isAlgorithmicDarkeningAllowed = false
        @Suppress("DEPRECATION")
        if (Build.VERSION.SDK_INT in 29..32) webView.settings.forceDark = WebSettings.FORCE_DARK_OFF
        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
            val parent = view.parent as? View
            val layout = view.layoutParams as? ViewGroup.MarginLayoutParams
            val decor = activity.window.decorView
            if (parent != null && layout != null && parent.width > 0 && parent.height > 0) {
                val position = IntArray(2)
                parent.getLocationInWindow(position)
                val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
                val margins = HostLayout.margins(
                    decor.width, decor.height,
                    Edges(position[0], position[1], position[0] + parent.width, position[1] + parent.height),
                    Edges(bars.left, bars.top, bars.right, bars.bottom),
                    insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
                )
                if (layout.leftMargin != margins.left || layout.topMargin != margins.top || layout.rightMargin != margins.right || layout.bottomMargin != margins.bottom) {
                    layout.setMargins(margins.left, margins.top, margins.right, margins.bottom)
                    view.layoutParams = layout
                }
            }
            WindowInsetsCompat.CONSUMED
        }
        webView.post { ViewCompat.requestApplyInsets(webView) }
        applyTheme()
    }

    @Suppress("DEPRECATION")
    private fun applyTheme() {
        val dark = HostLayout.dark(theme, activity.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES)
        val color = Color.parseColor(if (dark) "#191919" else "#f7f7f5")
        activity.window.decorView.setBackgroundColor(color)
        activity.findViewById<View>(android.R.id.content)?.setBackgroundColor(color)
        webview?.setBackgroundColor(color)
        activity.window.statusBarColor = Color.TRANSPARENT
        activity.window.navigationBarColor = Color.TRANSPARENT
        WindowInsetsControllerCompat(activity.window, activity.window.decorView).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }

    @Command
    fun setTheme(invoke: Invoke) {
        try {
            val options = invoke.parseArgs(HostOptions::class.java)
            HostLayout.dark(options.theme, false)
            activity.runOnUiThread {
                theme = options.theme
                applyTheme()
                invoke.resolve(JSObject())
            }
        } catch (_: Exception) { invoke.resolve(JSObject().apply { put("error", "host_theme_invalid") }) }
    }

    @Command
    fun foreground(invoke: Invoke) {
        activity.runOnUiThread {
            invoke.resolve(JSObject().apply {
                put("foreground", !activity.isFinishing && !activity.isDestroyed &&
                    (activity as? AppCompatActivity)?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.RESUMED) == true)
            })
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        applyTheme()
        webview?.let { ViewCompat.requestApplyInsets(it) }
    }
}

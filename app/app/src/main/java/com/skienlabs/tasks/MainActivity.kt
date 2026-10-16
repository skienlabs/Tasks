package com.skienlabs.tasks

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.skienlabs.tasks.data.ThemePref
import com.skienlabs.tasks.ui.Root
import com.skienlabs.tasks.ui.theme.TasksTheme

class MainActivity : ComponentActivity() {
    @Volatile private var themeReady = false

    override fun onCreate(savedInstanceState: Bundle?) {
        val app = (application as TasksApp).controller
        // Keep the splash only until we know whether someone is signed in (usually a few ms).
        // ...and the saved theme is read, so a light/dark choice never flashes the wrong colors.
        installSplashScreen().setKeepOnScreenCondition { !themeReady || app.session.value == Session.Starting }
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val saved by app.prefs.theme.collectAsStateWithLifecycle(null)
            val pref = saved ?: return@setContent
            SideEffect { themeReady = true }
            val dark = when (pref) {
                ThemePref.SYSTEM -> isSystemInDarkTheme()
                ThemePref.LIGHT -> false
                ThemePref.DARK -> true
            }
            DisposableEffect(dark) {
                val style = if (dark) SystemBarStyle.dark(Color.TRANSPARENT)
                else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
                enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
                onDispose {}
            }
            TasksTheme(dark) { Root(app, pref) }
        }
    }
}

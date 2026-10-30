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
import com.skienlabs.tasks.ui.theme.AppTheme
import com.skienlabs.tasks.ui.theme.TasksTheme

class MainActivity : ComponentActivity() {
    companion object {
        const val EXTRA_ACTION = "com.skienlabs.tasks.ACTION"
        const val ACTION_NEW_TASK = "new_task"
    }

    private fun handle(intent: android.content.Intent?) {
        val app = (application as TasksApp).controller
        if (intent?.getStringExtra(EXTRA_ACTION) == ACTION_NEW_TASK) {
            app.newTaskRequest.value = true
            intent.removeExtra(EXTRA_ACTION) // not again after rotation
        }
        // An invite link: https://<server>/join/<token>
        intent?.data?.path?.let { path ->
            com.skienlabs.tasks.ui.teams.joinTokenOf(path)?.let { app.joinRequest.value = it }
            intent.data = null
        }
        // A team notification: open the task if it's mine, else the team.
        val task = intent?.getStringExtra(com.skienlabs.tasks.notify.TeamNotices.EXTRA_TASK)
        val team = intent?.getStringExtra(com.skienlabs.tasks.notify.TeamNotices.EXTRA_TEAM)
        if (task != null || team != null) {
            app.openNotice(task, team)
            intent.removeExtra(com.skienlabs.tasks.notify.TeamNotices.EXTRA_TASK)
            intent.removeExtra(com.skienlabs.tasks.notify.TeamNotices.EXTRA_TEAM)
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    @Volatile private var themeReady = false

    override fun onCreate(savedInstanceState: Bundle?) {
        val app = (application as TasksApp).controller
        // Keep the splash only until we know whether someone is signed in (usually a few ms).
        // ...and the saved theme is read, so a light/dark choice never flashes the wrong colors.
        installSplashScreen().setKeepOnScreenCondition { !themeReady || app.session.value == Session.Starting }
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) handle(intent)
        enableEdgeToEdge()
        setContent {
            val saved by app.prefs.theme.collectAsStateWithLifecycle(null)
            val pref = saved ?: return@setContent
            SideEffect { themeReady = true }
            val systemDark = isSystemInDarkTheme()
            val theme = when (pref) {
                ThemePref.SYSTEM -> if (systemDark) AppTheme.MIDNIGHT else AppTheme.LIGHT
                ThemePref.LIGHT -> AppTheme.LIGHT
                ThemePref.GRAY -> AppTheme.GRAY
                ThemePref.DIM -> AppTheme.DIM
                ThemePref.DARK -> AppTheme.MIDNIGHT
                ThemePref.ABYSS -> AppTheme.ABYSS
                ThemePref.MONO -> AppTheme.MONO
                ThemePref.MONO_LIGHT -> AppTheme.MONO_LIGHT
                ThemePref.GLASS_LIGHT -> AppTheme.GLASS_LIGHT
            }
            val dark = theme.dark
            DisposableEffect(dark) {
                val style = if (dark) SystemBarStyle.dark(Color.TRANSPARENT)
                else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
                enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
                onDispose {}
            }
            TasksTheme(theme) { Root(app, pref) }
        }
    }
}

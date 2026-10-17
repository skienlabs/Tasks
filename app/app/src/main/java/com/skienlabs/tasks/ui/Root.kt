package com.skienlabs.tasks.ui

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import kotlinx.coroutines.launch
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.skienlabs.tasks.AppController
import com.skienlabs.tasks.Session
import com.skienlabs.tasks.data.ThemePref
import com.skienlabs.tasks.ui.auth.FailedScreen
import com.skienlabs.tasks.ui.auth.LoadingScreen
import com.skienlabs.tasks.ui.auth.NotConfiguredScreen
import com.skienlabs.tasks.ui.auth.OnboardingScreen
import com.skienlabs.tasks.ui.auth.SignInScreen
import com.skienlabs.tasks.ui.home.HomeScreen
import com.skienlabs.tasks.ui.images.LocalImages

/** Picks the screen for the current session. Screens only change on real session changes. */
@Composable
fun Root(app: AppController, theme: ThemePref) {
    val session by app.session.collectAsStateWithLifecycle()
    val introSeen by app.prefs.introSeen.collectAsStateWithLifecycle(null)
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    // Someone already signed in has no need for the tour later (e.g. after signing out).
    val signedIn = session is Session.Ready
    androidx.compose.runtime.LaunchedEffect(signedIn, introSeen) { if (signedIn && introSeen == false) app.prefs.setIntroSeen() }
    val screen = when (val s = session) {
        is Session.Ready -> if (s.profile.onboarded) "home" else "onboarding"
        Session.SignedOut -> when (introSeen) { null -> "Starting"; false -> "intro"; true -> "SignedOut" }
        else -> s::class.simpleName ?: ""
    }
    // Surface also sets the default text color for the theme (Box alone would leave it black).
    CompositionLocalProvider(LocalImages provides app.images) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Crossfade(screen, animationSpec = tween(180), label = "screen") { key ->
                when (val s = session) {
                    Session.Starting, is Session.Loading -> LoadingScreen()
                    Session.NotConfigured -> NotConfiguredScreen()
                    Session.SignedOut ->
                        if (key == "intro") com.skienlabs.tasks.ui.intro.IntroScreen { scope.launch { app.prefs.setIntroSeen() } }
                        else if (key == "SignedOut") SignInScreen(app.auth)
                        else LoadingScreen()
                    is Session.Failed -> FailedScreen(app, s)
                    is Session.Ready ->
                        if (key == "home" && s.profile.onboarded) HomeScreen(app, s.profile, theme)
                        else if (key == "onboarding") OnboardingScreen(app, s.profile)
                        else LoadingScreen()
                }
            }
        }
    }
}

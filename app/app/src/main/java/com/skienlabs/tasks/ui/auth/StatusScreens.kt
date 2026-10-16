package com.skienlabs.tasks.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.skienlabs.tasks.AppController
import com.skienlabs.tasks.Session
import com.skienlabs.tasks.ui.common.AppLogo
import kotlinx.coroutines.launch

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(Modifier.widthIn(max = 440.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
            content()
        }
    }
}

@Composable
fun LoadingScreen() = Centered {
    AppLogo(56.dp)
    LinearProgressIndicator(Modifier.width(120.dp))
}

@Composable
fun NotConfiguredScreen() = Centered {
    AppLogo(56.dp)
    Text("This build isn't set up", style = MaterialTheme.typography.titleLarge)
    Text(
        "It was built without the Firebase config or the server address. Rebuild with app/app/google-services.json and app/tasks.properties.",
        textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

/** Shown when the account can't be loaded. Never signs out by itself. */
@Composable
fun FailedScreen(app: AppController, s: Session.Failed) {
    val scope = rememberCoroutineScope()
    var note by remember { mutableStateOf<String?>(null) }
    val needsVerify = s.status == 403 && s.message.contains("verify your email", ignoreCase = true)
    val blocked = s.status == 403 && !needsVerify
    Centered {
        AppLogo(56.dp)
        Text(
            when {
                needsVerify -> "Verify your email to continue"
                blocked -> s.message
                s.status == 401 -> "Your session could not be confirmed"
                s.status == 0 -> "You're offline"
                else -> "Couldn't load your account"
            },
            style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center,
        )
        Text(
            when {
                needsVerify -> "We sent a link to ${s.user.email}. Open it, then come back here."
                blocked -> "Signed in as ${s.user.email}"
                s.status == 401 -> "Try again, or sign out and sign back in."
                s.status == 0 -> "Connect to the internet and try again."
                else -> s.message
            },
            textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        note?.let { Text(it, color = MaterialTheme.colorScheme.primary, textAlign = TextAlign.Center) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (needsVerify) {
                Button(onClick = {
                    scope.launch {
                        runCatching { app.auth.refreshUser() }.onFailure { note = it.message }
                        app.loadProfile()
                    }
                }) { Text("I've verified") }
                OutlinedButton(onClick = {
                    scope.launch {
                        note = runCatching { app.auth.resendVerification() }.fold({ "Verification email sent to ${s.user.email}" }, { it.message })
                    }
                }) { Text("Resend email") }
            } else if (!blocked) {
                Button(onClick = { app.loadProfile() }) { Text("Try again") }
            }
            TextButton(onClick = { app.signOut() }) { Text(if (blocked) "Use another account" else "Sign out") }
        }
    }
}

package com.skienlabs.tasks.ui.account

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.BrightnessAuto
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.LockReset
import androidx.compose.material.icons.outlined.MarkEmailUnread
import androidx.compose.material.icons.outlined.Verified
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skienlabs.tasks.AppController
import com.skienlabs.tasks.BuildConfig
import com.skienlabs.tasks.data.Profile
import com.skienlabs.tasks.data.ThemePref
import com.skienlabs.tasks.ui.theme.LocalExtra
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun Avatar(profile: Profile, size: androidx.compose.ui.unit.Dp) {
    Box(Modifier.size(size).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
        Text(
            profile.name.trim().take(1).uppercase().ifEmpty { "?" },
            color = MaterialTheme.colorScheme.onPrimary, fontSize = (size.value * 0.45f).sp,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountSheet(app: AppController, profile: Profile, theme: ThemePref, onDismiss: () -> Unit) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var name by rememberSaveable { mutableStateOf(profile.name) }
    var busy by remember { mutableStateOf("") }
    var msg by remember { mutableStateOf<Pair<Boolean, String>?>(null) } // (isError, text)
    val isPassword = profile.provider == "password"
    val x = LocalExtra.current

    fun run(kind: String, block: suspend () -> String?) {
        busy = kind; msg = null
        scope.launch {
            try {
                block()?.let { msg = false to it }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                msg = true to (e.message ?: "Something went wrong")
            } finally {
                busy = ""
            }
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(profile, 56.dp)
                Column(Modifier.padding(start = 16.dp).weight(1f)) {
                    Text(profile.name, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(profile.email ?: "", color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        AssistChip(onClick = {}, label = { Text(if (isPassword) "Email & password" else "Google account") })
                        if (isPassword) {
                            if (profile.emailVerified) AssistChip(onClick = {}, label = { Text("Verified") }, leadingIcon = { Icon(Icons.Outlined.Verified, null, Modifier.size(18.dp), tint = x.done) })
                            else AssistChip(onClick = {}, label = { Text("Not verified") }, leadingIcon = { Icon(Icons.Outlined.MarkEmailUnread, null, Modifier.size(18.dp), tint = x.overdue) })
                        }
                    }
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = name, onValueChange = { name = it.take(60) }, label = { Text("Your name") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words), modifier = Modifier.weight(1f),
                )
                Button(
                    onClick = {
                        run("name") {
                            app.setProfile(app.api.updateMe(name = name.trim()))
                            "Name saved"
                        }
                    },
                    enabled = name.isNotBlank() && name.trim() != profile.name && busy.isEmpty(),
                ) {
                    if (busy == "name") CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary) else Text("Save")
                }
            }

            if (isPassword && !profile.emailVerified) {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(x.overdueBg).padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("Check your inbox for a verification link, so you can recover your account if you forget the password.")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = {
                            run("resend") { app.auth.resendVerification(); "Verification email sent to ${profile.email}" }
                        }, enabled = busy.isEmpty()) { Text("Resend email") }
                        TextButton(onClick = {
                            run("check") {
                                app.auth.refreshUser()
                                val p = app.api.me()
                                app.setProfile(p)
                                if (p.emailVerified) "Email verified" else "Not verified yet. Open the link in the email first."
                            }
                        }, enabled = busy.isEmpty()) { Text("I've verified") }
                    }
                }
            }

            if (isPassword && profile.email != null) {
                OutlinedButton(onClick = {
                    run("reset") { app.auth.resetPassword(profile.email); "Password reset link sent to ${profile.email}" }
                }, enabled = busy.isEmpty()) {
                    Icon(Icons.Outlined.LockReset, null, Modifier.size(18.dp)); Text("  Change password")
                }
            }

            msg?.let { (isError, text) ->
                Text(text, color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Theme", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    val options = listOf(
                        Triple(ThemePref.SYSTEM, "System", Icons.Outlined.BrightnessAuto),
                        Triple(ThemePref.LIGHT, "Light", Icons.Outlined.LightMode),
                        Triple(ThemePref.DARK, "Black", Icons.Outlined.DarkMode),
                    )
                    options.forEachIndexed { i, (t, label, icon) ->
                        SegmentedButton(
                            selected = theme == t, onClick = { scope.launch { app.prefs.setTheme(t) } },
                            shape = SegmentedButtonDefaults.itemShape(i, options.size),
                            icon = { Icon(icon, null, Modifier.size(18.dp)) },
                        ) { Text(label) }
                    }
                }
            }

            HorizontalDivider()
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    if (profile.createdAt > 0) {
                        val since = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.getDefault()).format(Instant.ofEpochMilli(profile.createdAt).atZone(ZoneId.systemDefault()))
                        Text("Member since $since", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text("Tasks ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                TextButton(onClick = { onDismiss(); app.signOut() }) {
                    Icon(Icons.AutoMirrored.Outlined.Logout, null, Modifier.size(18.dp)); Text("  Sign out")
                }
            }
        }
    }
}

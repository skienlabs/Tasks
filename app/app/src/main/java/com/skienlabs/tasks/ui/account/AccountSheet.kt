package com.skienlabs.tasks.ui.account

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import com.skienlabs.tasks.ui.theme.AppTheme
import androidx.compose.ui.graphics.drawscope.clipPath
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skienlabs.tasks.AppController
import com.skienlabs.tasks.BuildConfig
import com.skienlabs.tasks.data.Profile
import com.skienlabs.tasks.data.ThemePref
import com.skienlabs.tasks.notify.DailySummary
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.material.icons.outlined.NotificationsActive
import com.skienlabs.tasks.ui.theme.LocalExtra
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun Avatar(profile: Profile, size: androidx.compose.ui.unit.Dp) {
    // Google photo URLs end in "=s96-c": ask for a sharper one.
    val url = remember(profile.photo) { profile.photo?.takeIf { it.startsWith("https://") }?.replace(Regex("=s\\d+(-c)?$"), "=s256-c") }
    val photo = com.skienlabs.tasks.ui.images.rememberUrlImage(url)
    Box(
        Modifier.size(size).clip(CircleShape).background(MaterialTheme.colorScheme.primary)
            .semantics { contentDescription = "Account: ${profile.name}" },
        contentAlignment = Alignment.Center,
    ) {
        if (photo != null) {
            androidx.compose.foundation.Image(photo, null, Modifier.size(size), contentScale = androidx.compose.ui.layout.ContentScale.Crop)
        } else {
            Text(
                profile.name.trim().take(1).uppercase().ifEmpty { "?" },
                color = MaterialTheme.colorScheme.onPrimary, fontSize = (size.value * 0.45f).sp,
            )
        }
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

            SummarySetting(app)

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Theme", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                    Text(themeLabel(theme), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                ThemeSwatches(theme) { t -> scope.launch { app.prefs.setTheme(t) } }
            }

            HorizontalDivider()
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    if (profile.createdAt > 0) {
                        val since = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.getDefault()).format(Instant.ofEpochMilli(profile.createdAt).atZone(ZoneId.systemDefault()))
                        Text("Member since $since", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text("Tasks ${BuildConfig.VERSION_NAME} · © 2026 Skien Software Lab", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(16.dp)) {
                        com.skienlabs.tasks.ui.common.PrivacyLink()
                        com.skienlabs.tasks.ui.common.PrivacyLink(delete = true)
                    }
                }
                TextButton(onClick = { onDismiss(); app.signOut() }) {
                    Icon(Icons.AutoMirrored.Outlined.Logout, null, Modifier.size(18.dp)); Text("  Sign out")
                }
            }
        }
    }
}

/** End-of-day summary notification: on/off and time. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SummarySetting(app: AppController) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = rememberCoroutineScope()
    val pref by app.prefs.dailySummary.collectAsStateWithLifecycle(com.skienlabs.tasks.data.DailySummaryPref())
    var allowed by remember { mutableStateOf(DailySummary.canNotify(context)) }
    var picking by remember { mutableStateOf(false) }
    // Re-check when coming back from the system settings.
    androidx.lifecycle.compose.LifecycleResumeEffect(Unit) {
        allowed = DailySummary.canNotify(context)
        onPauseOrDispose {}
    }
    fun save(enabled: Boolean, minutes: Int) {
        scope.launch {
            app.prefs.setDailySummary(enabled, minutes)
            DailySummary.schedule(context, enabled, minutes)
        }
    }
    val permission = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission(),
    ) { ok -> allowed = ok || DailySummary.canNotify(context) }

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.NotificationsActive, null, Modifier.size(22.dp), tint = MaterialTheme.colorScheme.primary)
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Text("End-of-day summary", style = MaterialTheme.typography.titleSmall)
                Text("What you finished and what's still open, with high-priority tasks", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            androidx.compose.material3.Switch(
                checked = pref.enabled,
                onCheckedChange = { on ->
                    save(on, pref.minutes)
                    if (on && !allowed && android.os.Build.VERSION.SDK_INT >= 33) permission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                },
            )
        }
        if (pref.enabled) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 34.dp)) {
                Text("Every day at", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = { picking = true }) { Text(timeLabel(context, pref.minutes)) }
            }
            if (!allowed) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 34.dp)) {
                    Text("Notifications are off for Tasks.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, modifier = Modifier.weight(1f))
                    TextButton(onClick = {
                        val intent = android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, context.packageName)
                        runCatching { context.startActivity(intent) }
                    }) { Text("Turn on") }
                }
            }
        }
    }
    if (picking) {
        val state = androidx.compose.material3.rememberTimePickerState(pref.minutes / 60, pref.minutes % 60, android.text.format.DateFormat.is24HourFormat(context))
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { picking = false },
            confirmButton = { TextButton(onClick = { picking = false; save(true, state.hour * 60 + state.minute) }) { Text("OK") } },
            dismissButton = { TextButton(onClick = { picking = false }) { Text("Cancel") } },
            text = { androidx.compose.material3.TimePicker(state) },
        )
    }
}

private fun timeLabel(context: android.content.Context, minutes: Int): String {
    val t = java.time.LocalTime.of(minutes / 60, minutes % 60)
    val pattern = if (android.text.format.DateFormat.is24HourFormat(context)) "HH:mm" else "h:mm a"
    return java.time.format.DateTimeFormatter.ofPattern(pattern, java.util.Locale.getDefault()).format(t)
}

private fun themeLabel(t: ThemePref) = when (t) {
    ThemePref.SYSTEM -> "System"
    ThemePref.LIGHT -> AppTheme.LIGHT.label
    ThemePref.DIM -> AppTheme.DIM.label
    ThemePref.DARK -> AppTheme.MIDNIGHT.label
    ThemePref.ABYSS -> AppTheme.ABYSS.label
}

/** Five little pictures of the app, one per theme; the chosen one is outlined. */
@Composable
fun ThemeSwatches(selected: ThemePref, onSelect: (ThemePref) -> Unit) {
    val options = listOf(
        ThemePref.SYSTEM to null,
        ThemePref.LIGHT to AppTheme.LIGHT,
        ThemePref.DIM to AppTheme.DIM,
        ThemePref.DARK to AppTheme.MIDNIGHT,
        ThemePref.ABYSS to AppTheme.ABYSS,
    )
    Row(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { (pref, look) ->
            val on = pref == selected
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(12.dp))
                    .selectable(on, role = Role.RadioButton) { onSelect(pref) }.padding(2.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier.fillMaxWidth().aspectRatio(0.8f)
                        .border(if (on) 2.dp else 1.dp, if (on) MaterialTheme.colorScheme.primary else LocalExtra.current.outline, RoundedCornerShape(12.dp))
                        .padding(if (on) 3.dp else 1.dp).clip(RoundedCornerShape(10.dp)),
                ) {
                    androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
                        fun look(t: AppTheme) {
                            drawRect(t.background)
                            val pad = size.width * 0.14f
                            drawCircle(t.accent, size.width * 0.07f, androidx.compose.ui.geometry.Offset(pad + size.width * 0.07f, pad + size.width * 0.07f))
                            drawRoundRect(
                                t.card, androidx.compose.ui.geometry.Offset(pad, size.height * 0.36f),
                                androidx.compose.ui.geometry.Size(size.width - pad * 2, size.height * 0.4f),
                                androidx.compose.ui.geometry.CornerRadius(size.width * 0.08f),
                            )
                            val line = if (t.dark) Color.White.copy(alpha = 0.55f) else Color.Black.copy(alpha = 0.45f)
                            drawRoundRect(line, androidx.compose.ui.geometry.Offset(pad * 1.6f, size.height * 0.46f), androidx.compose.ui.geometry.Size(size.width * 0.5f, size.height * 0.05f), androidx.compose.ui.geometry.CornerRadius(4f))
                            drawRoundRect(line.copy(alpha = line.alpha * 0.6f), androidx.compose.ui.geometry.Offset(pad * 1.6f, size.height * 0.58f), androidx.compose.ui.geometry.Size(size.width * 0.34f, size.height * 0.05f), androidx.compose.ui.geometry.CornerRadius(4f))
                        }
                        if (look != null) look(look) else {
                            look(AppTheme.LIGHT)
                            val half = androidx.compose.ui.graphics.Path().apply {
                                moveTo(size.width, 0f); lineTo(size.width, size.height); lineTo(0f, size.height); close()
                            }
                            clipPath(half) { look(AppTheme.MIDNIGHT) }
                        }
                    }
                }
                Text(
                    look?.label ?: "System",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (on) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal,
                    textAlign = TextAlign.Center, maxLines = 2, minLines = 2,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
    }
}

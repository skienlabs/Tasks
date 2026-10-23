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
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.height
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.animation.core.animateFloat
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
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
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().navigationBarsPadding().padding(horizontal = 16.dp).padding(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            val state by app.store.state.collectAsStateWithLifecycle()
            val today by app.today.collectAsStateWithLifecycle()
            val week = remember(state.summary, today) {
                val start = com.skienlabs.tasks.data.Dates.startOfWeek(today)
                (0L until 7L).map { com.skienlabs.tasks.data.Dates.addDays(start, it) }
                    .fold(com.skienlabs.tasks.data.Counts()) { acc, d -> acc.plus(state.summary[d] ?: com.skienlabs.tasks.data.Counts()) }
            }
            ProfileHero(profile, week)

            Section("Profile") {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
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
                        Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 12.dp).clip(RoundedCornerShape(14.dp)).background(x.overdueBg).padding(14.dp),
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
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    SettingRow(Icons.Outlined.LockReset, "Change password", "We'll email you a reset link", enabled = busy.isEmpty()) {
                        run("reset") { app.auth.resetPassword(profile.email); "Password reset link sent to ${profile.email}" }
                    }
                }
                msg?.let { (isError, text) ->
                    Text(
                        text, Modifier.padding(horizontal = 16.dp).padding(bottom = 12.dp),
                        color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }

            Section("Notifications") {
                Box(Modifier.padding(16.dp)) { SummarySetting(app) }
            }

            Section("Appearance", card = false) {
                ThemeDropdown(theme) { t -> scope.launch { app.prefs.setTheme(t) } }
            }

            // Changes made offline and not sent yet would be lost: ask first.
            var confirmSignOut by remember { mutableStateOf(0) }
            if (confirmSignOut > 0) {
                androidx.compose.material3.AlertDialog(
                    onDismissRequest = { confirmSignOut = 0 },
                    title = { Text("Sign out and lose unsynced changes?") },
                    text = {
                        Text(
                            "$confirmSignOut change${if (confirmSignOut == 1) " hasn't" else "s haven't"} reached the server yet " +
                                "(the phone is offline). Signing out now discards ${if (confirmSignOut == 1) "it" else "them"}.",
                        )
                    },
                    confirmButton = {
                        TextButton(onClick = { confirmSignOut = 0; onDismiss(); app.signOut() }) {
                            Text("Sign out anyway", color = MaterialTheme.colorScheme.error)
                        }
                    },
                    dismissButton = { TextButton(onClick = { confirmSignOut = 0 }) { Text("Stay signed in") } },
                )
            }
            OutlinedButton(
                onClick = {
                    val waiting = app.store.pendingChanges
                    if (waiting > 0) confirmSignOut = waiting else { onDismiss(); app.signOut() }
                },
                modifier = Modifier.fillMaxWidth().height(52.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.5f)),
                colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
            ) {
                Icon(Icons.AutoMirrored.Outlined.Logout, null, Modifier.size(18.dp)); Text("  Sign out")
            }

            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    com.skienlabs.tasks.ui.common.PrivacyLink()
                    com.skienlabs.tasks.ui.common.PrivacyLink(delete = true)
                }
                Text(
                    "Tasks ${BuildConfig.VERSION_NAME} · © 2026 Skien Software Lab",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/**
 * The card at the top: a soft wash of the theme's gradient with light orbs, the avatar in a
 * glowing ring, name, email, how they sign in, and this week at a glance.
 */
@Composable
internal fun ProfileHero(profile: Profile, week: com.skienlabs.tasks.data.Counts) {
    val x = LocalExtra.current
    val isPassword = profile.provider == "password"
    val since = if (profile.createdAt > 0) {
        DateTimeFormatter.ofPattern("MMM yyyy", Locale.getDefault()).format(Instant.ofEpochMilli(profile.createdAt).atZone(ZoneId.systemDefault()))
    } else null
    val shape = RoundedCornerShape(28.dp)
    val ring = androidx.compose.animation.core.rememberInfiniteTransition(label = "ring").animateFloat(
        0f, 360f, androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween(12_000, easing = androidx.compose.animation.core.LinearEasing)), label = "spin",
    )
    Box(
        Modifier.fillMaxWidth().clip(shape)
            .background(androidx.compose.ui.graphics.Brush.linearGradient(x.gradient.map { it.copy(alpha = if (x.dark) 0.22f else 0.16f) }))
            .border(1.dp, androidx.compose.ui.graphics.Brush.linearGradient(listOf(x.gradient.first().copy(alpha = 0.5f), Color.Transparent, x.gradient.last().copy(alpha = 0.4f))), shape)
            .drawBehind {
                // Two soft orbs of light, for depth.
                drawCircle(androidx.compose.ui.graphics.Brush.radialGradient(listOf(x.gradient[1].copy(alpha = 0.35f), Color.Transparent), androidx.compose.ui.geometry.Offset(size.width * 0.92f, 0f), size.width * 0.45f), size.width * 0.45f, androidx.compose.ui.geometry.Offset(size.width * 0.92f, 0f))
                drawCircle(androidx.compose.ui.graphics.Brush.radialGradient(listOf(x.gradient[0].copy(alpha = 0.3f), Color.Transparent), androidx.compose.ui.geometry.Offset(0f, size.height), size.width * 0.5f), size.width * 0.5f, androidx.compose.ui.geometry.Offset(0f, size.height))
            }
            .padding(vertical = 22.dp, horizontal = 16.dp),
    ) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                Modifier.size(96.dp).drawBehind {
                    rotate(ring.value) {
                        drawCircle(androidx.compose.ui.graphics.Brush.sweepGradient(x.gradient + x.gradient.first()), style = androidx.compose.ui.graphics.drawscope.Stroke(3.dp.toPx()))
                    }
                },
                contentAlignment = Alignment.Center,
            ) { Avatar(profile, 82.dp) }
            Text(
                profile.name, Modifier.padding(top = 12.dp),
                style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Medium,
                maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
            )
            Text(profile.email ?: "", color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            FlowRow(
                Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                HeroChip(if (isPassword) "Email & password" else "Google account", null)
                if (isPassword) {
                    if (profile.emailVerified) HeroChip("Verified", x.done, Icons.Outlined.Verified)
                    else HeroChip("Not verified", x.overdue, Icons.Outlined.MarkEmailUnread)
                }
                if (since != null) HeroChip("Since $since", null)
            }
            Row(
                Modifier.padding(top = 16.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(if (x.dark) Color.White.copy(alpha = 0.06f) else Color.White.copy(alpha = 0.55f))
                    .padding(vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                HeroStat("${week.done}", "done this week", x.done)
                HeroStat("${week.pending}", "still open", x.pending)
                HeroStat(if (week.active > 0) "${Math.round(week.done * 100f / week.active)}%" else "–", "complete", x.rate)
            }
        }
    }
}

@Composable
private fun HeroChip(text: String, color: Color?, icon: androidx.compose.ui.graphics.vector.ImageVector? = null) {
    val x = LocalExtra.current
    val c = color ?: MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        Modifier.clip(RoundedCornerShape(50))
            .background(if (color != null) color.copy(alpha = 0.14f) else if (x.dark) Color.White.copy(alpha = 0.08f) else Color.White.copy(alpha = 0.6f))
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) Icon(icon, null, Modifier.size(14.dp).padding(end = 2.dp), tint = c)
        Text(text, style = MaterialTheme.typography.labelMedium, color = c, maxLines = 1)
    }
}

@Composable
private fun HeroStat(value: String, label: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Medium, color = color)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** A titled group of settings; [card] wraps it in a rounded panel. */
@Composable
internal fun Section(title: String, card: Boolean = true, content: @Composable () -> Unit) {
    val x = LocalExtra.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            title.uppercase(), Modifier.padding(start = 6.dp),
            style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, letterSpacing = 0.6.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (!card) content()
        else Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(x.surfaceHigh)
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(20.dp)),
        ) { content() }
    }
}

@Composable
internal fun SettingRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, sub: String, enabled: Boolean = true, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(enabled = enabled, onClick = onClick).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, Modifier.size(22.dp), tint = MaterialTheme.colorScheme.primary)
        Column(Modifier.weight(1f).padding(start = 14.dp)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
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
    ThemePref.GRAY -> AppTheme.GRAY.label
    ThemePref.DIM -> AppTheme.DIM.label
    ThemePref.DARK -> AppTheme.MIDNIGHT.label
    ThemePref.ABYSS -> AppTheme.ABYSS.label
    ThemePref.MONO -> AppTheme.MONO.label
    ThemePref.MONO_LIGHT -> AppTheme.MONO_LIGHT.label
    ThemePref.GLASS_LIGHT -> AppTheme.GLASS_LIGHT.label
}

/** Five little pictures of the app, one per theme; the chosen one is outlined. */
@Composable
fun ThemeSwatches(selected: ThemePref, onSelect: (ThemePref) -> Unit) {
    val options = listOf(
        ThemePref.SYSTEM to null,
        ThemePref.LIGHT to AppTheme.LIGHT,
        ThemePref.GRAY to AppTheme.GRAY,
        ThemePref.DIM to AppTheme.DIM,
        ThemePref.DARK to AppTheme.MIDNIGHT,
        ThemePref.ABYSS to AppTheme.ABYSS,
        ThemePref.MONO to AppTheme.MONO,
        ThemePref.MONO_LIGHT to AppTheme.MONO_LIGHT,
        ThemePref.GLASS_LIGHT to AppTheme.GLASS_LIGHT,
    )
    // Three per row: nine themes in three rows on a phone.
    Column(Modifier.fillMaxWidth().selectableGroup(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
      options.chunked(3).forEach { rowItems ->
      Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        rowItems.forEach { (pref, look) ->
            val on = pref == selected
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(12.dp))
                    .selectable(on, role = Role.RadioButton) { onSelect(pref) }.padding(2.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier.fillMaxWidth().aspectRatio(1.35f)
                        .border(if (on) 2.dp else 1.dp, if (on) MaterialTheme.colorScheme.primary else LocalExtra.current.outline, RoundedCornerShape(12.dp))
                        .padding(if (on) 3.dp else 1.dp).clip(RoundedCornerShape(10.dp)),
                ) {
                    androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
                        fun look(t: AppTheme) {
                            drawRect(t.background)
                            // Glass: coloured light behind a see-through card.
                            val lights = when (t) {
                                AppTheme.GLASS_LIGHT -> listOf(Color(0xFF8FB3FF), Color(0xFFFFB3D9), Color(0xFF9FF0D8))
                                else -> emptyList()
                            }
                            lights.forEachIndexed { i, c ->
                                val o = androidx.compose.ui.geometry.Offset(size.width * listOf(0.15f, 0.9f, 0.4f)[i], size.height * listOf(0.1f, 0.45f, 1f)[i])
                                drawCircle(androidx.compose.ui.graphics.Brush.radialGradient(listOf(c.copy(alpha = if (t.dark) 0.8f else 0.9f), Color.Transparent), o, size.width * 0.6f), size.width * 0.6f, o)
                            }
                            val pad = size.width * 0.14f
                            drawCircle(t.accent, size.width * 0.07f, androidx.compose.ui.geometry.Offset(pad + size.width * 0.07f, pad + size.width * 0.07f))
                            drawRoundRect(
                                t.card, androidx.compose.ui.geometry.Offset(pad, size.height * 0.36f),
                                androidx.compose.ui.geometry.Size(size.width - pad * 2, size.height * 0.4f),
                                androidx.compose.ui.geometry.CornerRadius(size.width * 0.08f),
                            )
                            if (t.glass) drawRoundRect(
                                Color.White.copy(alpha = if (t.dark) 0.35f else 0.9f), androidx.compose.ui.geometry.Offset(pad, size.height * 0.36f),
                                androidx.compose.ui.geometry.Size(size.width - pad * 2, size.height * 0.4f),
                                androidx.compose.ui.geometry.CornerRadius(size.width * 0.08f),
                                style = androidx.compose.ui.graphics.drawscope.Stroke(1.dp.toPx()),
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
                    look?.shortLabel ?: "System",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (on) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal,
                    textAlign = TextAlign.Center, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 6.dp, bottom = 4.dp),
                )
            }
        }
      }
      }
    }
}

/** "Theme · Abyss ⌄": folded away until tapped, then the theme cards. */
@Composable
fun ThemeDropdown(selected: ThemePref, startOpen: Boolean = false, onSelect: (ThemePref) -> Unit) {
    var open by rememberSaveable { mutableStateOf(startOpen) }
    val rotation by androidx.compose.animation.core.animateFloatAsState(if (open) 180f else 0f, label = "theme-chevron")
    val x = LocalExtra.current
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(x.surfaceHigh)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp)),
    ) {
        Row(
            Modifier.fillMaxWidth().clickable(onClickLabel = if (open) "Hide themes" else "Show themes") { open = !open }
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(androidx.compose.material.icons.Icons.Outlined.Palette, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("Theme", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(start = 14.dp).weight(1f))
            Text(themeLabel(selected), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Icon(
                androidx.compose.material.icons.Icons.Filled.ExpandMore, null,
                Modifier.padding(start = 6.dp).size(22.dp).graphicsLayer { rotationZ = rotation },
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        androidx.compose.animation.AnimatedVisibility(open) {
            Box(Modifier.padding(start = 12.dp, end = 12.dp, bottom = 14.dp)) { ThemeSwatches(selected, onSelect) }
        }
    }
}

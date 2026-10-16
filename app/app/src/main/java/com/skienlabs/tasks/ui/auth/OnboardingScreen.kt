package com.skienlabs.tasks.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skienlabs.tasks.AppController
import com.skienlabs.tasks.data.Profile
import com.skienlabs.tasks.ui.common.AppLogo
import com.skienlabs.tasks.ui.common.VSpace
import com.skienlabs.tasks.ui.common.gradientBrush
import com.skienlabs.tasks.ui.common.tagColor
import com.skienlabs.tasks.ui.theme.LocalExtra
import com.skienlabs.tasks.ui.theme.Palette
import kotlinx.coroutines.launch

private data class Company(val name: String, val color: String)
private val START_COLORS = listOf("blue", "green", "purple", "orange", "pink", "teal")

/** First run after creating an account: confirm the name, add companies as tags. */
@Composable
fun OnboardingScreen(app: AppController, profile: Profile) {
    val scope = rememberCoroutineScope()
    var name by rememberSaveable {
        mutableStateOf((if (profile.provider == "password") app.auth.suggestedName() else "").ifBlank { profile.name })
    }
    val companies = remember { mutableStateListOf(Company("", "blue"), Company("", "green")) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val keys = Palette.tags.keys.toList()

    fun finish(withCompanies: Boolean) {
        if (name.isBlank()) {
            error = "Please enter your name"; return
        }
        busy = true; error = null
        scope.launch {
            try {
                if (withCompanies) {
                    runCatching { app.store.loadTags() } // skip any created by an earlier attempt
                    val seen = app.store.state.value.tags.map { it.name.lowercase() }.toMutableSet()
                    for (c in companies) {
                        val n = c.name.replace(Regex("\\s+"), " ").trim()
                        if (n.isEmpty() || !seen.add(n.lowercase())) continue
                        app.store.saveTag(null, n, c.color, null, logoChanged = false)
                    }
                }
                app.setProfile(app.api.updateMe(name = name.trim(), onboarded = true))
            } catch (e: Exception) {
                error = e.message ?: "Something went wrong. Please try again."
                busy = false
            }
        }
    }

    val first = name.trim().substringBefore(' ')
    Box(Modifier.fillMaxSize().safeDrawingPadding().imePadding(), contentAlignment = Alignment.Center) {
        Column(
            Modifier.widthIn(max = 520.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                AppLogo(56.dp)
                VSpace(16.dp)
                Text(
                    if (first.isNotEmpty()) "Welcome, $first!" else "Welcome!",
                    style = MaterialTheme.typography.headlineMedium.copy(brush = gradientBrush(LocalExtra.current.gradient)),
                    textAlign = TextAlign.Center,
                )
                Text("Let's set up your Tasks. It takes a few seconds.", color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            }
            OutlinedTextField(
                value = name, onValueChange = { name = it.take(60) }, label = { Text("What should we call you?") }, singleLine = true,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
                modifier = Modifier.fillMaxWidth(),
            )
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Companies or projects you work for", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Optional. Each becomes a tag you can put on tasks. You can add logos later under Tags.",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                companies.forEachIndexed { i, c ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        val color = tagColor(c.color)
                        Box(
                            Modifier.size(44.dp).clip(CircleShape).background(color)
                                .clickable { companies[i] = c.copy(color = keys[(keys.indexOf(c.color) + 1) % keys.size]) }
                                .semantics { contentDescription = "Change color for company ${i + 1}" },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(c.name.trim().take(1).uppercase().ifEmpty { "?" }, color = if (LocalExtra.current.dark) Color.Black else Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                        }
                        OutlinedTextField(
                            value = c.name, onValueChange = { companies[i] = c.copy(name = it.take(40)) },
                            placeholder = { Text(if (i == 0) "e.g. Skien Labs" else if (i == 1) "e.g. ZupNex" else "Company name") },
                            singleLine = true, modifier = Modifier.weight(1f),
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
                        )
                        if (companies.size > 1) IconButton(onClick = { companies.removeAt(i) }) { Icon(Icons.Filled.Close, "Remove company ${i + 1}") }
                    }
                }
                if (companies.size < 6) {
                    TextButton(onClick = { companies.add(Company("", START_COLORS[companies.size % START_COLORS.size])) }) {
                        Icon(Icons.Filled.Add, null); Text(" Add another")
                    }
                }
            }
            error?.let { Notice(it, error = true) }
            Button(onClick = { finish(true) }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                else Text("Get started", style = MaterialTheme.typography.titleSmall)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = { app.signOut() }, enabled = !busy) { Text("Sign out", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                TextButton(onClick = { finish(false) }, enabled = !busy) { Text("Skip companies") }
            }
        }
    }
}

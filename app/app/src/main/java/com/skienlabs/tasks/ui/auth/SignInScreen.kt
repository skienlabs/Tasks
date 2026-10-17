package com.skienlabs.tasks.ui.auth

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.skienlabs.tasks.auth.Auth
import com.skienlabs.tasks.ui.common.AppLogo
import com.skienlabs.tasks.ui.common.VSpace
import com.skienlabs.tasks.ui.theme.LocalExtra
import kotlinx.coroutines.launch

private enum class Mode { SIGN_IN, SIGN_UP, RESET }

private val EMAIL = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

@Composable
fun SignInScreen(auth: Auth) {
    val activity = LocalActivity.current
    val scope = rememberCoroutineScope()
    var mode by rememberSaveable { mutableStateOf(Mode.SIGN_IN) }
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") } // never saved to disk
    var showPassword by rememberSaveable { mutableStateOf(false) }
    var touched by rememberSaveable { mutableStateOf(false) }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var info by rememberSaveable { mutableStateOf<String?>(null) }
    var busy by rememberSaveable { mutableStateOf("") } // "", "google", "email"
    var attempt by rememberSaveable { mutableIntStateOf(0) }

    val emailOk = EMAIL.matches(email.trim())
    val passOk = if (mode == Mode.SIGN_UP) password.length >= 8 else password.isNotEmpty()
    val nameOk = name.isNotBlank()

    fun switchTo(m: Mode) {
        mode = m; touched = false; error = null; info = null
    }

    fun run(kind: String, block: suspend () -> Unit) {
        val mine = ++attempt // only the newest attempt updates the screen
        error = null
        busy = kind
        scope.launch {
            try {
                block()
            } catch (e: Exception) {
                if (mine == attempt) error = e.message ?: "Something went wrong. Please try again."
            } finally {
                if (mine == attempt) busy = ""
            }
        }
    }

    fun submit() {
        touched = true
        when (mode) {
            Mode.RESET -> if (emailOk) run("email") {
                auth.resetPassword(email)
                info = "If an account exists for ${email.trim()}, a reset link is on its way. Check your inbox and spam folder."
            }
            Mode.SIGN_UP -> if (emailOk && passOk && nameOk) run("email") { auth.signUpWithEmail(name, email, password) }
            Mode.SIGN_IN -> if (emailOk && passOk) run("email") { auth.signInWithEmail(email, password) }
        }
    }

    com.skienlabs.tasks.ui.intro.DarkBars()
    Column(
        Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        com.skienlabs.tasks.ui.intro.SignInArt()
        Column(
            Modifier.widthIn(max = 460.dp).fillMaxWidth().navigationBarsPadding().padding(horizontal = 24.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.Start,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (mode == Mode.RESET) {
                    IconButton(onClick = { switchTo(Mode.SIGN_IN) }, modifier = Modifier.padding(end = 4.dp)) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back to sign in")
                    }
                }
                Text(
                    when (mode) { Mode.SIGN_IN -> "Welcome back"; Mode.SIGN_UP -> "Create your account"; Mode.RESET -> "Reset password" },
                    style = MaterialTheme.typography.headlineMedium,
                )
            }
            Text(
                when (mode) {
                    Mode.SIGN_IN -> "Sign in to your tasks"
                    Mode.SIGN_UP -> "It takes a minute. Or continue with Google."
                    Mode.RESET -> "We’ll email you a link to choose a new one"
                },
                style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            VSpace(24.dp)

            if (mode != Mode.RESET) {
                OutlinedButton(
                    onClick = { activity?.let { a -> run("google") { auth.signInWithGoogle(a) } } },
                    enabled = busy != "email",
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    border = BorderStroke(1.dp, LocalExtra.current.outline),
                ) {
                    if (busy == "google") CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else GoogleG()
                    Text("  Continue with Google", color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.titleSmall)
                }
                Row(Modifier.padding(vertical = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                    HorizontalDivider(Modifier.weight(1f))
                    Text("  or  ", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                    HorizontalDivider(Modifier.weight(1f))
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (mode == Mode.SIGN_UP) {
                    OutlinedTextField(
                        value = name, onValueChange = { name = it.take(60) }, label = { Text("Your name") }, singleLine = true,
                        isError = touched && !nameOk, supportingText = if (touched && !nameOk) ({ Text("Enter your name") }) else null,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next, keyboardType = KeyboardType.Text),
                        modifier = Modifier.fillMaxWidth().semantics { contentType = ContentType.PersonFullName },
                    )
                }
                OutlinedTextField(
                    value = email, onValueChange = { email = it.take(320) }, label = { Text("Email") }, singleLine = true,
                    isError = touched && !emailOk, supportingText = if (touched && !emailOk) ({ Text("Enter a valid email") }) else null,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, autoCorrectEnabled = false, imeAction = if (mode == Mode.RESET) ImeAction.Done else ImeAction.Next),
                    keyboardActions = KeyboardActions(onDone = { submit() }),
                    modifier = Modifier.fillMaxWidth().semantics { contentType = if (mode == Mode.SIGN_UP) ContentType.NewUsername else ContentType.Username + ContentType.EmailAddress },
                )
                if (mode != Mode.RESET) {
                    OutlinedTextField(
                        value = password, onValueChange = { password = it.take(4096) }, label = { Text("Password") }, singleLine = true,
                        isError = touched && !passOk,
                        supportingText = when {
                            mode == Mode.SIGN_UP -> ({ Text("At least 8 characters") })
                            touched && !passOk -> ({ Text("Enter your password") })
                            else -> null
                        },
                        visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { showPassword = !showPassword }) {
                                Icon(if (showPassword) Icons.Filled.VisibilityOff else Icons.Filled.Visibility, if (showPassword) "Hide password" else "Show password")
                            }
                        },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrectEnabled = false, imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { submit() }),
                        modifier = Modifier.fillMaxWidth().semantics { contentType = if (mode == Mode.SIGN_UP) ContentType.NewPassword else ContentType.Password },
                    )
                }
            }
            if (mode == Mode.SIGN_IN) {
                Box(Modifier.fillMaxWidth()) {
                    TextButton(onClick = { switchTo(Mode.RESET) }) { Text("Forgot password?") }
                }
            }
            info?.let { Notice(it, error = false) }
            error?.let { Notice(it, error = true) }
            VSpace(12.dp)
            Button(onClick = ::submit, enabled = busy != "email", modifier = Modifier.fillMaxWidth().height(52.dp)) {
                if (busy == "email") CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                else Text(when (mode) { Mode.SIGN_UP -> "Create account"; Mode.RESET -> "Send reset link"; Mode.SIGN_IN -> "Sign in" }, style = MaterialTheme.typography.titleSmall)
            }
            if (mode != Mode.RESET) {
                VSpace(20.dp)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (mode == Mode.SIGN_IN) "New to Tasks?" else "Already have an account?", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    TextButton(onClick = { switchTo(if (mode == Mode.SIGN_IN) Mode.SIGN_UP else Mode.SIGN_IN) }) {
                        Text(if (mode == Mode.SIGN_IN) "Create an account" else "Sign in")
                    }
                }
            }
            com.skienlabs.tasks.ui.common.PrivacyLink(Modifier.padding(top = 12.dp))
        }
    }
}

@Composable
fun Notice(text: String, error: Boolean) {
    val x = LocalExtra.current
    val c = if (error) MaterialTheme.colorScheme.error else x.done
    Surface(color = c.copy(alpha = if (x.dark) 0.14f else 0.1f), shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
        Text(text, color = if (error) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface, modifier = Modifier.padding(14.dp), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun GoogleG() {
    // The standard multicolor "G", drawn as four arcs.
    Canvas(Modifier.size(18.dp)) {
        val stroke = size.width * 0.2f
        val inset = stroke / 2
        val arcSize = Size(size.width - stroke, size.height - stroke)
        val tl = Offset(inset, inset)
        val st = androidx.compose.ui.graphics.drawscope.Stroke(width = stroke)
        drawArc(Color(0xFFEA4335), -150f, 105f, false, tl, arcSize, style = st)
        drawArc(Color(0xFFFBBC05), 150f, 60f, false, tl, arcSize, style = st)
        drawArc(Color(0xFF34A853), 45f, 105f, false, tl, arcSize, style = st)
        drawArc(Color(0xFF4285F4), -45f, 90f, false, tl, arcSize, style = st)
        drawRect(Color(0xFF4285F4), Offset(size.width / 2, size.height / 2 - stroke / 2), Size(size.width / 2 - inset / 2, stroke))
    }
}

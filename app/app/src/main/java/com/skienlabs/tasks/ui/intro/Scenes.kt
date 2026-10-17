package com.skienlabs.tasks.ui.intro

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skienlabs.tasks.ui.common.AppLogo
import com.skienlabs.tasks.ui.theme.GoogleSans
import kotlin.math.cos
import kotlin.math.sin

// The welcome look: ink-blue "night desk" with the app's bright accents. Same scenes as the web sign-in page.
val Ink = Color(0xFF0A1430)
val Paper = Color(0xFFEAF0FF)
val Muted = Color(0xFF9FB0D9)
object Accent {
    val blue = Color(0xFF4C8DF6)
    val red = Color(0xFFF2675A)
    val yellow = Color(0xFFFBBC04)
    val green = Color(0xFF34C27A)
    val violet = Color(0xFFA868FF)
    val teal = Color(0xFF2BC4C4)
    val orange = Color(0xFFFF9A3C)
}

data class Scene(val title: String, val text: String, val accent: Color)

val SCENES = listOf(
    Scene("Your day, one list", "Add what has to happen today. Tick it off, push it to tomorrow, or cancel it.", Accent.blue),
    Scene("Big jobs, small steps", "Break a task into nested steps. It completes itself when the last one is done.", Accent.violet),
    Scene("One colour per company", "Tag tasks by company or project, with its logo, and filter the day by it.", Accent.orange),
    Scene("Laptop and phone, in sync", "A change on one shows up on the other within a second.", Accent.green),
    Scene("A nudge before the day ends", "At 9 PM you get what's still open, high priority first. Add a widget for a glance any time.", Accent.yellow),
)

/** True when the system turned animations off (accessibility). */
@Composable
fun reducedMotion(): Boolean {
    val ctx = LocalContext.current
    return remember { Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
}

/** Seconds since the scene started (0 → [length]); restarts whenever [key] changes while [active]. */
@Composable
private fun timeline(active: Boolean, key: Any, length: Float = 3.2f): Float {
    val reduced = reducedMotion()
    val t = remember(key) { Animatable(if (reduced) length else 0f) }
    LaunchedEffect(active, key) {
        if (reduced) return@LaunchedEffect
        if (active) {
            t.snapTo(0f)
            t.animateTo(length, tween((length * 1000).toInt(), easing = LinearEasing))
        }
    }
    return t.value
}

/** 0→1 progress of a window starting at [start] s lasting [dur] s, with a slight overshoot ease. */
private fun win(t: Float, start: Float, dur: Float = 0.35f): Float = ((t - start) / dur).coerceIn(0f, 1f)
private fun pop(p: Float): Float = if (p <= 0f) 0f else if (p >= 1f) 1f else {
    val c = 1.70158f * 1.4f
    1 + (c + 1) * (p - 1).let { it * it * it } + c * (p - 1).let { it * it }
}

private val CardShape = RoundedCornerShape(18.dp)
private fun Modifier.card() = this.clip(CardShape).background(Color.White.copy(alpha = 0.06f)).border(1.dp, Color.White.copy(alpha = 0.12f), CardShape)

@Composable
private fun CheckDot(color: Color, p: Float, size: Dp = 20.dp, open: Boolean = false) {
    Canvas(Modifier.size(size)) {
        val r = this.size.minDimension / 2
        drawCircle(color, r - 1.dp.toPx(), style = Stroke(2.dp.toPx()))
        if (!open && p > 0f) {
            val s = pop(p)
            drawCircle(color, r * s)
            if (p > 0.4f) {
                val a = ((p - 0.4f) / 0.6f).coerceIn(0f, 1f)
                val path = androidx.compose.ui.graphics.Path().apply {
                    moveTo(r * 0.55f, r * 1.05f); lineTo(r * 0.88f, r * 1.38f); lineTo(r * 1.5f, r * 0.72f)
                }
                drawPath(path, Ink.copy(alpha = a), style = Stroke(2.4.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
        }
    }
}

@Composable
private fun TaskLine(label: String, color: Color, t: Float, at: Float?, fontSize: Int = 15) {
    val p = if (at == null) 0f else win(t, at)
    val strike = if (at == null) 0f else win(t, at + 0.1f)
    Row(Modifier.height(44.dp).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        CheckDot(color, p, open = at == null)
        Box(Modifier.padding(start = 12.dp)) {
            Text(
                label, color = lerp(Paper, Muted, strike), fontSize = fontSize.sp, fontFamily = GoogleSans, maxLines = 1,
                modifier = Modifier.drawBehind {
                    if (strike > 0f) drawLine(Muted, Offset(0f, size.height * 0.54f), Offset(size.width * strike, size.height * 0.54f), 1.5.dp.toPx())
                },
            )
        }
    }
}

private fun lerp(a: Color, b: Color, f: Float) = Color(
    a.red + (b.red - a.red) * f, a.green + (b.green - a.green) * f, a.blue + (b.blue - a.blue) * f, a.alpha + (b.alpha - a.alpha) * f,
)

@Composable
fun DayScene(active: Boolean, key: Any) {
    val t = timeline(active, key)
    Box(Modifier.size(320.dp, 270.dp)) {
        Column(Modifier.offset(0.dp, 34.dp).width(236.dp).card().padding(vertical = 6.dp)) {
            TaskLine("Stand-up notes", Accent.blue, t, 0.5f)
            TaskLine("Send the invoice", Accent.red, t, 1.2f)
            TaskLine("Review pull request", Accent.yellow, t, 1.9f)
            TaskLine("Call the bank", Accent.blue, t, null)
        }
        // Progress ring, filling to 3 of 4.
        val ring = win(t, 0.3f, 2.2f).let { 1 - (1 - it) * (1 - it) * (1 - it) } * 0.75f
        Box(Modifier.offset(206.dp, 0.dp).size(104.dp), contentAlignment = Alignment.Center) {
            Canvas(Modifier.size(104.dp)) {
                val w = 9.dp.toPx()
                drawArc(Color.White.copy(alpha = 0.12f), 0f, 360f, false, Offset(w / 2, w / 2), Size(size.width - w, size.height - w), style = Stroke(w))
                drawArc(Accent.green, -90f, 360f * ring, false, Offset(w / 2, w / 2), Size(size.width - w, size.height - w), style = Stroke(w, cap = StrokeCap.Round))
            }
            Text("${listOf(0.5f, 1.2f, 1.9f).count { t >= it + 0.2f }}/4", color = Paper, fontSize = 20.sp, fontWeight = FontWeight.Medium, fontFamily = GoogleSans)
        }
    }
}

@Composable
fun StepsScene(active: Boolean, key: Any) {
    val t = timeline(active, key)
    data class R(val label: String, val depth: Int, val color: Color, val at: Float)
    val rows = listOf(
        R("Mail server", 0, Accent.green, 2.4f),
        R("Set up the server", 1, Accent.blue, 0.6f),
        R("Open ports", 1, Accent.violet, 1.9f),
        R("25 and 587", 2, Accent.blue, 1.2f),
        R("993 for IMAP", 2, Accent.blue, 1.8f),
    )
    Box(Modifier.size(320.dp, 290.dp)) {
        Column(Modifier.offset(8.dp, 10.dp).width(296.dp).card().padding(top = 8.dp, bottom = 14.dp)) {
            Box {
                // Thread lines (Reddit-style).
                Canvas(Modifier.size(296.dp, 220.dp)) {
                    val c = Color.White.copy(alpha = 0.18f)
                    drawLine(c, Offset(24.dp.toPx(), 44.dp.toPx()), Offset(24.dp.toPx(), 220.dp.toPx()), 2.dp.toPx(), cap = StrokeCap.Round)
                    drawLine(c, Offset(48.dp.toPx(), 132.dp.toPx()), Offset(48.dp.toPx(), 220.dp.toPx()), 2.dp.toPx(), cap = StrokeCap.Round)
                }
                Column {
                    rows.forEach { r ->
                        Row(Modifier.height(44.dp).padding(start = (14 + r.depth * 24).dp), verticalAlignment = Alignment.CenterVertically) {
                            CheckDot(r.color, win(t, r.at))
                            Text(
                                r.label, color = Paper, fontSize = 15.sp, fontFamily = GoogleSans,
                                fontWeight = if (r.depth == 0) FontWeight.Medium else FontWeight.Normal, modifier = Modifier.padding(start = 12.dp),
                            )
                        }
                    }
                }
            }
            val done = listOf(0.6f, 1.2f, 1.8f).count { t >= it + 0.2f }
            Row(Modifier.padding(start = 14.dp, end = 14.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f).height(6.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.12f))) {
                    val f by animateFloatAsState(done / 3f, tween(250), label = "steps")
                    Box(Modifier.fillMaxFraction(f).height(6.dp).clip(CircleShape).background(Accent.green))
                }
                Text("  $done/3 steps", color = Muted, fontSize = 13.sp, fontFamily = GoogleSans)
            }
        }
    }
}

private fun Modifier.fillMaxFraction(f: Float) = this.fillMaxWidth(f.coerceIn(0f, 1f))

@Composable
private fun Chip(label: String, color: Color, small: Boolean = false) {
    Row(
        Modifier.clip(CircleShape).background(color.copy(alpha = 0.18f)).height(if (small) 22.dp else 28.dp).padding(start = 4.dp, end = if (small) 9.dp else 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(if (small) 15.dp else 19.dp).clip(CircleShape).background(color), contentAlignment = Alignment.Center) {
            Text(label.take(1), color = Ink, fontSize = if (small) 9.sp else 11.sp, fontWeight = FontWeight.Bold, fontFamily = GoogleSans)
        }
        Text("  $label", color = color, fontSize = if (small) 12.sp else 13.sp, fontWeight = FontWeight.Medium, fontFamily = GoogleSans)
    }
}

@Composable
fun TagsScene(active: Boolean, key: Any) {
    val t = timeline(active, key)
    val rows = listOf(Triple("Quarterly report", "Skien Labs", Accent.blue), Triple("Client demo", "Softop", Accent.orange), Triple("Book flights", "Personal", Accent.teal))
    val at = listOf(0.4f, 1.0f, 1.6f)
    Box(Modifier.size(320.dp, 270.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            rows.forEachIndexed { i, r ->
                val p = win(t, at[i] - 0.3f, 0.4f)
                Box(Modifier.graphicsLayer { alpha = p; translationY = (1 - p) * 12f }) { Chip(r.second, r.third) }
            }
        }
        Column(Modifier.offset(0.dp, 48.dp).width(312.dp).card().padding(vertical = 4.dp)) {
            rows.forEachIndexed { i, r ->
                val stripe = win(t, at[i] + 0.35f, 0.3f)
                val drop = pop(win(t, at[i], 0.5f))
                Box(Modifier.padding(vertical = 6.dp).drawBehind {
                    if (stripe > 0f) {
                        val h = size.height - 16.dp.toPx()
                        drawRoundRect(r.third, Offset(0f, 8.dp.toPx() + h * (1 - stripe) / 2), Size(4.dp.toPx(), h * stripe), androidx.compose.ui.geometry.CornerRadius(2.dp.toPx()))
                    }
                }) {
                    Column {
                        Row(Modifier.height(30.dp).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                            CheckDot(Muted, 0f, open = true)
                            Text(r.first, color = Paper, fontSize = 15.sp, fontFamily = GoogleSans, modifier = Modifier.padding(start = 12.dp))
                        }
                        Box(Modifier.padding(start = 46.dp).graphicsLayer { alpha = win(t, at[i], 0.2f); translationY = (1 - drop) * -40f; scaleX = 0.9f + 0.1f * drop; scaleY = 0.9f + 0.1f * drop }) {
                            Chip(r.second, r.third, small = true)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SyncScene(active: Boolean, key: Any) {
    val t = timeline(active, key)
    Box(Modifier.size(320.dp, 250.dp)) {
        // Laptop
        Column(Modifier.offset(0.dp, 64.dp).size(184.dp, 120.dp).border(2.dp, Muted, RoundedCornerShape(12.dp)).padding(12.dp)) {
            Row(Modifier.graphicsLayer { alpha = win(t, 0.3f, 0.4f); translationY = (1 - win(t, 0.3f, 0.4f)) * 10f }, verticalAlignment = Alignment.CenterVertically) {
                CheckDot(Accent.red, 0f, 14.dp, open = true)
                Text("  Pay electricity bill", color = Paper, fontSize = 13.sp, fontFamily = GoogleSans)
            }
            Box(Modifier.padding(top = 12.dp).width(120.dp).height(8.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.1f)))
            Box(Modifier.padding(top = 10.dp).width(84.dp).height(8.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.1f)))
        }
        Box(Modifier.offset((-12).dp, 186.dp).size(208.dp, 10.dp).clip(RoundedCornerShape(bottomStart = 10.dp, bottomEnd = 10.dp)).background(Muted.copy(alpha = 0.6f)))
        // Phone
        Column(Modifier.offset(226.dp, 34.dp).size(92.dp, 176.dp).border(2.dp, Muted, RoundedCornerShape(18.dp)).padding(horizontal = 8.dp, vertical = 20.dp)) {
            val p = win(t, 2.0f, 0.4f)
            Row(Modifier.graphicsLayer { alpha = p; translationY = (1 - p) * 10f }) {
                CheckDot(Accent.red, 0f, 12.dp, open = true)
                Text(" Pay electricity bill", color = Paper, fontSize = 11.sp, lineHeight = 14.sp, fontFamily = GoogleSans)
            }
            Box(Modifier.padding(top = 12.dp).width(64.dp).height(6.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.1f)))
            Box(Modifier.padding(top = 8.dp).width(48.dp).height(6.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.1f)))
        }
        // The change travelling across.
        val f = win(t, 0.9f, 1.1f)
        if (f > 0f && f < 1f) {
            Canvas(Modifier.size(320.dp, 250.dp)) {
                fun bez(u: Float): Offset {
                    val p0 = Offset(150.dp.toPx(), 110.dp.toPx()); val p1 = Offset(200.dp.toPx(), 40.dp.toPx()); val p2 = Offset(250.dp.toPx(), 90.dp.toPx())
                    val a = (1 - u) * (1 - u); val b = 2 * (1 - u) * u; val c = u * u
                    return Offset(a * p0.x + b * p1.x + c * p2.x, a * p0.y + b * p1.y + c * p2.y)
                }
                val e = f * f * (3 - 2 * f)
                for (i in 1..6) {
                    val u = (e - i * 0.04f).coerceAtLeast(0f)
                    drawCircle(Accent.yellow.copy(alpha = 0.12f * (7 - i)), (5 - i * 0.5f).dp.toPx(), bez(u))
                }
                drawCircle(Accent.yellow.copy(alpha = 0.3f), 11.dp.toPx(), bez(e))
                drawCircle(Accent.yellow, 5.dp.toPx(), bez(e))
            }
        }
    }
}

@Composable
fun NudgeScene(active: Boolean, key: Any) {
    val t = timeline(active, key)
    Box(Modifier.size(320.dp, 280.dp), contentAlignment = Alignment.TopCenter) {
        Box(Modifier.size(230.dp, 280.dp).border(2.dp, Muted, RoundedCornerShape(30.dp)).clip(RoundedCornerShape(30.dp))) {
            Column(Modifier.padding(top = 30.dp).align(Alignment.TopCenter), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("21:00", color = Paper, fontSize = 44.sp, fontWeight = FontWeight.Light, fontFamily = GoogleSans)
                Text("Saturday", color = Muted, fontSize = 12.sp, fontFamily = GoogleSans)
            }
            val p = pop(win(t, 0.4f, 0.6f))
            Column(
                Modifier.padding(top = 118.dp, start = 12.dp, end = 12.dp).graphicsLayer { alpha = win(t, 0.4f, 0.3f); translationY = (1 - p) * -120f }
                    .clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = 0.1f)).padding(12.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    AppLogo(14.dp)
                    Text("  Tasks", color = Muted, fontSize = 11.sp, fontFamily = GoogleSans)
                }
                Text("2 tasks still open", color = Paper, fontSize = 14.sp, fontWeight = FontWeight.Medium, fontFamily = GoogleSans, modifier = Modifier.padding(top = 6.dp))
                Text("You completed 5 of 7 today. High priority: Send the invoice", color = Muted, fontSize = 12.sp, lineHeight = 16.sp, fontFamily = GoogleSans)
            }
        }
    }
}

@Composable
fun SceneView(index: Int, active: Boolean, key: Any) = when (index) {
    0 -> DayScene(active, key)
    1 -> StepsScene(active, key)
    2 -> TagsScene(active, key)
    3 -> SyncScene(active, key)
    else -> NudgeScene(active, key)
}

/**
 * The day dial: a 24-hour face drawn large behind the scenes; each feature owns an arc,
 * and the dial turns so the current one points at [facing] degrees (clockwise from 12 o'clock).
 */
@Composable
fun DayDial(active: Int, modifier: Modifier = Modifier, diameter: Dp = 640.dp, facing: Float = 315f) {
    val reduced = reducedMotion()
    val rotation by animateFloatAsState(facing - (active + 0.5f) * 72f, if (reduced) tween(0) else tween(1100), label = "dial")
    val accents = SCENES.map { it.accent }
    val widths = accents.indices.map { i -> animateFloatAsState(if (i == active) 1f else 0f, tween(600), label = "arc$i").value }
    Canvas(modifier.size(diameter).graphicsLayer { rotationZ = rotation }) {
        val c = Offset(size.width / 2, size.height / 2)
        val r = size.minDimension / 2 - 20.dp.toPx()
        drawCircle(Color.White.copy(alpha = 0.08f), r, c, style = Stroke(1.dp.toPx()))
        drawCircle(Color.White.copy(alpha = 0.05f), r - 60.dp.toPx(), c, style = Stroke(1.dp.toPx()))
        for (k in 0 until 96) {
            val a = k / 96f * 2 * Math.PI
            val long = k % 4 == 0
            val r1 = r - (if (long) 26 else 14).dp.toPx()
            drawLine(
                Color.White.copy(alpha = 0.14f),
                Offset(c.x + cos(a).toFloat() * r1, c.y + sin(a).toFloat() * r1),
                Offset(c.x + cos(a).toFloat() * (r - 4.dp.toPx()), c.y + sin(a).toFloat() * (r - 4.dp.toPx())),
                (if (long) 2 else 1).dp.toPx(), cap = StrokeCap.Round,
            )
        }
        val ar = r - 42.dp.toPx()
        accents.forEachIndexed { i, color -> arc(color, ar, c, i, widths[i]) }
    }
}

private fun DrawScope.arc(color: Color, r: Float, c: Offset, i: Int, on: Float) {
    val start = -90f + i * 72f + 4f
    val w = (6 + 12 * on).dp.toPx()
    drawArc(
        color.copy(alpha = 0.35f + 0.65f * on), start, 64f, false, Offset(c.x - r, c.y - r), Size(r * 2, r * 2),
        style = Stroke(w, cap = StrokeCap.Round),
    )
}

/** Page dots; the current one is a pill in its scene's colour. */
@Composable
fun SceneDots(current: Int, modifier: Modifier = Modifier) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        SCENES.forEachIndexed { i, s ->
            val w by animateFloatAsState(if (i == current) 28f else 8f, tween(250), label = "dot")
            Box(Modifier.size(w.dp, 8.dp).clip(CircleShape).background(if (i == current) s.accent else Color.White.copy(alpha = 0.25f)))
        }
    }
}

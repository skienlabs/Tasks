package com.skienlabs.tasks.ui.theme

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.sin

/**
 * One slow clock shared by every glass panel (0 → 1 over [SHEEN_MS]); panels read it while
 * drawing, so the light can sweep across all of them without recomposing anything.
 */
val LocalGlassClock = staticCompositionLocalOf<State<Float>?> { null }

private const val SHEEN_MS = 7000
private const val DRIFT_MS = 60_000

/** The Glass themes' page: moving light behind, the app on top. */
@Composable
internal fun GlassLayer(g: GlassStyle, dark: Boolean, content: @Composable () -> Unit) {
    val clock = rememberInfiniteTransition(label = "glass").animateFloat(
        0f, 1f, infiniteRepeatable(tween(SHEEN_MS, easing = LinearEasing), RepeatMode.Restart), label = "sheen",
    )
    CompositionLocalProvider(LocalGlassClock provides clock) {
        Box(Modifier.fillMaxSize()) {
            GlassBackdrop(g, dark)
            content()
        }
    }
}

// Where each light rests (fractions of the screen), how far it wanders, and how fast.
private class Blob(val x: Float, val y: Float, val dx: Float, val dy: Float, val kx: Int, val ky: Int, val phase: Float, val r: Float)

private val BLOBS = listOf(
    Blob(0.10f, 0.08f, 0.22f, 0.10f, 1, 2, 0.0f, 0.62f),
    Blob(0.85f, 0.38f, 0.18f, 0.16f, 2, 1, 1.3f, 0.58f),
    Blob(0.15f, 0.78f, 0.20f, 0.12f, 1, 1, 2.1f, 0.55f),
    Blob(0.80f, 0.02f, 0.14f, 0.12f, 1, 2, 3.4f, 0.46f),
    Blob(0.55f, 0.95f, 0.22f, 0.08f, 2, 1, 4.2f, 0.52f),
)

/**
 * Soft coloured lights drifting slowly behind everything, so the see-through panels always have
 * something to show. Each light follows a looping path, so a minute of motion repeats seamlessly.
 */
@Composable
fun GlassBackdrop(g: GlassStyle, dark: Boolean, modifier: Modifier = Modifier) {
    val t = rememberInfiniteTransition(label = "drift").animateFloat(
        0f, 1f, infiniteRepeatable(tween(DRIFT_MS, easing = LinearEasing), RepeatMode.Restart), label = "t",
    )
    Canvas(modifier.fillMaxSize().background(g.base)) {
        val time = t.value
        val big = max(size.width, size.height)
        BLOBS.forEachIndexed { i, b ->
            val a = 2 * PI.toFloat() * time
            val cx = size.width * (b.x + b.dx * sin(a * b.kx + b.phase))
            val cy = size.height * (b.y + b.dy * sin(a * b.ky + b.phase * 1.7f))
            val pulse = 1f + 0.12f * sin(a * 2 + b.phase)
            val r = big * b.r * pulse
            val c = g.blobs[i % g.blobs.size]
            drawCircle(
                Brush.radialGradient(listOf(c.copy(alpha = g.blobAlpha), c.copy(alpha = g.blobAlpha * 0.35f), Color.Transparent), Offset(cx, cy), r),
                r, Offset(cx, cy),
                blendMode = if (dark) BlendMode.Screen else BlendMode.SrcOver,
            )
        }
        // Edges a touch darker (or lighter) so text near them stays easy to read.
        drawRect(
            Brush.radialGradient(
                listOf(Color.Transparent, if (dark) Color(0x8C000000) else Color(0x80FFFFFF)),
                Offset(size.width / 2, size.height * 0.4f), big * 0.85f,
            ),
        )
    }
}

/**
 * A liquid-glass panel: a see-through fill that is a little brighter at the top, a rim that
 * catches the light (bright at the top-left, fading round the edge), and a band of light that
 * sweeps across now and then. Does nothing outside the Glass themes, so it's safe everywhere.
 */
fun Modifier.glassPanel(shape: Shape, fill: Color? = null, rim: Dp = 1.dp): Modifier = composed {
    val g = LocalExtra.current.glass ?: return@composed this
    val clock = LocalGlassClock.current
    val f = fill ?: g.panel
    this
        .clip(shape)
        .background(Brush.verticalGradient(listOf(f.copy(alpha = (f.alpha * 1.6f).coerceAtMost(1f)), f)))
        .border(rim, Brush.linearGradient(listOf(g.shine, g.edge, g.edge.copy(alpha = g.edge.alpha * 0.35f), g.edge)), shape)
        .drawWithContent {
            drawContent()
            val p = clock?.value ?: return@drawWithContent
            // The sweep crosses during the first third of each cycle, then rests.
            val s = p * 3f
            if (s < 1f) {
                val w = size.width
                val x = -w * 0.4f + s * w * 1.8f
                drawRect(
                    Brush.linearGradient(
                        listOf(Color.Transparent, g.shine.copy(alpha = 0.16f), Color.Transparent),
                        start = Offset(x, 0f), end = Offset(x + w * 0.35f, size.height),
                    ),
                )
            }
        }
}

/**
 * Glass themes: things float in when they first appear (a little lift, scale and fade, with a
 * soft spring). Other themes: no effect.
 */
fun Modifier.glassAppear(): Modifier = composed {
    if (LocalExtra.current.glass == null) return@composed this
    val a = remember { Animatable(0f) }
    LaunchedEffect(Unit) { a.animateTo(1f, spring(dampingRatio = 0.72f, stiffness = 260f)) }
    graphicsLayer {
        val v = a.value
        alpha = v.coerceIn(0f, 1f)
        translationY = (1f - v) * 18.dp.toPx()
        val sc = 0.96f + 0.04f * v
        scaleX = sc
        scaleY = sc
    }
}

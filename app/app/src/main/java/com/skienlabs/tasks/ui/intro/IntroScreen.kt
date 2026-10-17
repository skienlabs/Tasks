package com.skienlabs.tasks.ui.intro

import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import com.skienlabs.tasks.ui.common.AppLogo
import com.skienlabs.tasks.ui.theme.GoogleSans
import kotlinx.coroutines.launch
import kotlin.math.absoluteValue

/** Light status/navigation bar icons while an ink-blue screen is showing. */
@Composable
fun DarkBars() {
    val activity = LocalActivity.current ?: return
    DisposableEffect(activity) {
        val c = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
        val status = c.isAppearanceLightStatusBars
        val nav = c.isAppearanceLightNavigationBars
        c.isAppearanceLightStatusBars = false
        c.isAppearanceLightNavigationBars = false
        onDispose {
            c.isAppearanceLightStatusBars = status
            c.isAppearanceLightNavigationBars = nav
        }
    }
}

/** Faint dot grid, like a planner page. */
fun Modifier.dotGrid() = drawBehind {
    val step = 22.dp.toPx()
    val dot = Color.White.copy(alpha = 0.07f)
    var y = step / 2
    while (y < size.height) {
        var x = step / 2
        while (x < size.width) {
            drawCircle(dot, 1.dp.toPx(), Offset(x, y))
            x += step
        }
        y += step
    }
}

/** First launch only: what the app does, swipe or tap Next. */
@Composable
fun IntroScreen(onDone: () -> Unit) {
    DarkBars()
    val pager = rememberPagerState { SCENES.size }
    val scope = rememberCoroutineScope()
    val page = pager.currentPage
    val last = page == SCENES.lastIndex
    val accent by animateColorAsState(SCENES[page].accent, tween(400), label = "accent")
    BackHandler(enabled = page > 0) { scope.launch { pager.animateScrollToPage(page - 1) } }

    BoxWithConstraints(Modifier.fillMaxSize().background(Ink).dotGrid()) {
        val tall = maxHeight > 720.dp
        Column(Modifier.fillMaxSize().safeDrawingPadding()) {
            Row(Modifier.fillMaxWidth().padding(start = 24.dp, end = 8.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                AppLogo(30.dp)
                Text("  Tasks", color = Paper, fontSize = 20.sp, fontWeight = FontWeight.Medium, fontFamily = GoogleSans, modifier = Modifier.weight(1f))
                if (!last) TextButton(onClick = onDone) { Text("Skip", color = Muted, fontFamily = GoogleSans) }
            }
            HorizontalPager(pager, Modifier.weight(1f).fillMaxWidth(), key = { it }) { i ->
                // Gentle parallax/fade while swiping.
                val offset = ((pager.currentPage - i) + pager.currentPageOffsetFraction).absoluteValue.coerceIn(0f, 1f)
                Column(
                    Modifier.fillMaxSize().graphicsLayer { alpha = 1f - offset * 0.6f }.padding(horizontal = 28.dp),
                    verticalArrangement = Arrangement.Center,
                ) {
                    Box(
                        Modifier.fillMaxWidth().height(if (tall) 340.dp else 290.dp).graphicsLayer {
                            val s = if (tall) 1.08f else 0.92f
                            scaleX = s; scaleY = s
                            translationX = (pager.currentPage - i + pager.currentPageOffsetFraction) * 80f
                        },
                        contentAlignment = Alignment.Center,
                    ) { SceneView(i, active = pager.settledPage == i, key = i) }
                    Column(Modifier.widthIn(max = 420.dp).padding(top = 24.dp)) {
                        Text(
                            SCENES[i].title, color = Paper, fontSize = 34.sp, lineHeight = 38.sp, fontWeight = FontWeight.Medium,
                            fontFamily = GoogleSans, letterSpacing = (-0.5).sp, modifier = Modifier.semantics { heading() },
                        )
                        Text(SCENES[i].text, color = Muted, fontSize = 16.sp, lineHeight = 23.sp, fontFamily = GoogleSans, modifier = Modifier.padding(top = 10.dp))
                    }
                }
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                SceneDots(page, Modifier.weight(1f))
                Button(
                    onClick = { if (last) onDone() else scope.launch { pager.animateScrollToPage(page + 1) } },
                    colors = ButtonDefaults.buttonColors(containerColor = accent, contentColor = Ink),
                    shape = RoundedCornerShape(28.dp),
                    modifier = Modifier.height(52.dp).clip(CircleShape),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 28.dp),
                ) { Text(if (last) "Get started" else "Next", fontSize = 16.sp, fontWeight = FontWeight.Medium, fontFamily = GoogleSans) }
            }
        }
    }
}

/** Ink-blue header for the sign-in screen: the dial, the logo and the promise. */
@Composable
fun SignInArt(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().clip(RoundedCornerShape(bottomStart = 32.dp, bottomEnd = 32.dp)).background(Ink).dotGrid()) {
        // The dial is decoration: it must not make the band taller.
        Box(Modifier.matchParentSize()) {
            DayDial(
                0, Modifier.align(Alignment.BottomEnd).offset(200.dp, 470.dp).wrapContentSize(unbounded = true, align = Alignment.BottomEnd),
                diameter = 560.dp,
            )
        }
        Column(Modifier.safeDrawingPadding().padding(start = 28.dp, end = 28.dp, top = 28.dp, bottom = 84.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AppLogo(34.dp)
                Text("  Tasks", color = Paper, fontSize = 22.sp, fontWeight = FontWeight.Medium, fontFamily = GoogleSans)
            }
            Text(
                "Plan each day.\nFinish what matters.", color = Paper, fontSize = 30.sp, lineHeight = 35.sp,
                fontWeight = FontWeight.Medium, fontFamily = GoogleSans, letterSpacing = (-0.5).sp, modifier = Modifier.padding(top = 26.dp),
            )
        }
    }
}

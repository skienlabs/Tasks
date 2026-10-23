package com.skienlabs.tasks.ui.common

import android.graphics.BitmapFactory
import android.util.Base64
import android.util.LruCache
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skienlabs.tasks.data.Counts
import com.skienlabs.tasks.data.Tag
import com.skienlabs.tasks.ui.theme.LocalExtra
import com.skienlabs.tasks.ui.theme.Palette

/** Decoded tag logos, keyed by the data URL itself (small: ~96 px images). */
private object LogoCache {
    private val cache = LruCache<String, ImageBitmap>(64)
    fun get(dataUrl: String): ImageBitmap? {
        cache.get(dataUrl)?.let { return it }
        val comma = dataUrl.indexOf(',')
        if (comma < 0) return null
        val bytes = runCatching { Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT) }.getOrNull() ?: return null
        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap() ?: return null
        cache.put(dataUrl, bmp)
        return bmp
    }
}

@Composable
fun tagColor(key: String): Color = Palette.tag(key, LocalExtra.current)

@Composable
fun TagAvatar(tag: Tag, size: Dp = 18.dp) {
    val logo = tag.logo
    val img = remember(logo) { logo?.let { LogoCache.get(it) } }
    if (img != null) {
        Image(
            bitmap = img,
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier.size(size).clip(RoundedCornerShape(if (size > 24.dp) 8.dp else 4.dp)),
        )
    } else {
        val c = tagColor(tag.color)
        Box(Modifier.size(size).clip(CircleShape).background(c), contentAlignment = Alignment.Center) {
            Text(
                tag.name.take(1).uppercase(),
                color = if (LocalExtra.current.dark) Color.Black else Color.White,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                style = androidx.compose.ui.text.TextStyle(
                    fontSize = (size.value * 0.55f).sp,
                    lineHeight = (size.value * 0.55f).sp,
                    platformStyle = androidx.compose.ui.text.PlatformTextStyle(includeFontPadding = false),
                    lineHeightStyle = androidx.compose.ui.text.style.LineHeightStyle(
                        androidx.compose.ui.text.style.LineHeightStyle.Alignment.Center,
                        androidx.compose.ui.text.style.LineHeightStyle.Trim.Both,
                    ),
                ),
            )
        }
    }
}

/** Colored company/project label. [dense] for task rows, otherwise a filter chip. */
@Composable
fun TagChip(tag: Tag, modifier: Modifier = Modifier, selected: Boolean = false, dense: Boolean = false, onClick: (() -> Unit)? = null) {
    val c = tagColor(tag.color)
    val x = LocalExtra.current
    val dark = x.dark
    // Normal text colour (tag colours on tinted backgrounds were hard to read): the logo and the
    // outline carry the colour.
    val bg = if (selected) c.copy(alpha = if (dark) 0.16f else 0.12f) else if (dense) x.chip else Color.Transparent
    val shape = RoundedCornerShape(50)
    var m = modifier.clip(shape).background(bg)
    if (!dense) m = m.border(1.dp, if (selected) c else c.copy(alpha = 0.4f), shape)
    if (onClick != null) m = m.clickable(role = Role.Checkbox, onClick = onClick)
    Row(
        m.heightIn(min = if (dense) 22.dp else 34.dp).padding(start = if (dense) 3.dp else 6.dp, end = if (dense) 8.dp else 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        TagAvatar(tag, if (dense) 15.dp else 20.dp)
        Text(
            tag.name,
            color = MaterialTheme.colorScheme.onSurface,
            style = if (dense) MaterialTheme.typography.labelMedium else MaterialTheme.typography.labelLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.widthIn(max = 180.dp),
        )
    }
}

/** The app mark: blue rounded square with a check (same as the web icon). */
@Composable
fun AppLogo(size: Dp = 32.dp) {
    Canvas(Modifier.size(size)) {
        val s = this.size.width / 48f
        drawRoundRect(
            brush = Brush.linearGradient(listOf(Color(0xFF4C8DF6), Color(0xFF0B57D0)), Offset(4 * s, 7 * s), Offset(44 * s, 44 * s)),
            topLeft = Offset(4 * s, 7 * s), size = Size(40 * s, 37 * s), cornerRadius = CornerRadius(11 * s),
        )
        drawRoundRect(Color(0xFF0B57D0), Offset(14 * s, 3 * s), Size(4 * s, 9 * s), CornerRadius(2 * s))
        drawRoundRect(Color(0xFF0B57D0), Offset(30 * s, 3 * s), Size(4 * s, 9 * s), CornerRadius(2 * s))
        val p = Path().apply {
            moveTo(15 * s, 26.5f * s); lineTo(21 * s, 32.5f * s); lineTo(33 * s, 20 * s)
        }
        drawPath(p, Color.White, style = Stroke(width = 4.2f * s, cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
}

/** Horizontal bar split into done / left / not finished (moved on) / cancelled. */
@Composable
fun StackBar(c: Counts, modifier: Modifier = Modifier, height: Dp = 8.dp, overdue: Boolean = false) {
    val x = LocalExtra.current
    val total = c.total + c.missed
    Row(modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(50)).background(x.surfaceHighest)) {
        if (total > 0) {
            if (c.done > 0) Box(Modifier.weight(c.done.toFloat()).height(height).background(x.done))
            if (c.pending > 0) Box(Modifier.weight(c.pending.toFloat()).height(height).background(if (overdue) x.overdue else x.pending))
            if (c.missed > 0) Box(Modifier.weight(c.missed.toFloat()).height(height).background(x.overdue))
            if (c.cancelled > 0) Box(Modifier.weight(c.cancelled.toFloat()).height(height).background(x.cancelled.copy(alpha = 0.6f)))
        }
    }
}

/** Small tinted label, e.g. "3 left". */
@Composable
fun Pill(text: String, color: Color, modifier: Modifier = Modifier) {
    val dark = LocalExtra.current.dark
    Box(
        modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = if (dark) 0.16f else 0.1f)).padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(text, color = color, style = MaterialTheme.typography.labelMedium, maxLines = 1)
    }
}

@Composable
fun HSpace(w: Dp) = Spacer(Modifier.width(w))

@Composable
fun VSpace(h: Dp) = Spacer(Modifier.height(h))

/** Text with the Google-style blue → purple → pink gradient (used for "Today" and greetings). */
fun gradientBrush(colors: List<Color>) = Brush.linearGradient(colors)

/** The web address of the privacy policy (served by the same server the app talks to). */
val PRIVACY_URL: String = (com.skienlabs.tasks.BuildConfig.API_URL.ifBlank { "https://tasks.skienlab.com" }) + "/privacypolicy.html"

/** "Privacy policy" link; opens the policy in the browser. [delete] links to how to delete the account. */
@Composable
fun PrivacyLink(modifier: Modifier = Modifier, delete: Boolean = false) {
    val uri = androidx.compose.ui.platform.LocalUriHandler.current
    Text(
        if (delete) "Delete account" else "Privacy policy",
        style = MaterialTheme.typography.bodySmall,
        color = if (delete) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary,
        textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline,
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .clickable(role = androidx.compose.ui.semantics.Role.Button, onClickLabel = if (delete) "How to delete your account" else "Open the privacy policy") {
                runCatching { uri.openUri(if (delete) "$PRIVACY_URL#delete" else PRIVACY_URL) }
            }
            .padding(vertical = 6.dp),
    )
}

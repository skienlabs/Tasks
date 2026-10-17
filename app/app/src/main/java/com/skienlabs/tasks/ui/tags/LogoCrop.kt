package com.skienlabs.tasks.ui.tags

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.graphics.Paint
import android.net.Uri
import android.os.Build
import android.util.Base64
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CropFree
import androidx.compose.material.icons.outlined.FitScreen
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.skienlabs.tasks.ui.theme.LocalExtra
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

private const val LOGO_OUT = 128
private const val MAX_LOGO_CHARS = 60_000

/** Decodes a picked image for cropping (at most 2048 px on the long side, rotation applied). */
suspend fun decodeForCrop(context: Context, uri: Uri): Bitmap = withContext(Dispatchers.Default) {
    try {
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            val w = info.size.width
            val h = info.size.height
            if (w.toLong() * h > 100_000_000L) throw IllegalArgumentException("That image is too large")
            val scale = minOf(1f, 2048f / maxOf(w, h))
            decoder.setTargetSize(maxOf(1, Math.round(w * scale)), maxOf(1, Math.round(h * scale)))
        }.let { toArgb(it) }
    } catch (e: IllegalArgumentException) {
        throw e
    } catch (e: Exception) {
        // Some files ImageDecoder refuses still open with the older decoder.
        decodeFallback(context, uri) ?: throw IllegalArgumentException("That file isn't an image this phone can open")
    }
}

/** HDR / wide-colour photos decode to 16-bit bitmaps: bring them to plain 8-bit sRGB for the crop. */
private fun toArgb(b: Bitmap): Bitmap {
    if (b.config == Bitmap.Config.ARGB_8888 && (b.colorSpace == null || b.colorSpace == android.graphics.ColorSpace.get(android.graphics.ColorSpace.Named.SRGB))) return b
    val out = Bitmap.createBitmap(b.width, b.height, Bitmap.Config.ARGB_8888)
    Canvas(out).drawBitmap(b, 0f, 0f, Paint(Paint.FILTER_BITMAP_FLAG))
    b.recycle()
    return out
}

private fun decodeFallback(context: Context, uri: Uri): Bitmap? = runCatching {
    val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri)?.use { android.graphics.BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0) return@runCatching null
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 2048) sample *= 2
    val opts = android.graphics.BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 }
    context.contentResolver.openInputStream(uri)?.use { android.graphics.BitmapFactory.decodeStream(it, null, opts) }
}.getOrNull()

/**
 * The crop: [scale] is pixels-on-screen per image pixel within a square of [view] px,
 * [offset] is where the image's top-left sits in that square.
 */
internal fun renderLogo(src: Bitmap, view: Float, scale: Float, offset: Offset): String {
    val out = Bitmap.createBitmap(LOGO_OUT, LOGO_OUT, Bitmap.Config.ARGB_8888)
    val k = LOGO_OUT / view
    val m = Matrix().apply {
        postScale(scale * k, scale * k)
        postTranslate(offset.x * k, offset.y * k)
    }
    Canvas(out).drawBitmap(src, m, Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
    fun enc(format: Bitmap.CompressFormat, q: Int, mime: String): String {
        val bytes = ByteArrayOutputStream().also { out.compress(format, q, it) }.toByteArray()
        return "data:$mime;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
    }
    val tries = buildList<() -> String> {
        if (Build.VERSION.SDK_INT >= 30) {
            add { enc(Bitmap.CompressFormat.WEBP_LOSSY, 90, "image/webp") }
            add { enc(Bitmap.CompressFormat.WEBP_LOSSY, 70, "image/webp") }
        }
        add { enc(Bitmap.CompressFormat.PNG, 100, "image/png") }
    }
    val result = tries.firstNotNullOfOrNull { t -> t().takeIf { it.length <= MAX_LOGO_CHARS } }
    out.recycle()
    return result ?: throw IllegalArgumentException("Logo is too detailed; try a simpler image")
}

private fun clamp(o: Offset, scale: Float, w: Int, h: Int, view: Float): Offset {
    val sw = w * scale
    val sh = h * scale
    val x = if (sw >= view) o.x.coerceIn(view - sw, 0f) else (view - sw) / 2
    val y = if (sh >= view) o.y.coerceIn(view - sh, 0f) else (view - sh) / 2
    return Offset(x, y)
}

/** Square logo crop: drag to move, pinch (or double-tap) to zoom; "Fit whole image" for wide logos. */
@Composable
fun LogoCropDialog(src: Bitmap, onCancel: () -> Unit, onDone: (String) -> Unit, onError: (String) -> Unit) {
    val density = LocalDensity.current
    val viewDp = 280.dp
    val view = with(density) { viewDp.toPx() }
    val w = src.width
    val h = src.height
    val fit = view / maxOf(w, h)
    val fill = view / minOf(w, h)
    val minScale = fit
    val maxScale = maxOf(fill * 6, fit * 2)
    var scale by remember(src) { mutableFloatStateOf(fill) }
    var offset by remember(src) { mutableStateOf(clamp(Offset((view - w * fill) / 2, (view - h * fill) / 2), fill, w, h, view)) }
    val image = remember(src) { src.asImageBitmap() }
    val x = LocalExtra.current

    fun zoom(to: Float, center: Offset = Offset(view / 2, view / 2)) {
        val s = to.coerceIn(minScale, maxScale)
        offset = clamp(Offset(center.x - (center.x - offset.x) * s / scale, center.y - (center.y - offset.y) * s / scale), s, w, h, view)
        scale = s
    }

    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text("Crop logo") },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                Box(
                    Modifier.size(viewDp).clip(RoundedCornerShape(16.dp)).background(x.surfaceHighest)
                        .pointerInput(src) {
                            detectTransformGestures { centroid, pan, z, _ ->
                                if (z != 1f) zoom(scale * z, centroid)
                                offset = clamp(offset + pan, scale, w, h, view)
                            }
                        }
                        .pointerInput(src) { detectTapGestures(onDoubleTap = { p -> zoom(if (scale < fill * 1.5f) scale * 2f else fill, p) }) }
                        .semantics { contentDescription = "Crop area. Drag to move, pinch to zoom." },
                ) {
                    // Checkerboard: shows what will be see-through.
                    val light = x.surfaceHigh
                    Canvas(Modifier.size(viewDp)) {
                        val cell = 10.dp.toPx()
                        var row = 0
                        var yy = 0f
                        while (yy < size.height) {
                            var xx = if (row % 2 == 0) 0f else cell
                            while (xx < size.width) {
                                drawRect(light, Offset(xx, yy), Size(cell, cell))
                                xx += cell * 2
                            }
                            yy += cell
                            row++
                        }
                    }
                    Canvas(Modifier.size(viewDp)) {
                        drawImage(
                            image,
                            srcOffset = androidx.compose.ui.unit.IntOffset.Zero,
                            srcSize = androidx.compose.ui.unit.IntSize(w, h),
                            dstOffset = androidx.compose.ui.unit.IntOffset(Math.round(offset.x), Math.round(offset.y)),
                            dstSize = androidx.compose.ui.unit.IntSize(maxOf(1, Math.round(w * scale)), maxOf(1, Math.round(h * scale))),
                            filterQuality = androidx.compose.ui.graphics.FilterQuality.High,
                        )
                    }
                    // Rounded-square frame (how the logo looks on a tag), darkened outside, rule-of-thirds grid.
                    Canvas(Modifier.size(viewDp)) {
                        val r = size.minDimension * 0.22f
                        val outside = Path().apply {
                            fillType = PathFillType.EvenOdd
                            addRect(androidx.compose.ui.geometry.Rect(Offset.Zero, size))
                            addRoundRect(androidx.compose.ui.geometry.RoundRect(androidx.compose.ui.geometry.Rect(Offset.Zero, size), CornerRadius(r)))
                        }
                        drawPath(outside, Color.Black.copy(alpha = 0.45f))
                        drawRoundRect(Color.White.copy(alpha = 0.9f), cornerRadius = CornerRadius(r), style = Stroke(2.dp.toPx()))
                        for (i in 1..2) {
                            val t = size.width * i / 3
                            drawLine(Color.White.copy(alpha = 0.25f), Offset(t, 0f), Offset(t, size.height), 1f)
                            drawLine(Color.White.copy(alpha = 0.25f), Offset(0f, t), Offset(size.width, t), 1f)
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { scale = fit; offset = clamp(Offset.Zero, fit, w, h, view) }) {
                        Icon(Icons.Outlined.FitScreen, null, Modifier.size(18.dp)); Text("  Fit whole")
                    }
                    TextButton(onClick = { scale = fill; offset = clamp(Offset((view - w * fill) / 2, (view - h * fill) / 2), fill, w, h, view) }) {
                        Icon(Icons.Outlined.CropFree, null, Modifier.size(18.dp)); Text("  Fill")
                    }
                }
                Text("Drag to move · pinch to zoom", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = {
            Button(onClick = {
                try {
                    onDone(renderLogo(src, view, scale, offset))
                } catch (e: IllegalArgumentException) {
                    onError(e.message ?: "Couldn't use that image")
                }
            }) { Text("Use logo") }
        },
        dismissButton = { TextButton(onClick = onCancel) { Text("Cancel") } },
    )
}

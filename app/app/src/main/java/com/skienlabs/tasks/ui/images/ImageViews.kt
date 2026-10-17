package com.skienlabs.tasks.ui.images

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.BrokenImage
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.skienlabs.tasks.data.Attachment
import com.skienlabs.tasks.ui.theme.LocalExtra

/** One image square. [local] shows a picked image before it's uploaded. */
@Composable
fun Thumb(attachment: Attachment?, size: Dp, modifier: Modifier = Modifier, local: ImageBitmap? = null, label: String = "Open image", onClick: (() -> Unit)? = null, overlay: @Composable () -> Unit = {}) {
    val x = LocalExtra.current
    val remote = if (local == null && attachment != null) rememberImageLoad(attachment.id, "thumb") else null
    val img = local ?: remote?.image
    var m = modifier.size(size).clip(RoundedCornerShape(10.dp)).background(x.surfaceHighest).border(1.dp, x.outline.copy(alpha = 0.5f), RoundedCornerShape(10.dp))
    if (onClick != null) m = m.clickable(role = Role.Image, onClickLabel = label, onClick = onClick)
    Box(m.semantics { contentDescription = label }, contentAlignment = Alignment.Center) {
        if (img != null) Image(img, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        else if (remote?.failed == true) Icon(Icons.Outlined.BrokenImage, null, Modifier.size(size / 3), tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))
        if (attachment?.uploading == true) {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f)), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(Modifier.size(size / 3), color = Color.White, strokeWidth = 2.dp)
            }
        }
        overlay()
    }
}

/** Up to four thumbnails on a task row; the last shows "+N" when there are more. */
@Composable
fun ImageStrip(attachments: List<Attachment>, onOpen: (Int) -> Unit) {
    val shown = attachments.take(4)
    val more = attachments.size - shown.size
    Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        shown.forEachIndexed { i, a ->
            Thumb(a, 46.dp, label = "Open image ${i + 1} of ${attachments.size}", onClick = { onOpen(i) }) {
                if (more > 0 && i == shown.lastIndex) {
                    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.55f)), contentAlignment = Alignment.Center) {
                        Text("+$more", color = Color.White, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

/** Full-screen viewer: swipe between images, pinch or double-tap to zoom. */
@Composable
fun ImageViewer(attachments: List<Attachment>, start: Int, onDismiss: () -> Unit) {
    if (attachments.isEmpty()) return
    val pager = rememberPagerState(initialPage = start.coerceIn(0, attachments.lastIndex)) { attachments.size }
    var zoomed by remember { mutableStateOf(false) }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            HorizontalPager(pager, Modifier.fillMaxSize(), userScrollEnabled = !zoomed, key = { attachments[it].id }) { page ->
                ZoomableImage(attachments[page], onZoomChange = { if (page == pager.currentPage) zoomed = it })
            }
            Box(Modifier.fillMaxSize().safeDrawingPadding()) {
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier.align(Alignment.TopEnd).padding(8.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.15f)),
                ) { Icon(Icons.Filled.Close, "Close", tint = Color.White) }
                if (attachments.size > 1) {
                    Text(
                        "${pager.currentPage + 1} / ${attachments.size}", color = Color.White.copy(alpha = 0.85f),
                        modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun ZoomableImage(a: Attachment, onZoomChange: (Boolean) -> Unit) {
    val fullLoad = rememberImageLoad(a.id, "full")
    val full = fullLoad.image
    val thumb = rememberImage(a.id, "thumb")
    val img = full ?: thumb
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    fun set(s: Float, o: Offset) {
        scale = s.coerceIn(1f, 5f)
        offset = if (scale == 1f) Offset.Zero else o
        onZoomChange(scale > 1f)
    }
    val state = rememberTransformableState { zoom, pan, _ -> set(scale * zoom, offset + pan * scale) }
    Box(
        Modifier.fillMaxSize()
            .pointerInput(a.id) { detectTapGestures(onDoubleTap = { set(if (scale > 1f) 1f else 2.5f, Offset.Zero) }) }
            .transformable(state, canPan = { scale > 1f }),
        contentAlignment = Alignment.Center,
    ) {
        if (img != null) {
            Image(
                img, "Image", Modifier.fillMaxSize().graphicsLayer {
                    scaleX = scale; scaleY = scale; translationX = offset.x; translationY = offset.y
                },
                contentScale = ContentScale.Fit,
            )
        }
        if (full == null && !fullLoad.failed) CircularProgressIndicator(color = Color.White)
        if (img == null && fullLoad.failed) Text("Couldn't load this image", color = Color.White)
    }
}

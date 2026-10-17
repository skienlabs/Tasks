package com.skienlabs.tasks.ui.task

import android.content.ActivityNotFoundException
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.AddPhotoAlternate
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.skienlabs.tasks.data.Attachment
import com.skienlabs.tasks.data.MAX_IMAGES_PER_TASK
import com.skienlabs.tasks.data.PreparedImage
import com.skienlabs.tasks.ui.images.ImageViewer
import com.skienlabs.tasks.ui.images.Thumb
import com.skienlabs.tasks.ui.images.prepareImage
import com.skienlabs.tasks.ui.theme.LocalExtra
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.io.File
import java.util.UUID

/** A picked image, shrunk and ready to upload on Save. */
class NewImage(val prepared: PreparedImage, val preview: ImageBitmap?)

@Composable
fun ImagesEditor(
    saved: List<Attachment>,
    added: List<NewImage>,
    busy: Boolean,
    onBusy: (Boolean) -> Unit,
    onAdd: (List<NewImage>) -> Unit,
    onRemoveSaved: (Attachment) -> Unit,
    onRemoveNew: (NewImage) -> Unit,
    onError: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val count = saved.size + added.size
    val room = MAX_IMAGES_PER_TASK - count
    var viewer by remember { mutableStateOf<Int?>(null) }
    var cameraFile by rememberSaveable { mutableStateOf<String?>(null) }

    fun process(uris: List<Uri>, cleanup: () -> Unit = {}) {
        if (uris.isEmpty()) return
        val take = uris.take(maxOf(0, room))
        if (uris.size > take.size) onError("Up to $MAX_IMAGES_PER_TASK images per task")
        if (take.isEmpty()) return
        onBusy(true)
        scope.launch {
            val out = ArrayList<NewImage>()
            for (u in take) {
                try {
                    val p = prepareImage(context, u)
                    val preview = BitmapFactory.decodeByteArray(p.thumb, 0, p.thumb.size)?.asImageBitmap()
                    out += NewImage(p, preview)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    onError(e.message ?: "Couldn't open that image")
                }
            }
            if (out.isNotEmpty()) onAdd(out)
            cleanup()
            onBusy(false)
        }
    }

    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(MAX_IMAGES_PER_TASK)) { uris -> process(uris) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val path = cameraFile
        cameraFile = null
        if (path == null) return@rememberLauncherForActivityResult
        val file = File(path)
        if (ok && file.length() > 0) process(listOf(Uri.fromFile(file))) { file.delete() } else file.delete()
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "Images" + if (count > 0) " · $count" else "",
            style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            saved.forEachIndexed { i, a ->
                Removable(onRemove = { onRemoveSaved(a) }) { Thumb(a, 76.dp, label = "Open image ${i + 1}", onClick = { viewer = i }) }
            }
            added.forEach { img ->
                Removable(onRemove = { onRemoveNew(img) }) { Thumb(null, 76.dp, local = img.preview, label = "New image") }
            }
            if (room > 0) {
                AddTile(Icons.Outlined.AddPhotoAlternate, "Add images from gallery", enabled = !busy) {
                    pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }
                AddTile(Icons.Outlined.PhotoCamera, "Take a photo", enabled = !busy) {
                    val dir = File(context.cacheDir, "camera").apply { mkdirs() }
                    val file = File(dir, "${UUID.randomUUID()}.jpg")
                    val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
                    cameraFile = file.absolutePath
                    try {
                        camera.launch(uri)
                    } catch (e: ActivityNotFoundException) {
                        cameraFile = null
                        onError("No camera app found")
                    }
                }
            }
            if (busy) Box(Modifier.size(76.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(24.dp)) }
        }
        if (count == 0) {
            Text(
                "Screenshots, whiteboard photos, receipts… They're resized before upload.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
    viewer?.let { start -> ImageViewer(saved, start) { viewer = null } }
}

@Composable
private fun Removable(onRemove: () -> Unit, content: @Composable () -> Unit) {
    Box {
        content()
        Box(
            Modifier.align(Alignment.TopEnd).offset(x = 8.dp, y = (-8).dp).size(28.dp).clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceContainerHighest)
                .border(1.dp, LocalExtra.current.outline, CircleShape)
                .clickable(role = Role.Button, onClick = onRemove)
                .semantics { contentDescription = "Remove image" },
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.Close, null, Modifier.size(16.dp)) }
    }
}

@Composable
private fun AddTile(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, enabled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.size(76.dp).clip(RoundedCornerShape(10.dp)).border(1.dp, LocalExtra.current.outline, RoundedCornerShape(10.dp))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick).semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { Icon(icon, null, tint = MaterialTheme.colorScheme.primary.copy(alpha = if (enabled) 1f else 0.4f)) }
}

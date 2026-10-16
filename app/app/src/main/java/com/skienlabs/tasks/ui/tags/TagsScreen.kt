package com.skienlabs.tasks.ui.tags

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.util.Base64
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
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.skienlabs.tasks.data.Store
import com.skienlabs.tasks.data.ApiException
import com.skienlabs.tasks.data.Tag
import com.skienlabs.tasks.ui.common.TagAvatar
import com.skienlabs.tasks.ui.common.TagChip
import com.skienlabs.tasks.ui.common.tagColor
import com.skienlabs.tasks.ui.theme.LocalExtra
import com.skienlabs.tasks.ui.theme.Palette
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

const val MAX_TAGS = 50
private const val MAX_LOGO_CHARS = 60_000
private const val LOGO_PX = 96

/** Decodes any picked image, shrinks it to fit 96×96 and returns a small data URL the server accepts. */
suspend fun toLogo(context: Context, uri: Uri): String = withContext(Dispatchers.Default) {
    val bitmap = try {
        val src = ImageDecoder.createSource(context.contentResolver, uri)
        ImageDecoder.decodeBitmap(src) { decoder, info, _ ->
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            val w = info.size.width
            val h = info.size.height
            if (w.toLong() * h > 40_000_000L) throw IllegalArgumentException("Logo image is too large (over 40 megapixels)")
            val scale = minOf(1f, LOGO_PX.toFloat() / maxOf(w, h))
            decoder.setTargetSize(maxOf(1, Math.round(w * scale)), maxOf(1, Math.round(h * scale)))
        }
    } catch (e: IllegalArgumentException) {
        throw e
    } catch (e: Exception) {
        throw IllegalArgumentException("That file isn't an image this phone can read")
    }
    try {
        fun encode(format: Bitmap.CompressFormat, quality: Int, mime: String): String {
            val out = ByteArrayOutputStream()
            bitmap.compress(format, quality, out)
            return "data:$mime;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        }
        val attempts = buildList {
            if (Build.VERSION.SDK_INT >= 30) {
                add { encode(Bitmap.CompressFormat.WEBP_LOSSY, 90, "image/webp") }
                add { encode(Bitmap.CompressFormat.WEBP_LOSSY, 70, "image/webp") }
            }
            add { encode(Bitmap.CompressFormat.PNG, 100, "image/png") }
            if (!bitmap.hasAlpha()) add { encode(Bitmap.CompressFormat.JPEG, 80, "image/jpeg") }
        }
        attempts.firstNotNullOfOrNull { a -> a().takeIf { it.length <= MAX_LOGO_CHARS } }
            ?: throw IllegalArgumentException("Logo is too detailed; try a simpler image")
    } finally {
        bitmap.recycle()
    }
}

@Composable
fun TagsScreen(store: Store, tags: List<Tag>, tagsLoaded: Boolean, bottomPadding: Dp) {
    var editing by remember { mutableStateOf<Tag?>(null) }
    var creating by rememberSaveable { mutableStateOf(false) }
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 8.dp, bottom = bottomPadding + 24.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        item(key = "head") {
            Column(Modifier.padding(start = 8.dp, end = 8.dp, bottom = 8.dp)) {
                Text("Tags", style = MaterialTheme.typography.headlineMedium)
                Text(
                    "One for each company or project. Add a logo so you can spot them at a glance.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                FilledTonalButton(onClick = { creating = true }, enabled = tags.size < MAX_TAGS, modifier = Modifier.padding(top = 12.dp)) {
                    Icon(Icons.Filled.Add, null); Text(" New tag")
                }
                if (tags.size >= MAX_TAGS) Text("You can have at most $MAX_TAGS tags", style = MaterialTheme.typography.labelSmall)
            }
        }
        if (tags.isEmpty()) {
            item(key = "empty") {
                Column(Modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    if (!tagsLoaded) CircularProgressIndicator()
                    else {
                        Box(Modifier.size(64.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
                            Icon(Icons.Outlined.Sell, null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
                        }
                        Text("No tags yet", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 12.dp))
                    }
                }
            }
        }
        items(tags, key = { it.id }) { tag ->
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable { editing = tag }.padding(horizontal = 8.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TagAvatar(tag, 40.dp)
                Column(Modifier.weight(1f).padding(start = 14.dp)) {
                    Text(tag.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(Palette.tags[tag.color]?.label ?: "Blue", style = MaterialTheme.typography.bodySmall, color = tagColor(tag.color))
                }
                Icon(Icons.Outlined.Edit, "Edit ${tag.name}", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    if (creating || editing != null) {
        TagEditor(store, editing, onDismiss = { creating = false; editing = null })
    }
}

/** Create (tag == null) or edit a tag. Waits for the server so name clashes show right here. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TagEditor(store: Store, tag: Tag?, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val key = tag?.id ?: "new"
    var name by rememberSaveable(key) { mutableStateOf(tag?.name ?: "") }
    var color by rememberSaveable(key) { mutableStateOf(tag?.color ?: "blue") }
    var logo by remember(key) { mutableStateOf(tag?.logo) }
    var logoChanged by remember(key) { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    val clean = name.replace(Regex("\\s+"), " ").trim()

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch {
            busy = true; error = null
            try {
                logo = toLogo(context, uri); logoChanged = true
            } catch (e: IllegalArgumentException) {
                error = e.message
            } finally {
                busy = false
            }
        }
    }

    fun close() { scope.launch { sheet.hide() }.invokeOnCompletion { onDismiss() } }

    fun save() {
        if (clean.isEmpty() || busy) return
        busy = true; error = null
        scope.launch {
            try {
                store.saveTag(tag?.id, clean, color, logo, logoChanged)
                close()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                error = (e as? ApiException)?.message ?: "Couldn't save the tag"
            } finally {
                busy = false
            }
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(if (tag == null) "New tag" else "Edit tag", style = MaterialTheme.typography.titleLarge)
            Row(verticalAlignment = Alignment.CenterVertically) {
                TagAvatar(Tag(id = "preview", name = clean.ifEmpty { "?" }, color = color, logo = logo), 56.dp)
                Column(Modifier.padding(start = 16.dp)) {
                    TagChip(Tag(id = "preview", name = clean.ifEmpty { "Preview" }, color = color, logo = logo), dense = true)
                    Row {
                        TextButton(onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, enabled = !busy) {
                            Icon(Icons.Outlined.Image, null, Modifier.size(18.dp)); Text(if (logo == null) " Upload logo" else " Change logo")
                        }
                        if (logo != null) TextButton(onClick = { logo = null; logoChanged = true }, enabled = !busy) {
                            Text("Remove", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            OutlinedTextField(
                value = name, onValueChange = { name = it.take(40) }, label = { Text("Company or project name") }, singleLine = true,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words), modifier = Modifier.fillMaxWidth(),
                supportingText = { Text("${clean.length}/40") },
            )
            Text("Color", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Palette.tags.forEach { (k, p) ->
                    val c = tagColor(k)
                    val on = k == color
                    Box(
                        Modifier.size(40.dp).clip(CircleShape).background(c)
                            .border(if (on) 3.dp else 0.dp, if (on) MaterialTheme.colorScheme.onSurface else Color.Transparent, CircleShape)
                            .clickable { color = k }.semantics { contentDescription = p.label + if (on) ", selected" else "" },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (on) Icon(Icons.Filled.Check, null, tint = if (LocalExtra.current.dark) Color.Black else Color.White)
                    }
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                if (tag != null) TextButton(onClick = { confirmDelete = true }, enabled = !busy) { Text("Delete", color = MaterialTheme.colorScheme.error) }
                Box(Modifier.weight(1f))
                TextButton(onClick = { close() }) { Text("Cancel") }
                Button(onClick = { save() }, enabled = clean.isNotEmpty() && !busy, modifier = Modifier.padding(start = 8.dp)) {
                    if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                    else Text(if (tag == null) "Create" else "Save")
                }
            }
        }
    }

    if (confirmDelete && tag != null) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete \"${tag.name}\"?") },
            text = { Text("The tag is removed from all tasks. The tasks themselves stay.", textAlign = TextAlign.Start) },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    busy = true
                    scope.launch {
                        try {
                            store.removeTag(tag.id)
                            store.toast("Tag deleted")
                            close()
                        } catch (e: Exception) {
                            if (e is kotlinx.coroutines.CancellationException) throw e
                            error = (e as? ApiException)?.message ?: "Couldn't delete the tag"
                        } finally {
                            busy = false
                        }
                    }
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
        )
    }
}

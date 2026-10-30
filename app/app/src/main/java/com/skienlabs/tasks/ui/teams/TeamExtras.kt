package com.skienlabs.tasks.ui.teams

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.automirrored.outlined.Undo
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.GroupAdd
import androidx.compose.material.icons.outlined.HourglassTop
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.outlined.TableChart
import androidx.compose.material.icons.outlined.Verified
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.skienlabs.tasks.data.ApiException
import com.skienlabs.tasks.data.AppNotification
import com.skienlabs.tasks.data.Comment
import com.skienlabs.tasks.data.JoinInfo
import com.skienlabs.tasks.data.MAX_FILE_BYTES
import com.skienlabs.tasks.data.Store
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.data.TaskFile
import com.skienlabs.tasks.data.Team
import com.skienlabs.tasks.ui.common.tagColor
import com.skienlabs.tasks.ui.theme.LocalExtra
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/** The data store, for team parts inside screens that don't carry it (a task's details). */
val LocalStore = staticCompositionLocalOf<Store?> { null }

// ---- Small marks -------------------------------------------------------------------------

/** Sign-off state ("Waiting for review", "Sent back", "Approved"), or who finished a shared copy. */
@Composable
fun ReviewChip(task: Task) {
    val x = LocalExtra.current
    val amber = if (x.dark) Color(0xFFFDD663) else Color(0xFFB06000)
    val closer = task.closedBy?.let { LocalTeams.current.team(task.teamId)?.member(it)?.name ?: "someone else" }
    val (label, color) = when {
        closer != null -> "Finished by ${closer.substringBefore(' ')}" to x.done
        task.review == "waiting" -> "Waiting for review" to amber
        task.review == "returned" -> "Sent back" to x.overdue
        task.review == "approved" -> "Approved" to x.done
        task.needsReview && task.isPending -> "Needs sign-off" to MaterialTheme.colorScheme.onSurfaceVariant
        else -> return
    }
    Text(
        label, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = color, maxLines = 1,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.12f)).padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

/** The team's shared tags on a team task. */
@Composable
fun TeamTagChips(task: Task, team: Team? = LocalTeams.current.team(task.teamId)) {
    task.teamTagIds.mapNotNull { team?.tag(it) }.forEach { tag ->
        val c = tagColor(tag.color)
        Text(
            "# ${tag.name}", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = c, maxLines = 1,
            modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(c.copy(alpha = 0.12f)).border(1.dp, c.copy(alpha = 0.4f), RoundedCornerShape(6.dp))
                .padding(horizontal = 6.dp, vertical = 1.dp),
        )
    }
}

/** May I change this team task: an admin, or the member who gave it (when the team allows)? */
fun canManage(task: Task, team: Team?, myUid: String?): Boolean {
    if (task.teamId == null || team == null) return false
    if (team.isAdmin) return true
    return team.settings.membersCanAssign && task.assignedBy == myUid
}

private fun ago(ms: Long): String {
    val s = (System.currentTimeMillis() - ms) / 1000
    return when {
        s < 60 -> "now"
        s < 3600 -> "${s / 60}m"
        s < 86400 -> "${s / 3600}h"
        s < 7 * 86400 -> "${s / 86400}d"
        else -> java.time.Instant.ofEpochMilli(ms).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("d MMM"))
    }
}

fun fileSize(n: Long) = when {
    n < 1024 -> "$n B"
    n < 1024 * 1024 -> "${n / 1024} KB"
    else -> String.format(java.util.Locale.US, "%.1f MB", n / 1024.0 / 1024.0)
}

/** A data URL (the invite QR code) as an image. */
fun dataUrlBitmap(url: String): android.graphics.Bitmap? = runCatching {
    val bytes = java.util.Base64.getDecoder().decode(url.substringAfter("base64,"))
    android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
}.getOrNull()

// ---- Files ---------------------------------------------------------------------------------

/** Reads a picked file: its name, type and bytes (refusing anything over 10 MB). */
suspend fun readPicked(context: Context, uri: Uri): Triple<String, String, ByteArray> = withContext(Dispatchers.IO) {
    val cr = context.contentResolver
    var name = "file"
    var size = -1L
    cr.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME, android.provider.OpenableColumns.SIZE), null, null, null)?.use { c ->
        if (c.moveToFirst()) {
            c.getString(0)?.let { name = it }
            if (!c.isNull(1)) size = c.getLong(1)
        }
    }
    if (size > MAX_FILE_BYTES) throw ApiException(413, "$name is over 10 MB")
    val bytes = cr.openInputStream(uri)?.use { it.readBytes() } ?: throw ApiException(400, "Couldn't read the file")
    if (bytes.size > MAX_FILE_BYTES) throw ApiException(413, "$name is over 10 MB")
    Triple(name, cr.getType(uri) ?: "application/octet-stream", bytes)
}

/** Saves a file in the app's cache and opens it with whatever app handles it (or offers to share it). */
fun openBytes(context: Context, dir: String, name: String, mime: String, bytes: ByteArray, share: Boolean = false) {
    val folder = File(context.cacheDir, dir).apply { mkdirs() }
    val safe = name.replace(Regex("[\\\\/:*?\"<>|]"), "_").ifBlank { "file" }
    val file = File(folder, safe).apply { writeBytes(bytes) }
    val uri = FileProvider.getUriForFile(context, context.packageName + ".files", file)
    val view = Intent(if (share) Intent.ACTION_SEND else Intent.ACTION_VIEW).apply {
        if (share) { type = mime; putExtra(Intent.EXTRA_STREAM, uri) } else setDataAndType(uri, mime)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
        context.startActivity(Intent.createChooser(view, if (share) "Share $safe" else "Open $safe").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: android.content.ActivityNotFoundException) {
        val send = Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(Intent.createChooser(send, "Share $safe").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }
}

@Composable
private fun SectionTitle(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String, action: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().padding(top = 18.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            "  " + text.uppercase(), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f),
        )
        action()
    }
}

@Composable
private fun FileIcon(mime: String) {
    val x = LocalExtra.current
    when {
        mime == "application/pdf" -> Icon(Icons.Outlined.PictureAsPdf, null, tint = x.overdue)
        Regex("sheet|excel|csv").containsMatchIn(mime) -> Icon(Icons.Outlined.TableChart, null, tint = x.done)
        else -> Icon(Icons.Outlined.Description, null, tint = MaterialTheme.colorScheme.primary)
    }
}

/** Files on a task: open, remove (the person, whoever added it, admins), add. */
@Composable
fun TaskFiles(store: Store, task: Task, team: Team?, canAdd: Boolean, asAdmin: Boolean) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val me = LocalMyUid.current
    var busy by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        scope.launch {
            busy = true
            try {
                for (u in uris.take(10)) {
                    val (name, mime, bytes) = readPicked(context, u)
                    store.uploadFile(task, name, mime, bytes, asAdmin)
                }
                store.toast(if (uris.size == 1) "File added" else "${uris.size} files added")
            } catch (e: ApiException) {
                store.toast(e.message ?: "Couldn't add the file")
            } finally {
                busy = false
            }
        }
    }
    if (task.files.isEmpty() && !canAdd) return
    Column {
        SectionTitle(Icons.Outlined.AttachFile, "Files" + if (task.files.isNotEmpty()) " · ${task.files.size}" else "") {
            if (canAdd) TextButton(enabled = !busy, onClick = { picker.launch(arrayOf("*/*")) }) {
                if (busy) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp) else Icon(Icons.Outlined.AttachFile, null, Modifier.size(18.dp))
                Text("  Add file")
            }
        }
        if (task.files.isEmpty()) Text("PDFs, documents, sheets… up to 10 MB each.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        task.files.forEach { f -> FileRow(store, task, team, f, me) }
    }
}

@Composable
private fun FileRow(store: Store, task: Task, team: Team?, f: TaskFile, me: String?) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var opening by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().padding(vertical = 3.dp).clip(RoundedCornerShape(12.dp)).background(LocalExtra.current.surfaceHighest)
            .clickable(enabled = !opening) {
                opening = true
                scope.launch {
                    try {
                        openBytes(context, "files/${f.id}", f.name, f.mime, store.downloadFile(f))
                    } catch (e: ApiException) {
                        store.toast(e.message ?: "Couldn't open the file")
                    } finally {
                        opening = false
                    }
                }
            }.padding(start = 12.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FileIcon(f.mime)
        Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
            Text(f.name, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(fileSize(f.size), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (opening) CircularProgressIndicator(Modifier.padding(end = 12.dp).size(18.dp), strokeWidth = 2.dp)
        else Icon(Icons.Outlined.Download, "Open ${f.name}", Modifier.padding(end = 4.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        if (f.addedBy == me || task.assignee == me || task.teamId == null || team?.isAdmin == true) {
            IconButton(onClick = { scope.launch { try { store.deleteFile(f.id); store.toast("File removed") } catch (e: ApiException) { store.toast(e.message ?: "Couldn't remove it") } } }) {
                Icon(Icons.Outlined.DeleteOutline, "Remove ${f.name}")
            }
        }
    }
}

// ---- Comments ------------------------------------------------------------------------------

@Composable
fun Comments(store: Store, task: Task, team: Team?) {
    val teams by store.teams.collectAsStateWithLifecycle()
    val sync by store.sync.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val me = LocalMyUid.current
    var text by remember(task.id) { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember(task.id) { mutableStateOf<String?>(null) }
    LaunchedEffect(task.id) {
        try {
            store.loadComments(task.id)
        } catch (e: ApiException) {
            error = if (e.status == 0) "Connect to see the comments." else e.message
        }
    }
    val list: List<Comment> = teams.comments[task.id] ?: emptyList()
    Column {
        SectionTitle(Icons.Outlined.ChatBubbleOutline, "Comments" + if (list.isNotEmpty()) " · ${list.size}" else "")
        if (error != null && teams.comments[task.id] == null) Text(error!!, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        list.forEach { c ->
            val mine = c.uid == me
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.Top) {
                PersonMark(com.skienlabs.tasks.data.Member(c.uid, name = c.name), 28.dp)
                Column(
                    Modifier.weight(1f).padding(start = 8.dp)
                        .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 14.dp, bottomEnd = 14.dp, bottomStart = 14.dp))
                        .background(if (mine) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f) else LocalExtra.current.surfaceHighest)
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(if (mine) "You" else c.name, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                        Text("  " + ago(c.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                        if (mine || team?.isAdmin == true) {
                            Icon(
                                Icons.Outlined.DeleteOutline, "Delete comment",
                                Modifier.size(18.dp).clip(CircleShape).clickable(enabled = sync.online) {
                                    scope.launch { try { store.deleteComment(task.id, c.id) } catch (e: ApiException) { store.toast(e.message ?: "Couldn't delete it") } }
                                },
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    Text(c.text, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        if (team?.archived != true) {
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    text, { text = it.take(2000) }, Modifier.weight(1f), placeholder = { Text(if (sync.online) "Write a comment…" else "Comments need a connection") },
                    enabled = sync.online, maxLines = 5, shape = RoundedCornerShape(16.dp),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                )
                IconButton(enabled = text.isNotBlank() && !busy && sync.online, onClick = {
                    busy = true
                    scope.launch {
                        try {
                            store.postComment(task.id, text)
                            text = ""
                        } catch (e: ApiException) {
                            store.toast(e.message ?: "Couldn't send it")
                        } finally {
                            busy = false
                        }
                    }
                }) { if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else Icon(Icons.AutoMirrored.Outlined.Send, "Send comment", tint = MaterialTheme.colorScheme.primary) }
            }
        }
    }
}

// ---- Sign-off and reminders -----------------------------------------------------------------

@Composable
fun ReviewActions(store: Store, task: Task, team: Team) {
    val me = LocalMyUid.current
    if (!canManage(task, team, me) || team.archived) return
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf("") }
    var returning by remember(task.id) { mutableStateOf(false) }
    var note by remember(task.id) { mutableStateOf("") }
    fun run(kind: String, done: String, block: suspend () -> Unit) {
        busy = kind
        scope.launch {
            try {
                block(); store.toast(done); returning = false; note = ""
            } catch (e: ApiException) {
                store.toast(e.message ?: "Something went wrong")
            } finally {
                busy = ""
            }
        }
    }
    val x = LocalExtra.current
    Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (task.review == "waiting") {
            Text(
                "Finished and waiting for your review.", style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color(0xFFFDD663).copy(alpha = 0.18f)).padding(12.dp),
            )
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (task.review == "waiting") {
                Button(enabled = busy.isEmpty(), colors = ButtonDefaults.buttonColors(containerColor = x.done, contentColor = if (x.dark) Color.Black else Color.White),
                    onClick = { run("approve", "Approved") { store.reviewTask(team.id, task, approve = true) } }) {
                    Icon(Icons.Outlined.Verified, null, Modifier.size(18.dp)); Text("  Approve")
                }
                OutlinedButton(enabled = busy.isEmpty(), onClick = { returning = !returning }) {
                    Icon(Icons.AutoMirrored.Outlined.Undo, null, Modifier.size(18.dp), tint = x.overdue); Text("  Send back", color = x.overdue)
                }
            }
            if (task.isPending && task.assignee != me) {
                OutlinedButton(enabled = busy.isEmpty(), onClick = { run("nudge", "Reminder sent") { store.nudge(team.id, task) } }) {
                    Icon(Icons.Outlined.NotificationsActive, null, Modifier.size(18.dp)); Text("  Remind")
                }
            }
        }
        if (returning) {
            OutlinedTextField(note, { note = it.take(2000) }, Modifier.fillMaxWidth(), label = { Text("What needs another look?") }, minLines = 2)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = { returning = false }) { Text("Cancel") }
                Button(enabled = busy.isEmpty(), onClick = { run("return", "Sent back") { store.reviewTask(team.id, task, approve = false, note = note) } }) { Text("Send back") }
            }
        }
    }
}

/** Everything team-related in a task's details: sign-off, files, comments. My own tasks get files only. */
@Composable
fun TaskTeamSection(task: Task) {
    val store = LocalStore.current ?: return
    val me = LocalMyUid.current
    if (task.teamId == null) {
        TaskFiles(store, task, null, canAdd = true, asAdmin = false)
        return
    }
    val team = LocalTeams.current.team(task.teamId) ?: return
    val manage = canManage(task, team, me)
    Column {
        if (task.review != null || task.needsReview || task.closedBy != null) {
            Row(Modifier.padding(top = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                ReviewChip(task)
                if (task.review == "waiting" && task.assignee == me && !manage) {
                    Text("  An admin will look at it soon.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        ReviewActions(store, task, team)
        TaskFiles(store, task, team, canAdd = !team.archived && (manage || task.assignee == me), asAdmin = manage && task.assignee != me)
        Comments(store, task, team)
    }
}

// ---- Notifications ---------------------------------------------------------------------------

@Composable
fun NotificationsButton(store: Store, onOpen: (AppNotification) -> Unit) {
    val teams by store.teams.collectAsStateWithLifecycle()
    var open by remember { mutableStateOf(false) }
    IconButton(onClick = { open = true }) {
        if (teams.unread > 0) {
            BadgedBox(badge = { Badge { Text(if (teams.unread > 99) "99+" else "${teams.unread}") } }) {
                Icon(Icons.Outlined.Notifications, "Notifications, ${teams.unread} new")
            }
        } else Icon(Icons.Outlined.NotificationsNone, "Notifications")
    }
    if (open) NotificationsSheet(store, onDismiss = { open = false }, onOpen = { open = false; onOpen(it) })
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsSheet(store: Store, onDismiss: () -> Unit, onOpen: (AppNotification) -> Unit) {
    val teams by store.teams.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { runCatching { store.loadNotifications() } }
    ModalBottomSheet(onDismissRequest = {
        if (teams.unread > 0) scope.launch { runCatching { store.markNotificationsRead() } }
        onDismiss()
    }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 12.dp).padding(bottom = 16.dp).verticalScroll(rememberScrollState())) {
            Row(Modifier.padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Notifications", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                if (teams.unread > 0) TextButton(onClick = { scope.launch { runCatching { store.markNotificationsRead() } } }) { Text("Mark all read") }
            }
            if (teams.notifications.isEmpty()) {
                Text(
                    "Nothing yet. Team news shows up here: new tasks, comments, reviews and reminders.",
                    Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            teams.notifications.forEach { n ->
                val team = teams.team(n.teamId)
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 2.dp).clip(RoundedCornerShape(14.dp))
                        .background(if (n.read) Color.Transparent else MaterialTheme.colorScheme.primary.copy(alpha = 0.07f))
                        .clickable {
                            if (!n.read) scope.launch { runCatching { store.markNotificationsRead(n.id) } }
                            onOpen(n)
                        }.padding(10.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    if (team != null) TeamMark(team, 36.dp) else Box(Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(LocalExtra.current.chip))
                    Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                        Text(n.title, style = MaterialTheme.typography.bodyMedium, fontWeight = if (n.read) FontWeight.Normal else FontWeight.SemiBold)
                        n.body?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    Text(ago(n.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

// ---- Joining by link ----------------------------------------------------------------------

/** The token in an invite link ("https://…/join/AbC…"), or the token itself. */
fun joinTokenOf(text: String): String? {
    val t = text.trim()
    Regex("/join/([A-Za-z0-9_-]{16,64})").find(t)?.let { return it.groupValues[1] }
    return t.takeIf { Regex("^[A-Za-z0-9_-]{16,64}$").matches(it) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JoinSheet(store: Store, initialToken: String?, onDismiss: () -> Unit, onOpenTeam: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var link by remember { mutableStateOf(initialToken ?: "") }
    var info by remember { mutableStateOf<JoinInfo?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    fun look(token: String) {
        busy = true; error = null
        scope.launch {
            try {
                info = store.lookupJoin(token)
            } catch (e: ApiException) {
                error = e.message
            } finally {
                busy = false
            }
        }
    }
    LaunchedEffect(initialToken) { initialToken?.let { look(it) } }
    ModalBottomSheet(onDismissRequest = { if (!busy) onDismiss() }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier.fillMaxWidth().imePadding().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val i = info
            if (i == null) {
                Text("Join with a link", style = MaterialTheme.typography.titleLarge, modifier = Modifier.fillMaxWidth())
                Text("Paste the invite link someone sent you (or scan their QR code with your camera).", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(link, { link = it; error = null }, Modifier.fillMaxWidth(), label = { Text("Invite link") }, singleLine = true)
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.fillMaxWidth()) }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text("Cancel") }
                    Button(enabled = !busy && joinTokenOf(link) != null, onClick = { joinTokenOf(link)?.let { look(it) } }) { Text("Find team") }
                }
            } else {
                TeamMark(i.team.name, i.team.color, 72.dp, i.team.logo)
                Text(i.team.name, style = MaterialTheme.typography.headlineSmall)
                Text("${i.team.memberCount} ${if (i.team.memberCount == 1) "person" else "people"}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                when (i.status) {
                    "member" -> {
                        Text("You're already in this team.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Button(onClick = { onOpenTeam(i.team.id) }) { Text("Open team") }
                    }
                    "requested" -> {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.HourglassTop, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("  Request sent. You'll be told when an admin lets you in.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Button(onClick = onDismiss) { Text("Done") }
                    }
                    else -> {
                        Text("Ask to join and one of its admins lets you in.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(onClick = onDismiss) { Text("Not now") }
                            Button(enabled = !busy, onClick = {
                                busy = true
                                scope.launch {
                                    try {
                                        val token = joinTokenOf(link) ?: initialToken ?: ""
                                        info = i.copy(status = store.requestJoin(token))
                                    } catch (e: ApiException) {
                                        error = e.message
                                    } finally {
                                        busy = false
                                    }
                                }
                            }) { Icon(Icons.Outlined.GroupAdd, null, Modifier.size(18.dp)); Text("  Ask to join") }
                        }
                    }
                }
            }
        }
    }
}

// ---- A team task, in full (admins, or whoever gave it) --------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BoardTaskSheet(store: Store, team: Team, taskIn: Task, today: String, onEdit: (Task) -> Unit, onDismiss: () -> Unit) {
    val teams by store.teams.collectAsStateWithLifecycle()
    val task = teams.boards[team.id]?.tasks?.firstOrNull { it.id == taskIn.id } ?: taskIn
    val me = LocalMyUid.current
    val x = LocalExtra.current
    val manage = canManage(task, team, me)
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var addingImage by remember { mutableStateOf(false) }
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(5)) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        scope.launch {
            addingImage = true
            try {
                for (u in uris) store.addTeamImage(team.id, task, com.skienlabs.tasks.ui.images.prepareImage(context, u))
            } catch (e: ApiException) {
                store.toast(e.message ?: "Couldn't add the image")
            } catch (e: IllegalArgumentException) {
                store.toast(e.message ?: "Couldn't read the image")
            } finally {
                addingImage = false
            }
        }
    }
    val person = team.member(task.assignee)
    val giver = team.member(task.assignedBy)
    val siblings = task.groupId?.let { g -> teams.boards[team.id]?.tasks?.filter { it.groupId == g && it.id != task.id } } ?: emptyList()
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 24.dp),
        ) {
            Row(verticalAlignment = Alignment.Top) {
                Text(
                    task.title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f),
                    textDecoration = if (task.isPending) null else TextDecoration.LineThrough,
                )
                if (manage && !team.archived) IconButton(onClick = { onEdit(task) }) { Icon(Icons.Outlined.Edit, "Edit task") }
            }
            FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PersonMark(person, 20.dp)
                    Text(" ${person?.name ?: "Former member"} · ${com.skienlabs.tasks.data.Dates.shortLabel(task.date, today)}", style = MaterialTheme.typography.bodyMedium)
                }
                if (task.dueAt != null) DueChip(task)
                ReviewChip(task)
                TeamTagChips(task, team)
            }
            Text(
                listOfNotNull(
                    when { task.isDone -> "Done"; task.isCancelled -> "Cancelled"; else -> "Open" },
                    giver?.let { "given by ${if (it.uid == me) "you" else it.name}" },
                    if (task.postponed > 0) "postponed ${if (task.postponed == 1) "once" else "${task.postponed} times"}" else null,
                    if (task.recurringId != null) "repeats" else null,
                    task.groupMode?.let { if (it == "first") "first one to finish closes it" else "each does their own" },
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp),
            )
            if (siblings.isNotEmpty()) {
                FlowRow(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    siblings.forEach { s ->
                        Row(Modifier.clip(RoundedCornerShape(50)).background(x.chip).padding(horizontal = 8.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(if (s.isDone) Icons.Filled.CheckCircle else Icons.Outlined.RadioButtonUnchecked, null, Modifier.size(14.dp), tint = if (s.isDone) x.done else MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(" " + (team.member(s.assignee)?.name ?: "Former member") + if (s.closedBy != null) " · closed" else "", style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
            }
            if (task.notes.isNotBlank()) Text(task.notes, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = 12.dp))
            if (task.subtasks.isNotEmpty()) {
                val p = com.skienlabs.tasks.data.Steps.progress(task.subtasks)
                Text("Steps · ${p.done}/${p.total}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp))
                LinearProgressIndicator(
                    progress = { if (p.total == 0) 0f else p.done.toFloat() / p.total },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).height(6.dp).clip(RoundedCornerShape(3.dp)),
                    color = x.done, trackColor = x.chip, drawStopIndicator = {},
                )
                task.subtasks.filter { it.parentId == null }.forEach { s ->
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 2.dp)) {
                        Icon(if (s.done) Icons.Filled.CheckCircle else Icons.Outlined.RadioButtonUnchecked, null, Modifier.size(18.dp), tint = if (s.done) x.done else MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("  " + s.title, style = MaterialTheme.typography.bodyMedium, textDecoration = if (s.done) TextDecoration.LineThrough else null)
                    }
                }
            }
            if (task.attachments.isNotEmpty() || (manage && !team.archived)) {
                Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Images" + if (task.attachments.isNotEmpty()) " · ${task.attachments.size}" else "", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                    if (manage && !team.archived) TextButton(enabled = !addingImage, onClick = {
                        imagePicker.launch(androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                    }) { Text(if (addingImage) "Adding…" else "Add image") }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    task.attachments.forEachIndexed { i, a -> com.skienlabs.tasks.ui.images.Thumb(a, 72.dp, label = "Image ${i + 1}", onClick = {}) }
                }
            }
            ReviewActions(store, task, team)
            TaskFiles(store, task, team, canAdd = manage && !team.archived, asAdmin = task.assignee != me)
            Comments(store, task, team)
            if (team.isAdmin && !team.archived && !task.isPending) {
                TextButton(onClick = {
                    scope.launch {
                        try { store.updateTeamTask(team.id, task, kotlinx.serialization.json.buildJsonObject { put("status", kotlinx.serialization.json.JsonPrimitive("pending")) }); store.toast("Opened again") }
                        catch (e: ApiException) { store.toast(e.message ?: "Couldn't open it again") }
                    }
                }, modifier = Modifier.padding(top = 8.dp)) { Text("Open it again") }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
fun QrImage(dataUrl: String, sizeDp: Int = 168) {
    val bmp = remember(dataUrl) { dataUrlBitmap(dataUrl) } ?: return
    Image(
        bmp.asImageBitmap(), "QR code for the invite link",
        Modifier.size(sizeDp.dp).clip(RoundedCornerShape(12.dp)).background(Color.White).border(1.dp, LocalExtra.current.outline, RoundedCornerShape(12.dp)).padding(6.dp),
    )
}

@Composable
fun Spacer8() = Spacer(Modifier.width(8.dp))

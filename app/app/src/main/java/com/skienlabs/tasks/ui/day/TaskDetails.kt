package com.skienlabs.tasks.ui.day

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Notes
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.EventRepeat
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.outlined.Replay
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skienlabs.tasks.data.Dates
import com.skienlabs.tasks.data.Steps
import com.skienlabs.tasks.data.Tag
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.ui.common.TagChip
import com.skienlabs.tasks.ui.images.ImageViewer
import com.skienlabs.tasks.ui.images.Thumb
import com.skienlabs.tasks.ui.theme.LocalExtra
import com.skienlabs.tasks.ui.theme.Palette
import java.text.DateFormat
import java.util.Date

private fun whenLabel(ms: Long): String = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(ms))

/**
 * Everything about one task, read-only, like the web app's details pane. Tapping a task opens
 * this; editing is under ⋮ → Edit. Steps can be ticked right here.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskDetailsSheet(task: Task, tags: List<Tag>, today: String, actions: RowActions, onDismiss: () -> Unit) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet) {
        TaskDetails(task, tags, today, actions, onDismiss)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TaskDetails(task: Task, tags: List<Tag>, today: String, actions: RowActions, onClose: () -> Unit) {
    val x = LocalExtra.current
    var menu by remember { mutableStateOf(false) }
    var tagMenu by remember { mutableStateOf(false) }
    var viewer by remember { mutableStateOf<Int?>(null) }
    viewer?.let { start -> ImageViewer(task.attachments, start) { viewer = null } }
    val taskTags = remember(task.tagIds, tags) { task.tagIds.mapNotNull { id -> tags.firstOrNull { it.id == id } } }
    val postponeLabel = Dates.shortLabel(Dates.postponeTarget(task.date, today), today).let { if (it == "Tomorrow") "Postpone to tomorrow" else "Postpone to $it" }
    val progress = Steps.progress(task.subtasks)
    val (statusLabel, statusIcon, statusColor) = when {
        task.isDone -> Triple("Done", Icons.Filled.CheckCircle, x.done)
        task.isCancelled -> Triple("Cancelled", Icons.Filled.Block, MaterialTheme.colorScheme.onSurfaceVariant)
        else -> Triple("Open", Icons.Outlined.RadioButtonUnchecked, MaterialTheme.colorScheme.primary)
    }

    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(start = 20.dp, end = 8.dp, bottom = 20.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.clip(RoundedCornerShape(50)).background(x.surfaceHighest).padding(horizontal = 10.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(statusIcon, null, Modifier.size(15.dp), tint = statusColor)
                Text("  $statusLabel", color = statusColor, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
            }
            Box(Modifier.weight(1f))
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreVert, "More actions for \"${task.title}\"") }
                TaskMenu(menu, { menu = false }, task, today, postponeLabel, actions.copy(delete = { actions.delete(it); onClose() })) { tagMenu = true }
                TagMenu(tagMenu, { tagMenu = false }, tags, task.tagIds, { actions.setTags(task, it) }, actions.manageTags)
            }
            IconButton(onClick = onClose) { Icon(Icons.Outlined.Close, "Close details") }
        }

        Column(Modifier.padding(end = 12.dp)) {
            Text(
                task.title,
                style = MaterialTheme.typography.headlineSmall.copy(fontSize = 24.sp, lineHeight = 30.sp),
                color = if (task.isPending) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                textDecoration = if (task.isPending) null else TextDecoration.LineThrough,
                modifier = Modifier.padding(top = 10.dp).semantics { heading() },
            )
            if (task.isCarried) Box(Modifier.padding(top = 8.dp)) { CarriedBadge(task, today, muted = !task.isPending) }

            Row(Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (task.isPending) {
                    Button(onClick = { actions.toggle(task) }) { Icon(Icons.Outlined.TaskAlt, null, Modifier.size(18.dp)); Text("  Complete") }
                    OutlinedButton(onClick = { actions.postpone(task) }) { Icon(Icons.Outlined.EventRepeat, null, Modifier.size(18.dp)); Text("  Postpone") }
                } else {
                    Button(onClick = { actions.toggle(task) }) { Icon(Icons.Outlined.Replay, null, Modifier.size(18.dp)); Text(if (task.isDone) "  Mark not done" else "  Restore") }
                }
            }

            HorizontalDivider(Modifier.padding(top = 16.dp, bottom = 6.dp))
            Fact(Icons.Outlined.Event, "Date") {
                Text("${Dates.relativeLabel(task.date, today)} · ${Dates.longDate(task.date)}", style = MaterialTheme.typography.bodyMedium)
            }
            Fact(if (task.priority < 4) Icons.Filled.Flag else Icons.Outlined.Flag, "Priority", if (task.priority < 4) Palette.priority(task.priority, x.dark) else null) {
                Text(Palette.priorityLabel(task.priority), style = MaterialTheme.typography.bodyMedium)
            }
            Fact(Icons.Outlined.Sell, "Tags") {
                if (taskTags.isEmpty()) Text("None", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                else FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) { taskTags.forEach { TagChip(it, dense = true) } }
            }
            task.carriedFrom?.takeIf { task.isCarried }?.let { from ->
                Fact(Icons.Outlined.History, "First due", if (task.isPending) x.overdue else null) {
                    Text("${Dates.longDate(from)} · moved here by itself", style = MaterialTheme.typography.bodyMedium)
                }
            }
            if (task.postponed > 0) {
                Fact(Icons.Outlined.EventRepeat, "Postponed") {
                    Text(if (task.postponed == 1) "Once" else "${task.postponed} times", style = MaterialTheme.typography.bodyMedium)
                }
            }
            if (task.createdAt > 946_684_800_000L) Fact(Icons.Outlined.Schedule, "Created") { Text(whenLabel(task.createdAt), style = MaterialTheme.typography.bodyMedium) }
            task.completedAt?.takeIf { task.isDone }?.let { Fact(Icons.Filled.CheckCircle, "Completed", x.done) { Text(whenLabel(it), style = MaterialTheme.typography.bodyMedium) } }

            if (task.notes.isNotBlank()) {
                SectionTitle(Icons.AutoMirrored.Outlined.Notes, "Details")
                Text(task.notes, style = MaterialTheme.typography.bodyLarge.copy(lineHeight = 24.sp))
            }
            if (task.subtasks.isNotEmpty()) {
                SectionTitle(Icons.Outlined.Checklist, "Steps · ${progress.done}/${progress.total}")
                LinearProgressIndicator(
                    progress = { if (progress.total == 0) 0f else progress.done.toFloat() / progress.total },
                    modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                    color = if (progress.complete) x.done else MaterialTheme.colorScheme.primary,
                    trackColor = x.surfaceHighest,
                    drawStopIndicator = {},
                )
                StepsInline(task.subtasks, enabled = !task.isCancelled) { actions.toggleStep(task, it) }
            }
            if (task.attachments.isNotEmpty()) {
                SectionTitle(Icons.Outlined.Image, "Images · ${task.attachments.size}")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    task.attachments.forEachIndexed { i, a ->
                        Thumb(a, 96.dp, label = "Open image ${i + 1} of ${task.attachments.size}", onClick = { viewer = i })
                    }
                }
            }
        }
    }
}

@Composable
private fun Fact(icon: ImageVector, label: String, tint: androidx.compose.ui.graphics.Color? = null, value: @Composable () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.Top) {
        Icon(icon, null, Modifier.size(18.dp), tint = tint ?: MaterialTheme.colorScheme.onSurfaceVariant)
        Text(label, Modifier.padding(start = 12.dp).width(92.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Box(Modifier.weight(1f)) { value() }
    }
}

@Composable
private fun SectionTitle(icon: ImageVector, text: String) {
    Row(Modifier.padding(top = 20.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            "  " + text.uppercase(), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.6.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

package com.skienlabs.tasks.ui.day

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Notes
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.EventRepeat
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Replay
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.Deferred
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.foundation.layout.widthIn
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skienlabs.tasks.data.Counts
import com.skienlabs.tasks.data.Dates
import com.skienlabs.tasks.data.MAX_TAGS_PER_TASK
import com.skienlabs.tasks.data.Tag
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.ui.common.TagAvatar
import com.skienlabs.tasks.ui.images.ImageStrip
import com.skienlabs.tasks.ui.images.ImageViewer
import androidx.compose.runtime.saveable.rememberSaveable
import com.skienlabs.tasks.ui.common.TagChip
import com.skienlabs.tasks.ui.common.tagColor
import com.skienlabs.tasks.ui.theme.LocalExtra
import com.skienlabs.tasks.ui.theme.Palette

// ---- Week strip ------------------------------------------------------------------

@Composable
fun WeekStrip(date: String, today: String, summary: (String) -> Counts?, onSelect: (String) -> Unit) {
    val x = LocalExtra.current
    val start = Dates.startOfWeek(date)
    val letters = remember { Dates.weekdayLetters() }
    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        for (i in 0 until 7) {
            val d = Dates.addDays(start, i.toLong())
            val selected = d == date
            val isToday = d == today
            val c = summary(d)
            val bg by animateColorAsState(if (selected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent, label = "day")
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(20.dp)).background(bg)
                    .clickable(role = Role.Tab) { onSelect(d) }
                    .semantics { contentDescription = Dates.fullLabel(d) }
                    .padding(vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(letters[i], style = MaterialTheme.typography.labelSmall, color = if (isToday) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                Box(
                    Modifier.padding(top = 2.dp).size(32.dp).clip(CircleShape).background(if (isToday) MaterialTheme.colorScheme.primary else Color.Transparent),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        d.takeLast(2).trimStart('0'),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = if (isToday || selected) FontWeight.Bold else FontWeight.Normal,
                        color = if (isToday) MaterialTheme.colorScheme.onPrimary else if (selected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface,
                    )
                }
                // Progress line: green = done, blue = left, red = left on a past day.
                Box(Modifier.padding(top = 4.dp).width(22.dp).height(4.dp)) {
                    if (c != null && c.active > 0) {
                        val left = c.pending.toFloat() / c.active
                        val leftColor = if (d < today) x.overdue else x.pending
                        Box(Modifier.fillMaxSize().clip(RoundedCornerShape(50)).drawBehind {
                            drawRect(x.done, size = Size(size.width * (1 - left), size.height))
                            drawRect(leftColor, topLeft = Offset(size.width * (1 - left), 0f), size = Size(size.width * left, size.height))
                        })
                    }
                }
            }
        }
    }
}

// ---- Tag filter row --------------------------------------------------------------

@Composable
fun TagFilterRow(tags: List<Tag>, selected: String?, onSelect: (String?) -> Unit, onManage: () -> Unit) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
    ) {
        item(key = "all") {
            val on = selected == null
            Box(
                Modifier.clip(RoundedCornerShape(50))
                    .background(if (on) MaterialTheme.colorScheme.primaryContainer else Color.Transparent)
                    .border(1.dp, if (on) Color.Transparent else LocalExtra.current.outline, RoundedCornerShape(50))
                    .clickable(role = Role.Tab) { onSelect(null) }
                    .heightIn(min = 34.dp).padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("All", style = MaterialTheme.typography.labelLarge, color = if (on) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        items(tags, key = { it.id }) { tag ->
            TagChip(tag, selected = selected == tag.id, onClick = { onSelect(if (selected == tag.id) null else tag.id) })
        }
        item(key = "manage") {
            IconButton(onClick = onManage, modifier = Modifier.size(34.dp)) {
                Icon(Icons.Outlined.Sell, "Manage tags", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// ---- Quick add -------------------------------------------------------------------

@Composable
fun QuickAdd(
    tags: List<Tag>,
    defaultTagId: String?,
    onAdd: (title: String, priority: Int, tagIds: List<String>) -> Deferred<Boolean>,
    onManageTags: () -> Unit,
    focusRequester: FocusRequester,
) {
    var text by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    var priority by remember { mutableStateOf(4) }
    // Tags stay selected between adds (handy when entering several tasks for one company).
    var tagIds by remember(defaultTagId) { mutableStateOf(listOfNotNull(defaultTagId)) }
    var tagMenu by remember { mutableStateOf(false) }
    var prioMenu by remember { mutableStateOf(false) }
    val x = LocalExtra.current
    val selectedTags = tagIds.mapNotNull { id -> tags.firstOrNull { it.id == id } }

    fun submit() {
        val t = text.trim()
        if (t.isEmpty()) return
        val saved = onAdd(t, priority, selectedTags.map { it.id })
        val p = priority
        text = ""
        priority = 4
        // If the server refuses it, put the text back so nothing typed is lost.
        scope.launch { if (!saved.await() && text.isEmpty()) { text = t; priority = p } }
    }

    TextField(
        value = text,
        onValueChange = { text = it.take(500) },
        placeholder = { Text("Add a task") },
        leadingIcon = { Icon(Icons.Filled.Add, null, tint = MaterialTheme.colorScheme.primary) },
        trailingIcon = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box {
                    IconButton(onClick = { tagMenu = true }) {
                        if (selectedTags.isEmpty()) Icon(Icons.Outlined.Sell, "Set tags")
                        else Row(Modifier.semantics { contentDescription = "Tags: ${selectedTags.joinToString { it.name }}" }) {
                            selectedTags.take(3).forEach { TagAvatar(it, 20.dp) }
                        }
                    }
                    TagMenu(tagMenu, { tagMenu = false }, tags, tagIds, { tagIds = it }, onManageTags)
                }
                Box {
                    IconButton(onClick = { prioMenu = true }) {
                        Icon(if (priority == 4) Icons.Outlined.Flag else Icons.Filled.Flag, "Priority: ${Palette.priorityLabel(priority)}", tint = Palette.priority(priority, x.dark))
                    }
                    PriorityMenu(prioMenu, { prioMenu = false }, priority) { priority = it }
                }
            }
        },
        singleLine = true,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { submit() }), // keeps the keyboard open for the next task
        shape = RoundedCornerShape(28.dp),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = x.surfaceHigh, unfocusedContainerColor = x.surfaceHigh,
            focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent,
        ),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).focusRequester(focusRequester),
    )
}

@Composable
fun TagMenu(open: Boolean, onDismiss: () -> Unit, tags: List<Tag>, selected: List<String>, onChange: (List<String>) -> Unit, onManage: () -> Unit) {
    DropdownMenu(expanded = open, onDismissRequest = onDismiss) {
        if (tags.isEmpty()) {
            Text("No tags yet. Create one per company or project.", Modifier.padding(16.dp).width(240.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        val full = selected.size >= MAX_TAGS_PER_TASK
        tags.forEach { tag ->
            val on = tag.id in selected
            DropdownMenuItem(
                text = { Text(tag.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                leadingIcon = { TagAvatar(tag, 22.dp) },
                trailingIcon = { Checkbox(checked = on, onCheckedChange = null) },
                enabled = on || !full,
                onClick = { onChange(if (on) selected - tag.id else selected + tag.id) },
            )
        }
        if (full) Text("Up to $MAX_TAGS_PER_TASK tags per task", Modifier.padding(horizontal = 16.dp, vertical = 4.dp), style = MaterialTheme.typography.labelSmall)
        HorizontalDivider()
        DropdownMenuItem(text = { Text(if (tags.isEmpty()) "Create a tag" else "Manage tags") }, leadingIcon = { Icon(Icons.Outlined.Sell, null) }, onClick = { onDismiss(); onManage() })
    }
}

@Composable
fun PriorityMenu(open: Boolean, onDismiss: () -> Unit, current: Int, onPick: (Int) -> Unit) {
    val dark = LocalExtra.current.dark
    DropdownMenu(expanded = open, onDismissRequest = onDismiss) {
        for (p in 1..4) {
            DropdownMenuItem(
                text = { Text(Palette.priorityLabel(p)) },
                leadingIcon = { Icon(if (p == 4) Icons.Outlined.Flag else Icons.Filled.Flag, null, tint = Palette.priority(p, dark)) },
                trailingIcon = { if (p == current) Icon(Icons.Filled.Check, null, tint = MaterialTheme.colorScheme.primary) },
                onClick = { onPick(p); onDismiss() },
            )
        }
    }
}

// ---- Task row --------------------------------------------------------------------

data class RowActions(
    val open: (Task) -> Unit,
    val toggle: (Task) -> Unit,
    val postpone: (Task) -> Unit,
    val cancel: (Task) -> Unit,
    val delete: (Task) -> Unit,
    val moveToToday: (Task) -> Unit,
    val setPriority: (Task, Int) -> Unit,
    val setTags: (Task, List<String>) -> Unit,
    val manageTags: () -> Unit,
    val toggleStep: (Task, String) -> Unit = { _, _ -> },
    /** Tap on a task: show its details. Editing ([open]) is under ⋮ → Edit. */
    val view: (Task) -> Unit = open,
)

/**
 * One task. Swipe right to complete, swipe left to postpone (pending tasks only).
 * Tap to see its details; the ⋮ menu (or a long press) has Edit and everything else.
 */
@Composable
fun TaskRow(task: Task, tags: List<Tag>, today: String, showOrigin: Boolean, actions: RowActions, containerColor: Color = MaterialTheme.colorScheme.background) {
    val x = LocalExtra.current
    val haptics = LocalHapticFeedback.current
    val current by rememberUpdatedState(task)
    val state = rememberSwipeToDismissBoxState()
    val scope = rememberCoroutineScope()
    var menu by remember { mutableStateOf(false) }
    var tagMenu by remember { mutableStateOf(false) }
    var stepsOpen by rememberSaveable(task.id) { mutableStateOf(false) }
    var viewer by remember { mutableStateOf<Int?>(null) }
    viewer?.let { start -> ImageViewer(task.attachments, start) { viewer = null } }
    val rowTags = remember(task.tagIds, tags) { task.tagIds.mapNotNull { id -> tags.firstOrNull { it.id == id } } }
    val target = Dates.postponeTarget(task.date, today)
    val postponeLabel = Dates.shortLabel(target, today).let { if (it == "Tomorrow") "Postpone to tomorrow" else "Postpone to $it" }

    SwipeToDismissBox(
        state = state,
        enableDismissFromStartToEnd = task.isPending,
        enableDismissFromEndToStart = task.isPending,
        onDismiss = { direction ->
            haptics.performHapticFeedback(HapticFeedbackType.Confirm)
            when (direction) {
                SwipeToDismissBoxValue.StartToEnd -> actions.toggle(current)
                SwipeToDismissBoxValue.EndToStart -> actions.postpone(current)
                else -> Unit
            }
            scope.launch { state.snapTo(SwipeToDismissBoxValue.Settled) }
        },
        backgroundContent = {
            val dir = state.dismissDirection
            val color = when (dir) {
                SwipeToDismissBoxValue.StartToEnd -> x.done
                SwipeToDismissBoxValue.EndToStart -> x.postponed
                else -> Color.Transparent
            }
            val alpha by animateFloatAsState(if (state.progress > 0.05f && dir != SwipeToDismissBoxValue.Settled) 1f else 0f, label = "swipe")
            Box(
                Modifier.fillMaxSize().padding(horizontal = 12.dp, vertical = 2.dp).clip(RoundedCornerShape(16.dp)).background(color.copy(alpha = 0.22f * alpha)),
                contentAlignment = if (dir == SwipeToDismissBoxValue.StartToEnd) Alignment.CenterStart else Alignment.CenterEnd,
            ) {
                if (dir == SwipeToDismissBoxValue.StartToEnd) {
                    Row(Modifier.padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.CheckCircle, null, tint = color); Text("  Complete", color = color, style = MaterialTheme.typography.labelLarge)
                    }
                } else if (dir == SwipeToDismissBoxValue.EndToStart) {
                    Row(Modifier.padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(postponeLabel.removePrefix("Postpone to ").replaceFirstChar { it.uppercase() } + "  ", color = color, style = MaterialTheme.typography.labelLarge)
                        Icon(Icons.Outlined.EventRepeat, null, tint = color)
                    }
                }
            }
        },
    ) {
        val spine = rowTags.take(4).map { tagColor(it.color) }
        val wash = spine.firstOrNull()?.copy(alpha = if (x.dark) 0.09f else 0.07f)
        // Moved here by itself from an earlier day and still open: red outline, like the web app.
        val late = task.isPending && (task.isCarried || showOrigin)
        val lateShape = RoundedCornerShape(16.dp)
        Row(
            Modifier.fillMaxWidth()
                .then(
                    if (late) Modifier.padding(horizontal = 12.dp, vertical = 3.dp).clip(lateShape)
                        .border(1.dp, x.overdueBorder, lateShape).background(x.overdueBg)
                    else Modifier.background(containerColor),
                )
                .combinedClickable(onClick = { actions.view(task) }, onLongClick = { haptics.performHapticFeedback(HapticFeedbackType.LongPress); menu = true })
                .drawBehind {
                    // A soft wash of the first tag's colour, fading in from the left (open tasks only).
                    if (wash != null && task.isPending) {
                        drawRect(androidx.compose.ui.graphics.Brush.horizontalGradient(listOf(wash, Color.Transparent), endX = size.width * 0.42f))
                    }
                    // Tag spine: a slim rounded bar set inside the edge, one segment per tag.
                    if (spine.isNotEmpty()) {
                        val gap = 3.dp.toPx()
                        val top = 14.dp.toPx()
                        val h = size.height - top * 2
                        val seg = (h - gap * (spine.size - 1)) / spine.size
                        val w = 4.dp.toPx()
                        spine.forEachIndexed { i, c ->
                            drawRoundRect(
                                c.copy(alpha = if (task.isPending) 1f else 0.35f),
                                Offset(7.dp.toPx(), top + i * (seg + gap)), Size(w, seg), CornerRadius(w / 2),
                            )
                        }
                    }
                }
                .padding(start = 8.dp, end = 4.dp, top = 2.dp, bottom = 2.dp),
            verticalAlignment = Alignment.Top,
        ) {
            CheckCircle(task) { haptics.performHapticFeedback(HapticFeedbackType.Confirm); actions.toggle(task) }
            Column(Modifier.weight(1f).padding(top = 12.dp, bottom = 10.dp)) {
                Text(
                    task.title,
                    style = MaterialTheme.typography.bodyLarge.copy(fontSize = 16.sp, lineHeight = 22.sp),
                    color = if (task.isPending) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = if (task.isCancelled) 0.7f else 1f),
                    textDecoration = if (task.isPending) null else TextDecoration.LineThrough,
                )
                if (rowTags.isNotEmpty() || task.isCarried) {
                    FlowRow(Modifier.padding(top = 5.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (task.isCarried) CarriedBadge(task, today, muted = !task.isPending)
                        rowTags.forEach { TagChip(it, dense = true) }
                    }
                }
                if (task.subtasks.isNotEmpty()) {
                    StepsProgress(task.subtasks, stepsOpen) { stepsOpen = !stepsOpen }
                    if (stepsOpen) StepsInline(task.subtasks, enabled = !task.isCancelled) { actions.toggleStep(task, it) }
                }
                val metas = buildList {
                    if (showOrigin) add(Triple(Icons.Outlined.CalendarToday, Dates.shortLabel(task.date, today), x.overdue))
                    if (task.priority < 4 && task.isPending) add(Triple(Icons.Filled.Flag, Palette.priorityLabel(task.priority), Palette.priority(task.priority, x.dark)))
                    if (task.postponed > 0 && task.isPending) add(Triple(Icons.Outlined.EventRepeat, if (task.postponed > 1) "Postponed ×${task.postponed}" else "Postponed", null))
                    if (task.isCancelled) add(Triple(Icons.Filled.Block, "Cancelled", null))
                    if (task.notes.isNotBlank()) add(Triple(Icons.AutoMirrored.Outlined.Notes, task.notes.lineSequence().first(), null))
                }
                if (metas.isNotEmpty()) {
                    FlowRow(Modifier.padding(top = 5.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        metas.forEach { (icon, label, tint) ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(icon, null, Modifier.size(14.dp), tint = tint ?: MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(
                                    " $label", style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                    color = if (tint == x.overdue) x.overdue else MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.widthIn(max = 220.dp),
                                )
                            }
                        }
                    }
                }
                if (task.attachments.isNotEmpty()) ImageStrip(task.attachments) { viewer = it }
            }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreVert, "More actions for \"${task.title}\"", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                TaskMenu(menu, { menu = false }, task, today, postponeLabel, actions) { tagMenu = true }
                TagMenu(tagMenu, { tagMenu = false }, tags, task.tagIds, { actions.setTags(task, it) }, actions.manageTags)
            }
        }
    }
}

@Composable
private fun CheckCircle(task: Task, onClick: () -> Unit) {
    val x = LocalExtra.current
    val ring = Palette.priority(task.priority, x.dark)
    Box(
        Modifier.size(48.dp).clip(CircleShape).clickable(role = Role.Checkbox, onClick = onClick)
            .semantics { contentDescription = if (task.isPending) "Complete \"${task.title}\"" else "Restore \"${task.title}\"" },
        contentAlignment = Alignment.Center,
    ) {
        when {
            task.isPending -> Box(Modifier.size(22.dp).border(BorderStroke(2.dp, ring), CircleShape))
            task.isDone -> Icon(Icons.Filled.CheckCircle, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(26.dp))
            else -> Icon(Icons.Filled.Block, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(24.dp))
        }
    }
}

@Composable
internal fun TaskMenu(open: Boolean, onDismiss: () -> Unit, task: Task, today: String, postponeLabel: String, a: RowActions, openTags: () -> Unit) {
    val dark = LocalExtra.current.dark
    DropdownMenu(expanded = open, onDismissRequest = onDismiss) {
        DropdownMenuItem(text = { Text("Edit") }, leadingIcon = { Icon(Icons.Outlined.Edit, null) }, onClick = { onDismiss(); a.open(task) })
        DropdownMenuItem(text = { Text("Tags") }, leadingIcon = { Icon(Icons.Outlined.Sell, null) }, onClick = { onDismiss(); openTags() })
        if (!task.isPending) {
            DropdownMenuItem(text = { Text("Mark as pending") }, leadingIcon = { Icon(Icons.Outlined.Replay, null) }, onClick = { onDismiss(); a.toggle(task) })
        }
        if (task.isPending && task.date != today) {
            DropdownMenuItem(text = { Text("Move to today") }, leadingIcon = { Icon(Icons.Outlined.Today, null) }, onClick = { onDismiss(); a.moveToToday(task) })
        }
        if (task.isPending) {
            DropdownMenuItem(text = { Text(postponeLabel) }, leadingIcon = { Icon(Icons.Outlined.EventRepeat, null) }, onClick = { onDismiss(); a.postpone(task) })
            Text("Priority", Modifier.padding(start = 16.dp, top = 8.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(Modifier.padding(horizontal = 8.dp)) {
                for (p in 1..4) {
                    IconButton(onClick = { onDismiss(); a.setPriority(task, p) }) {
                        Box(
                            Modifier.size(36.dp).clip(CircleShape)
                                .background(if (task.priority == p) MaterialTheme.colorScheme.surfaceContainerHigh else Color.Transparent),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(if (p == 4) Icons.Outlined.Flag else Icons.Filled.Flag, "Priority ${Palette.priorityLabel(p)}", tint = Palette.priority(p, dark))
                        }
                    }
                }
            }
        }
        HorizontalDivider()
        if (task.isPending) {
            DropdownMenuItem(text = { Text("Cancel task") }, leadingIcon = { Icon(Icons.Filled.Block, null) }, onClick = { onDismiss(); a.cancel(task) })
        }
        DropdownMenuItem(
            text = { Text("Delete", color = MaterialTheme.colorScheme.error) },
            leadingIcon = { Icon(Icons.Outlined.DeleteOutline, null, tint = MaterialTheme.colorScheme.error) },
            onClick = { onDismiss(); a.delete(task) },
        )
    }
}

// ---- Section header (Completed / Cancelled) -------------------------------------------

@Composable
fun SectionHeader(title: String, count: Int, open: Boolean, onToggle: () -> Unit) {
    val rotation by animateFloatAsState(if (open) 0f else -90f, label = "chevron")
    Row(
        Modifier.padding(horizontal = 8.dp).clip(RoundedCornerShape(12.dp)).clickable(onClick = onToggle).padding(horizontal = 8.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Filled.ExpandMore, null,
            Modifier.size(20.dp).rotate(rotation), tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text("  $title ($count)", style = MaterialTheme.typography.titleSmall)
    }
}


/** Red pill on a task that moved here by itself from an earlier day. */
@Composable
fun CarriedBadge(task: Task, today: String, muted: Boolean = false) {
    val x = LocalExtra.current
    val from = task.carriedFrom ?: return
    val color = if (muted) MaterialTheme.colorScheme.onSurfaceVariant else x.overdue
    Row(
        Modifier.height(22.dp).clip(RoundedCornerShape(50))
            .background(if (muted) x.surfaceHighest else x.overdueBg)
            .border(1.dp, if (muted) Color.Transparent else x.overdueBorder, RoundedCornerShape(50))
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.History, null, Modifier.size(13.dp), tint = color)
        Text(" " + Dates.carriedLabel(from, today), color = color, style = MaterialTheme.typography.labelMedium, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold, maxLines = 1)
    }
}

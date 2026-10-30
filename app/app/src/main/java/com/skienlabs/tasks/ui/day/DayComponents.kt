package com.skienlabs.tasks.ui.day

import androidx.compose.ui.input.pointer.pointerInput

import androidx.compose.foundation.layout.offset

import androidx.compose.runtime.derivedStateOf

import androidx.compose.runtime.snapshotFlow

import androidx.compose.runtime.LaunchedEffect

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
import androidx.compose.material.icons.outlined.LabelOff
import androidx.compose.material.icons.outlined.Timer
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
import com.skienlabs.tasks.ui.theme.glassPanel
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.interaction.collectIsPressedAsState
import com.skienlabs.tasks.ui.theme.Palette

// ---- Week strip ------------------------------------------------------------------

private val STRIP_DAYS = (Dates.between(Dates.MIN, Dates.MAX) + 1).toInt()
private fun stripIndex(date: String) = Dates.between(Dates.MIN, date).toInt()
private fun stripDate(index: Int) = Dates.addDays(Dates.MIN, index.toLong())

/**
 * The days as a scroll wheel: seven at a time, the selected day in the middle. Flick it and it
 * keeps going (fast flicks travel weeks), ticking on every day it passes, and settles on a day,
 * which becomes the selected one. Tap a day to pick it directly. The month shows while scrolling.
 */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun WeekStrip(date: String, today: String, summary: (String) -> Counts?, onSelect: (String) -> Unit) {
    val x = LocalExtra.current
    val haptics = LocalHapticFeedback.current
    val selectedIndex = stripIndex(date)
    val list = androidx.compose.foundation.lazy.rememberLazyListState(initialFirstVisibleItemIndex = (selectedIndex - 3).coerceAtLeast(0))
    val fling = androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior(list, androidx.compose.foundation.gestures.snapping.SnapPosition.Start)
    val current by rememberUpdatedState(date)
    val select by rememberUpdatedState(onSelect)
    var dragging by remember { mutableStateOf(false) }

    // Scrolls the user starts (a drag, and the fling after it) tick and select; the app's own don't.
    LaunchedEffect(list) {
        list.interactionSource.interactions.collect { if (it is androidx.compose.foundation.interaction.DragInteraction.Start) dragging = true }
    }
    // A tick for every day that passes under the finger (not while the app moves the strip itself).
    LaunchedEffect(list) {
        var last = list.firstVisibleItemIndex
        snapshotFlow { list.firstVisibleItemIndex }.collect { i ->
            if (i != last && dragging) haptics.performHapticFeedback(HapticFeedbackType.SegmentFrequentTick)
            last = i
        }
    }
    // When a scroll the user started comes to rest, the day in the middle is the selected one.
    LaunchedEffect(list) {
        snapshotFlow { list.isScrollInProgress }.collect { moving ->
            if (moving) return@collect
            if (dragging) {
                dragging = false
                val middle = stripDate((list.firstVisibleItemIndex + 3).coerceIn(0, STRIP_DAYS - 1))
                if (middle != current) {
                    haptics.performHapticFeedback(HapticFeedbackType.Confirm)
                    select(middle)
                }
            }
        }
    }
    // A day picked elsewhere (tap, calendar, Today): bring it to the middle.
    LaunchedEffect(selectedIndex) {
        val target = (selectedIndex - 3).coerceAtLeast(0)
        if (list.isScrollInProgress && dragging) return@LaunchedEffect
        val diff = target - list.firstVisibleItemIndex
        if (diff == 0 && list.firstVisibleItemScrollOffset == 0) return@LaunchedEffect
        if (kotlin.math.abs(diff) <= 14) list.animateScrollToItem(target) else list.scrollToItem(target)
    }
    // Which month the wheel is on, shown while it moves.
    val middleDate by remember { derivedStateOf { stripDate((list.firstVisibleItemIndex + 3).coerceIn(0, STRIP_DAYS - 1)) } }
    val monthAlpha by animateFloatAsState(if (list.isScrollInProgress && dragging) 1f else 0f, label = "month")

    androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
        val itemWidth = maxWidth / 7
        androidx.compose.foundation.lazy.LazyRow(
            state = list,
            flingBehavior = fling,
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(STRIP_DAYS, key = { it }) { i ->
                val d = stripDate(i)
                StripDay(d, d == date, d == today, summary(d), itemWidth) { select(d) }
            }
        }
        if (monthAlpha > 0f) {
            val label = remember(middleDate) {
                java.time.LocalDate.parse(middleDate).format(java.time.format.DateTimeFormatter.ofPattern("MMMM yyyy", java.util.Locale.getDefault()))
            }
            Box(
                Modifier.align(Alignment.TopCenter).offset(y = (-2).dp).graphicsLayer { alpha = monthAlpha }
                    .clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.inverseSurface).padding(horizontal = 12.dp, vertical = 4.dp),
            ) {
                Text(label, color = MaterialTheme.colorScheme.inverseOnSurface, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun StripDay(d: String, selected: Boolean, isToday: Boolean, c: Counts?, width: androidx.compose.ui.unit.Dp, onClick: () -> Unit) {
    val x = LocalExtra.current
    val today = Dates.today()
    val bg by animateColorAsState(if (selected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent, label = "day")
    val day = java.time.LocalDate.parse(d)
    Column(
        Modifier.width(width).padding(horizontal = 1.dp).clip(RoundedCornerShape(20.dp)).background(bg)
            .clickable(role = Role.Tab, onClick = onClick)
            .semantics { contentDescription = Dates.fullLabel(d) }
            .padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            if (day.dayOfMonth == 1) day.month.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.getDefault())
            else day.dayOfWeek.getDisplayName(java.time.format.TextStyle.NARROW, java.util.Locale.getDefault()),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = if (day.dayOfMonth == 1) FontWeight.Bold else FontWeight.Normal,
            color = if (isToday || day.dayOfMonth == 1) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Box(
            Modifier.padding(top = 2.dp).size(32.dp).clip(CircleShape).background(if (isToday) MaterialTheme.colorScheme.primary else Color.Transparent),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                day.dayOfMonth.toString(),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = if (isToday || selected) FontWeight.Bold else FontWeight.Normal,
                color = if (isToday) MaterialTheme.colorScheme.onPrimary else if (selected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface,
            )
        }
        // Progress line: green = done, blue = left, red = not finished on a past day
        // (left there, or moved on to the next day by itself).
        Box(Modifier.padding(top = 4.dp).width(22.dp).height(4.dp)) {
            if (c != null && c.planned > 0) {
                val done = c.done.toFloat() / c.planned
                val leftColor = if (d < today) x.overdue else x.pending
                Box(Modifier.fillMaxSize().clip(RoundedCornerShape(50)).drawBehind {
                    drawRect(x.done, size = Size(size.width * done, size.height))
                    drawRect(leftColor, topLeft = Offset(size.width * done, 0f), size = Size(size.width * (1 - done), size.height))
                })
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
    onAdd: (title: String, priority: Int, tagIds: List<String>, dueAt: String?) -> Deferred<Boolean>,
    onManageTags: () -> Unit,
    focusRequester: FocusRequester,
    date: String = com.skienlabs.tasks.data.Dates.today(),
) {
    var text by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    var priority by remember { mutableStateOf(4) }
    // Tags stay selected between adds (handy when entering several tasks for one company).
    var tagIds by remember(defaultTagId) { mutableStateOf(listOfNotNull(defaultTagId)) }
    // Every new task gets a tag, or "No tag" chosen on purpose (kept between adds too).
    var noTag by remember(defaultTagId) { mutableStateOf(false) }
    var tagWarning by remember { mutableStateOf(false) }
    // Optional time limit for the next task.
    var dueAt by remember { mutableStateOf<String?>(null) }
    var dueDialog by remember { mutableStateOf(false) }
    var tagMenu by remember { mutableStateOf(false) }
    var prioMenu by remember { mutableStateOf(false) }
    val x = LocalExtra.current
    val selectedTags = tagIds.mapNotNull { id -> tags.firstOrNull { it.id == id } }

    fun submit() {
        val t = text.trim()
        if (t.isEmpty()) return
        if (selectedTags.isEmpty() && !noTag) {
            tagWarning = true
            tagMenu = true
            return
        }
        val saved = onAdd(t, priority, selectedTags.map { it.id }, dueAt)
        val p = priority
        text = ""
        priority = 4
        dueAt = null
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
                    IconButton(onClick = { tagWarning = false; tagMenu = true }) {
                        when {
                            selectedTags.isNotEmpty() -> Row(Modifier.semantics { contentDescription = "Tags: ${selectedTags.joinToString { it.name }}" }) {
                                selectedTags.take(3).forEach { TagAvatar(it, 20.dp) }
                            }
                            noTag -> Icon(Icons.Outlined.LabelOff, "Tags: No tag", tint = MaterialTheme.colorScheme.primary)
                            else -> Icon(Icons.Outlined.Sell, "Set tags (required)")
                        }
                    }
                    TagMenu(
                        tagMenu, { tagMenu = false }, tags, tagIds,
                        { tagIds = it; if (it.isNotEmpty()) { noTag = false; tagWarning = false } }, onManageTags,
                        noTag = noTag,
                        onNoTag = { v -> noTag = v; if (v) { tagIds = emptyList(); tagWarning = false; tagMenu = false } },
                        warning = if (tagWarning) "Pick a tag for this task, or choose \"No tag\"." else null,
                    )
                }
                IconButton(onClick = { dueDialog = true }) {
                    Icon(Icons.Outlined.Timer, if (dueAt != null) "Time limit set" else "Set a time limit", tint = if (dueAt != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Box {
                    IconButton(onClick = { prioMenu = true }) {
                        Icon(if (priority == 4) Icons.Outlined.Flag else Icons.Filled.Flag, "Priority: ${Palette.priorityLabel(priority)}", tint = Palette.priority(priority, LocalExtra.current))
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
            focusedContainerColor = if (x.glass != null) Color.Transparent else x.surfaceHigh,
            unfocusedContainerColor = if (x.glass != null) Color.Transparent else x.surfaceHigh,
            focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent,
        ),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).glassPanel(RoundedCornerShape(28.dp)).focusRequester(focusRequester),
    )
    if (dueDialog) {
        var draft by remember { mutableStateOf(dueAt ?: com.skienlabs.tasks.data.Due.default(date)) }
        var on by remember { mutableStateOf(true) }
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { dueDialog = false },
            confirmButton = { androidx.compose.material3.TextButton(onClick = { dueAt = if (on) draft else null; dueDialog = false }) { Text("Done") } },
            dismissButton = { androidx.compose.material3.TextButton(onClick = { dueDialog = false }) { Text("Cancel") } },
            title = { Text("Time limit") },
            text = {
                com.skienlabs.tasks.ui.teams.TimeLimitField(if (on) draft else null, { v -> on = v != null; if (v != null) draft = v }, date)
            },
        )
    }
}

@Composable
fun TagMenu(
    open: Boolean, onDismiss: () -> Unit, tags: List<Tag>, selected: List<String>, onChange: (List<String>) -> Unit, onManage: () -> Unit,
    /** New tasks: "No tag" is the explicit choice for a task without tags. */
    noTag: Boolean = false, onNoTag: ((Boolean) -> Unit)? = null, warning: String? = null,
) {
    DropdownMenu(expanded = open, onDismissRequest = onDismiss) {
        if (warning != null) {
            Text(
                warning, Modifier.padding(horizontal = 16.dp, vertical = 8.dp).width(240.dp),
                style = MaterialTheme.typography.bodyMedium, color = LocalExtra.current.overdue, fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
            )
        }
        if (onNoTag != null) {
            DropdownMenuItem(
                text = { Column { Text("No tag"); Text("Add it without a tag", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) } },
                leadingIcon = { Icon(Icons.Outlined.LabelOff, null) },
                trailingIcon = { Checkbox(checked = noTag, onCheckedChange = null) },
                onClick = { onNoTag(!noTag) },
            )
            HorizontalDivider()
        }
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
                leadingIcon = { Icon(if (p == 4) Icons.Outlined.Flag else Icons.Filled.Flag, null, tint = Palette.priority(p, LocalExtra.current)) },
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
    // In the user's own tag order, so the first one is the task's company (see TaskOrder).
    val rowTags = remember(task.tagIds, tags) { tags.filter { it.id in task.tagIds } }
    val target = Dates.postponeTarget(task.date, today)
    val postponeLabel = Dates.shortLabel(target, today).let { if (it == "Tomorrow") "Postpone to tomorrow" else "Postpone to $it" }
    // A swipe asks first, on the card itself (an accidental swipe is then just a "No").
    var ask by remember(task.id) { mutableStateOf<SwipeToDismissBoxValue?>(null) }
    LaunchedEffect(ask) {
        if (ask != null) {
            kotlinx.coroutines.delay(6000) // no answer: leave it as it was
            ask = null
        }
    }
    LaunchedEffect(task.isPending) { if (!task.isPending) ask = null }

    SwipeToDismissBox(
        state = state,
        enableDismissFromStartToEnd = task.isPending && ask == null,
        enableDismissFromEndToStart = task.isPending && ask == null,
        onDismiss = { direction ->
            haptics.performHapticFeedback(HapticFeedbackType.GestureThresholdActivate)
            if (direction == SwipeToDismissBoxValue.StartToEnd || direction == SwipeToDismissBoxValue.EndToStart) ask = direction
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
        ask?.let { dir ->
            val complete = dir == SwipeToDismissBoxValue.StartToEnd
            SwipeConfirm(
                title = task.title,
                question = if (complete) "Mark as done?" else "$postponeLabel?",
                color = if (complete) x.done else x.postponed,
                icon = if (complete) Icons.Filled.CheckCircle else Icons.Outlined.EventRepeat,
                yes = if (complete) "Done" else "Postpone",
                onNo = { ask = null },
                onYes = {
                    ask = null
                    haptics.performHapticFeedback(HapticFeedbackType.Confirm)
                    if (complete) actions.toggle(current) else actions.postpone(current)
                },
            )
            return@SwipeToDismissBox
        }
        val spine = rowTags.take(4).map { tagColor(it.color) }
        // From an earlier day and still open: a soft outline in its tag's colour (red if high priority).
        val late = task.isPending && (task.isCarried || showOrigin)
        val lateColors = carriedColors(task, rowTags.firstOrNull())
        val glass = x.glass
        val cardShape = RoundedCornerShape(if (glass != null) 20.dp else 16.dp)
        // Pressing a card sinks it a little.
        val press = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
        val pressed by press.collectIsPressedAsState()
        val pressScale by animateFloatAsState(if (pressed && task.isPending) 0.98f else 1f, androidx.compose.animation.core.spring(dampingRatio = 0.55f, stiffness = 500f), label = "press")
        Row(
            Modifier.fillMaxWidth()
                .then(
                    // Open tasks are calm, neutral cards: colour only marks things (the tag spine,
                    // a soft outline for work from earlier days, the logo), never the whole card.
                    if (task.isPending) Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
                        .graphicsLayer { scaleX = pressScale; scaleY = pressScale }
                        .then(if (glass != null) Modifier.glassPanel(cardShape) else Modifier.clip(cardShape).background(x.card))
                        .border(1.dp, if (late) lateColors.border else x.cardBorder, cardShape)
                    else Modifier.background(containerColor),
                )
                .combinedClickable(interactionSource = press, indication = androidx.compose.material3.ripple(), onClick = { actions.view(task) }, onLongClick = { haptics.performHapticFeedback(HapticFeedbackType.LongPress); menu = true })
                .drawBehind {
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
                if (rowTags.isNotEmpty() || task.isCarried || task.dueAt != null || task.teamId != null) {
                    FlowRow(Modifier.padding(top = 5.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (task.dueAt != null) com.skienlabs.tasks.ui.teams.DueChip(task)
                        if (task.teamId != null) com.skienlabs.tasks.ui.teams.TeamBadge(task)
                        if (task.isCarried) CarriedBadge(task, today, muted = !task.isPending, tag = rowTags.firstOrNull())
                        rowTags.forEach { TagChip(it, dense = true) }
                    }
                }
                if (task.subtasks.isNotEmpty()) {
                    StepsProgress(task.subtasks, stepsOpen) { stepsOpen = !stepsOpen }
                    if (stepsOpen) StepsInline(task.subtasks, enabled = !task.isCancelled) { actions.toggleStep(task, it) }
                }
                val metas = buildList {
                    if (showOrigin) add(Triple(Icons.Outlined.CalendarToday, Dates.shortLabel(task.date, today), x.overdue))
                    if (task.priority < 4 && task.isPending) add(Triple(Icons.Filled.Flag, Palette.priorityLabel(task.priority), Palette.priority(task.priority, LocalExtra.current)))
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

/** The card after a swipe: tinted in the action's colour, asking before it happens. */
@Composable
private fun SwipeConfirm(
    title: String, question: String, color: Color, icon: androidx.compose.ui.graphics.vector.ImageVector, yes: String,
    onNo: () -> Unit, onYes: () -> Unit,
) {
    val x = LocalExtra.current
    val shape = RoundedCornerShape(16.dp)
    val appear = remember { androidx.compose.animation.core.Animatable(0.94f) }
    LaunchedEffect(Unit) { appear.animateTo(1f, androidx.compose.animation.core.spring(dampingRatio = 0.5f, stiffness = 600f)) }
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)
            .graphicsLayer { scaleX = appear.value; scaleY = appear.value }
            .clip(shape).background(x.card).background(color.copy(alpha = if (x.dark) 0.22f else 0.14f))
            .border(1.5.dp, color, shape)
            .semantics(mergeDescendants = false) { contentDescription = "$question $title" }
            .padding(start = 14.dp, end = 8.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = color, modifier = Modifier.size(26.dp))
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(question, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
            Text(title, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        androidx.compose.material3.TextButton(onClick = onNo) { Text("No") }
        androidx.compose.material3.Button(
            onClick = onYes,
            colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = color, contentColor = if (x.dark) Color.Black else Color.White),
            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
        ) { Text(yes, fontWeight = FontWeight.SemiBold) }
    }
}

@Composable
private fun CheckCircle(task: Task, onClick: () -> Unit) {
    val x = LocalExtra.current
    val ring = Palette.priority(task.priority, LocalExtra.current)
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
    // Team tasks: the person works on it; priority, cancel and delete are for the team's admins.
    val restricted = com.skienlabs.tasks.ui.teams.accessOf(task).restricted
    DropdownMenu(expanded = open, onDismissRequest = onDismiss) {
        DropdownMenuItem(text = { Text("Edit") }, leadingIcon = { Icon(Icons.Outlined.Edit, null) }, onClick = { onDismiss(); a.open(task) })
        DropdownMenuItem(text = { Text("Tags") }, leadingIcon = { Icon(Icons.Outlined.Sell, null) }, onClick = { onDismiss(); openTags() })
        if (!task.isPending && !(restricted && task.isCancelled)) {
            DropdownMenuItem(text = { Text("Mark as pending") }, leadingIcon = { Icon(Icons.Outlined.Replay, null) }, onClick = { onDismiss(); a.toggle(task) })
        }
        if (task.isPending && task.date != today) {
            DropdownMenuItem(text = { Text("Move to today") }, leadingIcon = { Icon(Icons.Outlined.Today, null) }, onClick = { onDismiss(); a.moveToToday(task) })
        }
        if (task.isPending) {
            DropdownMenuItem(text = { Text(postponeLabel) }, leadingIcon = { Icon(Icons.Outlined.EventRepeat, null) }, onClick = { onDismiss(); a.postpone(task) })
        }
        if (task.isPending && !restricted) {
            Text("Priority", Modifier.padding(start = 16.dp, top = 8.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(Modifier.padding(horizontal = 8.dp)) {
                for (p in 1..4) {
                    IconButton(onClick = { onDismiss(); a.setPriority(task, p) }) {
                        Box(
                            Modifier.size(36.dp).clip(CircleShape)
                                .background(if (task.priority == p) MaterialTheme.colorScheme.surfaceContainerHigh else Color.Transparent),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(if (p == 4) Icons.Outlined.Flag else Icons.Filled.Flag, "Priority ${Palette.priorityLabel(p)}", tint = Palette.priority(p, LocalExtra.current))
                        }
                    }
                }
            }
        }
        if (!restricted) {
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


/**
 * "From Tue, 20 Oct" on a task that moved here by itself from an earlier day: a quiet, readable
 * pill (neutral background, normal text); only the clock icon carries the accent colour.
 */
@Composable
fun CarriedBadge(task: Task, today: String, muted: Boolean = false, tag: Tag? = null) {
    val x = LocalExtra.current
    val from = task.carriedFrom ?: return
    val c = carriedColors(task, tag)
    val high = task.priority == 1 && !muted
    Row(
        Modifier.height(22.dp).clip(RoundedCornerShape(50)).background(x.chip).padding(start = 6.dp, end = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.History, null, Modifier.size(13.dp), tint = if (muted) MaterialTheme.colorScheme.onSurfaceVariant else c.main)
        Text(
            " " + Dates.carriedLabel(from, today),
            color = if (high) c.main else MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelMedium, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold, maxLines = 1,
        )
    }
}

/** Outline colours for a task from an earlier day. */
class CarriedColors(val main: Color, val border: Color, val bg: Color)

/**
 * Red when it's high priority (late and it matters); otherwise the colour of its (first) tag,
 * or a neutral one without tags.
 */
@Composable
fun carriedColors(task: Task, tag: Tag?): CarriedColors {
    val x = LocalExtra.current
    // The outline is soft on purpose: it marks the card without colouring it.
    if (task.priority == 1) return CarriedColors(x.overdue, x.overdue.copy(alpha = if (x.dark) 0.45f else 0.4f), x.overdueBg)
    if (tag != null) {
        val c = tagColor(tag.color)
        return CarriedColors(c, c.copy(alpha = if (x.dark) 0.4f else 0.38f), c.copy(alpha = if (x.dark) 0.08f else 0.06f))
    }
    return CarriedColors(MaterialTheme.colorScheme.onSurfaceVariant, x.outline, x.surfaceHigh)
}

package com.skienlabs.tasks.ui.day

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.EventRepeat
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.skienlabs.tasks.data.Dates
import com.skienlabs.tasks.data.StoreState
import com.skienlabs.tasks.data.Tag
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.ui.common.Pill
import com.skienlabs.tasks.ui.theme.LocalExtra
import com.skienlabs.tasks.ui.theme.glassAppear

/** Lists for one day, computed once per state change (not per frame). */
private class DayLists(
    val pending: List<Task>,
    val done: List<Task>,
    val cancelled: List<Task>,
    val overdue: List<Task>,
    val any: Boolean,
)

private fun lists(state: StoreState, date: String, today: String, filter: String?): DayLists {
    fun ok(t: Task) = filter == null || filter in t.tagIds
    val all = state.day(date)
    val day = all.filter(::ok)
    val overdue = if (date == today) state.overdue(today).filter(::ok) else emptyList()
    return DayLists(
        pending = day.filter { it.isPending },
        done = day.filter { it.isDone },
        cancelled = day.filter { it.isCancelled },
        overdue = overdue,
        any = all.isNotEmpty(),
    )
}

@Composable
fun DayPage(
    date: String,
    today: String,
    state: StoreState,
    filter: String?,
    failed: Boolean,
    onRetry: () -> Unit,
    actions: RowActions,
    onAdd: (title: String, priority: Int, tagIds: List<String>) -> kotlinx.coroutines.Deferred<Boolean>,
    onMoveAllToToday: (List<Task>) -> Unit,
    quickAddFocus: FocusRequester,
    bottomPadding: androidx.compose.ui.unit.Dp,
    onGoToday: () -> Unit = {},
) {
    val l = remember(state.tasks, date, today, filter) { lists(state, date, today, filter) }
    val tags = state.tags
    val known = state.hasDay(date)
    val filterTag = filter?.let { state.tag(it) }
    var showDone by rememberSaveable(date) { mutableStateOf(true) }
    var showCancelled by rememberSaveable(date) { mutableStateOf(false) }
    val x = LocalExtra.current
    val listState = rememberLazyListState()

    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = bottomPadding + 88.dp),
    ) {
        item(key = "header", contentType = "header") { DayHeader(date, today, l, state.summary[date]?.missed ?: 0) }
        item(key = "add", contentType = "add") {
            Box(Modifier.padding(top = 4.dp, bottom = 8.dp)) {
                // Past days take no new tasks: they go on today or later.
                if (date < today) PastDayNote(onGoToday)
                else QuickAdd(tags, filter, onAdd, actions.manageTags, quickAddFocus)
            }
        }

        // Unfinished tasks move to today on their own (the server does it). `overdue` only has
        // entries when this phone's clock disagrees with the server's; they're listed with the day.
        items(l.overdue, key = { "o-" + it.id }, contentType = { "task" }) { t ->
            Box(Modifier.animateItem().glassAppear()) { TaskRow(t, tags, today, showOrigin = true, actions = actions) }
        }

        if (!known && !failed) {
            items(3, key = { "skeleton$it" }, contentType = { "skeleton" }) { Skeleton(it) }
        } else if (!known && failed) {
            item(key = "failed", contentType = "failed") { FailedDay(onRetry) }
        } else {
            items(l.pending, key = { it.id }, contentType = { "task" }) { t ->
                Box(Modifier.animateItem().glassAppear()) { TaskRow(t, tags, today, showOrigin = false, actions = actions) }
            }
            if (l.pending.isEmpty()) {
                item(key = "empty", contentType = "empty") { EmptyDay(date, today, l, filterTag, state.summary[date]?.missed ?: 0) }
            }
            if (l.done.isNotEmpty()) {
                item(key = "done-header", contentType = "section") { SectionHeader("Completed", l.done.size, showDone) { showDone = !showDone } }
                if (showDone) items(l.done, key = { it.id }, contentType = { "task" }) { t ->
                    Box(Modifier.animateItem().glassAppear()) { TaskRow(t, tags, today, showOrigin = false, actions = actions) }
                }
            }
            if (l.cancelled.isNotEmpty()) {
                item(key = "cancelled-header", contentType = "section") { SectionHeader("Cancelled", l.cancelled.size, showCancelled) { showCancelled = !showCancelled } }
                if (showCancelled) items(l.cancelled, key = { it.id }, contentType = { "task" }) { t ->
                    Box(Modifier.animateItem().glassAppear()) { TaskRow(t, tags, today, showOrigin = false, actions = actions) }
                }
            }
            if (failed) item(key = "stale", contentType = "stale") {
                Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                    Icon(Icons.Outlined.CloudOff, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("  Showing saved copy", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

/**
 * A compact line above the list: a greeting (today) or how far the day is, the counts as pills,
 * and a small progress ring. The full date is in the top bar, so nothing here repeats it.
 */
@Composable
private fun DayHeader(date: String, today: String, l: DayLists, missed: Int) {
    val x = LocalExtra.current
    val isToday = date == today
    val past = date < today
    val pending = l.pending.size
    val done = l.done.size
    val active = pending + done
    val earlier = l.pending.count { it.isCarried } + l.overdue.size
    Row(
        Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                if (isToday) "${Dates.greeting()}${greetingName()}" else Dates.distanceLabel(date, today),
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )
            if (active > 0 || missed > 0 || earlier > 0) {
                androidx.compose.foundation.layout.FlowRow(
                    Modifier.padding(top = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (active > 0) Pill("$active task${if (active == 1) "" else "s"}", x.pending)
                    if (done > 0) Pill("$done done", x.done)
                    if (pending > 0) Pill("$pending left", if (past) x.overdue else x.pending)
                    if (earlier > 0) Pill("$earlier from earlier", x.overdue)
                    if (past && missed > 0) Pill("$missed moved on", x.overdue)
                }
            }
        }
        // Past days count what moved on unfinished too, so a day is only full when it was finished.
        val planned = active + if (past) missed else 0
        if (planned > 0) ProgressRing(done, planned, Modifier.padding(start = 12.dp))
    }
}

/** ", Sufail" when the signed-in name is known (set by the home screen). */
@Composable
private fun greetingName(): String = LocalGreetingName.current?.let { ", $it" } ?: ""

/** The first name for the greeting; provided by the home screen. */
val LocalGreetingName = androidx.compose.runtime.staticCompositionLocalOf<String?> { null }

@Composable
private fun ProgressRing(done: Int, total: Int, modifier: Modifier = Modifier) {
    val x = LocalExtra.current
    val target = if (total > 0) done.toFloat() / total else 0f
    val sweep by androidx.compose.animation.core.animateFloatAsState(
        target, androidx.compose.animation.core.spring(dampingRatio = 0.7f, stiffness = 120f), label = "ring",
    )
    val track = x.surfaceHighest
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        androidx.compose.foundation.Canvas(
            Modifier.size(30.dp).semantics { contentDescription = "$done of $total done" },
        ) {
            val w = 3.5.dp.toPx()
            val inset = w / 2
            val sz = androidx.compose.ui.geometry.Size(size.width - w, size.height - w)
            val o = androidx.compose.ui.geometry.Offset(inset, inset)
            drawArc(track, 0f, 360f, false, o, sz, style = androidx.compose.ui.graphics.drawscope.Stroke(w))
            if (sweep > 0f) drawArc(
                androidx.compose.ui.graphics.Brush.sweepGradient(listOf(x.done, x.pending, x.done)),
                -90f, 360f * sweep, false, o, sz,
                style = androidx.compose.ui.graphics.drawscope.Stroke(w, cap = androidx.compose.ui.graphics.StrokeCap.Round),
            )
        }
        Text(" $done/$total", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun EmptyDay(date: String, today: String, l: DayLists, filterTag: Tag?, missed: Int) {
    val (icon, title, sub) = when {
        date < today && missed > 0 && l.done.isEmpty() && filterTag == null ->
            Triple(Icons.Outlined.EventRepeat, "$missed not finished", "${if (missed == 1) "It" else "They"} moved on to the next day by ${if (missed == 1) "itself" else "themselves"}.")
        l.done.isNotEmpty() && date < today && missed > 0 && filterTag == null ->
            Triple(Icons.Outlined.TaskAlt, "${l.done.size} done, $missed moved on", "Unfinished tasks moved on to the next day.")
        l.done.isNotEmpty() -> Triple(Icons.Outlined.TaskAlt, "All done!", if (date == today) "Nothing left for today. Nice work." else "Everything on this day is finished.")
        filterTag != null && l.any -> Triple(Icons.Outlined.EventAvailable, "Nothing for ${filterTag.name}", "Other tasks are hidden by the tag filter.")
        date < today -> Triple(Icons.Outlined.EventAvailable, "Nothing was planned", "Add a task to keep a record of this day.")
        else -> Triple(Icons.Outlined.WbSunny, if (date == today) "A clear day" else "Nothing planned yet", "Add a task above to get started.")
    }
    Column(Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(64.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.size(30.dp))
        }
        Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 14.dp), textAlign = TextAlign.Center)
        Text(sub, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun FailedDay(onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(Icons.Outlined.CloudOff, null, Modifier.size(40.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Couldn't load this day", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 12.dp))
        Text("Check your connection and try again.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(onClick = onRetry, modifier = Modifier.padding(top = 16.dp)) { Text("Retry") }
    }
}

@Composable
private fun Skeleton(i: Int) {
    val x = LocalExtra.current
    val t = rememberInfiniteTransition(label = "skeleton")
    val a by t.animateFloat(0.45f, 0.9f, infiniteRepeatable(tween(800), RepeatMode.Reverse), label = "alpha")
    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp).alpha(a), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(22.dp).clip(CircleShape).background(x.surfaceHighest))
        Column(Modifier.padding(start = 16.dp)) {
            Box(Modifier.height(14.dp).fillMaxWidth(listOf(0.7f, 0.5f, 0.6f)[i % 3]).clip(RoundedCornerShape(7.dp)).background(x.surfaceHighest))
            Box(Modifier.padding(top = 8.dp).height(10.dp).fillMaxWidth(0.3f).clip(RoundedCornerShape(5.dp)).background(x.surfaceHigh))
        }
    }
}

@Composable
private fun PastDayNote(onGoToday: () -> Unit) {
    val shape = RoundedCornerShape(28.dp)
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp).clip(shape)
            .border(1.dp, LocalExtra.current.outline, shape).padding(start = 16.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.EventBusy, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            "This day has passed. New tasks go on today or later.",
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f).padding(start = 12.dp),
        )
        androidx.compose.material3.TextButton(onClick = onGoToday) { Text("Today") }
    }
}

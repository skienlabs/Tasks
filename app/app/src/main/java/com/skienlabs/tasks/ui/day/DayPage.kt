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
import androidx.compose.ui.unit.dp
import com.skienlabs.tasks.data.Dates
import com.skienlabs.tasks.data.StoreState
import com.skienlabs.tasks.data.Tag
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.ui.common.Pill
import com.skienlabs.tasks.ui.common.StackBar
import com.skienlabs.tasks.ui.common.gradientBrush
import com.skienlabs.tasks.ui.theme.LocalExtra

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
        item(key = "header", contentType = "header") { DayHeader(date, today, l) }
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
            Box(Modifier.animateItem()) { TaskRow(t, tags, today, showOrigin = true, actions = actions) }
        }

        if (!known && !failed) {
            items(3, key = { "skeleton$it" }, contentType = { "skeleton" }) { Skeleton(it) }
        } else if (!known && failed) {
            item(key = "failed", contentType = "failed") { FailedDay(onRetry) }
        } else {
            items(l.pending, key = { it.id }, contentType = { "task" }) { t ->
                Box(Modifier.animateItem()) { TaskRow(t, tags, today, showOrigin = false, actions = actions) }
            }
            if (l.pending.isEmpty()) {
                item(key = "empty", contentType = "empty") { EmptyDay(date, today, l, filterTag) }
            }
            if (l.done.isNotEmpty()) {
                item(key = "done-header", contentType = "section") { SectionHeader("Completed", l.done.size, showDone) { showDone = !showDone } }
                if (showDone) items(l.done, key = { it.id }, contentType = { "task" }) { t ->
                    Box(Modifier.animateItem()) { TaskRow(t, tags, today, showOrigin = false, actions = actions) }
                }
            }
            if (l.cancelled.isNotEmpty()) {
                item(key = "cancelled-header", contentType = "section") { SectionHeader("Cancelled", l.cancelled.size, showCancelled) { showCancelled = !showCancelled } }
                if (showCancelled) items(l.cancelled, key = { it.id }, contentType = { "task" }) { t ->
                    Box(Modifier.animateItem()) { TaskRow(t, tags, today, showOrigin = false, actions = actions) }
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

@Composable
private fun DayHeader(date: String, today: String, l: DayLists) {
    val x = LocalExtra.current
    val isToday = date == today
    val pending = l.pending.size
    val done = l.done.size
    Column(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 10.dp)) {
        if (isToday) {
            Text(Dates.greeting(), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        val label = Dates.relativeLabel(date, today)
        Text(
            label,
            style = if (isToday) MaterialTheme.typography.displaySmall.copy(brush = gradientBrush(x.gradient)) else MaterialTheme.typography.displaySmall,
        )
        Text(if (label in setOf("Today", "Tomorrow", "Yesterday")) Dates.fullLabel(date) else Dates.longDate(date), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        val active = pending + done
        val earlier = l.pending.count { it.isCarried } + l.overdue.size
        if (active > 0 || l.overdue.isNotEmpty()) {
            Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (pending > 0) Pill("$pending left", if (date < today) x.overdue else x.pending)
                if (done > 0) Pill("$done done", x.done)
                if (earlier > 0) Pill("$earlier from earlier", x.overdue)
            }
            if (active > 0) {
                StackBar(com.skienlabs.tasks.data.Counts(pending, done, 0), Modifier.padding(top = 10.dp), height = 6.dp, overdue = date < today)
            }
        }
    }
}

@Composable
private fun EmptyDay(date: String, today: String, l: DayLists, filterTag: Tag?) {
    val (icon, title, sub) = when {
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

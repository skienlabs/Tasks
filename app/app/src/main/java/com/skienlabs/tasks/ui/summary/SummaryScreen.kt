package com.skienlabs.tasks.ui.summary

import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.EventNote
import androidx.compose.material.icons.outlined.EventRepeat
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.PendingActions
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skienlabs.tasks.data.ApiException
import com.skienlabs.tasks.data.Counts
import com.skienlabs.tasks.data.DayCounts
import com.skienlabs.tasks.data.Dates
import com.skienlabs.tasks.data.Stats
import com.skienlabs.tasks.data.Tag
import com.skienlabs.tasks.ui.common.StackBar
import com.skienlabs.tasks.ui.common.TagAvatar
import com.skienlabs.tasks.ui.common.gradientBrush
import com.skienlabs.tasks.ui.theme.LocalExtra
import com.skienlabs.tasks.ui.theme.glassAppear
import com.skienlabs.tasks.ui.theme.glassPanel
import com.skienlabs.tasks.ui.theme.Palette
import java.time.YearMonth

private data class Loaded(val month: YearMonth, val stats: Stats)

@Composable
fun SummaryScreen(
    stats: suspend (from: String, to: String, today: String) -> Stats,
    onError: (Throwable) -> Unit,
    today: String, tags: List<Tag>, statsVersion: Int, bottomPadding: Dp, onOpenDay: (String) -> Unit) {
    var monthText by rememberSaveable { mutableStateOf(today.take(7)) }
    val month = YearMonth.parse(monthText)
    var data by remember { mutableStateOf<Loaded?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var retry by remember { mutableIntStateOf(0) }

    // Restarted on month change: the previous request is cancelled, so an older month can't land late.
    LaunchedEffect(month, today, statsVersion, retry) {
        error = null
        try {
            val from = month.atDay(1).toString()
            val to = month.atEndOfMonth().toString()
            data = Loaded(month, stats(from, to, today))
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            error = (e as? ApiException)?.message ?: "Something went wrong."
            onError(e)
        }
    }

    val ready = data?.takeIf { it.month == month }
    val x = LocalExtra.current
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 8.dp, bottom = bottomPadding + 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item(key = "head") {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f).padding(start = 8.dp)) {
                    Text(Dates.monthYear(month), style = MaterialTheme.typography.headlineMedium.copy(brush = gradientBrush(x.gradient)))
                    Text("Monthly summary", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                val current = YearMonth.parse(today.take(7))
                if (month != current) TextButton(onClick = { monthText = current.toString() }) { Text("This month") }
                IconButton(onClick = { monthText = month.minusMonths(1).toString() }, enabled = month > YearMonth.of(1900, 1)) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, "Previous month") }
                IconButton(onClick = { monthText = month.plusMonths(1).toString() }, enabled = month < YearMonth.of(2999, 12)) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, "Next month") }
            }
        }
        if (ready == null) {
            item(key = "state") {
                Box(Modifier.fillMaxWidth().height(240.dp), contentAlignment = Alignment.Center) {
                    if (error != null) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("Couldn't load the summary", style = MaterialTheme.typography.titleMedium)
                            Text(error ?: "", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            OutlinedButton(onClick = { retry++ }, Modifier.padding(top = 12.dp)) { Text("Retry") }
                        }
                    } else CircularProgressIndicator()
                }
            }
            return@LazyColumn
        }
        val s = ready.stats
        val totals = s.days.fold(Counts()) { acc, d -> acc.plus(d.counts()) }
        val active = totals.active
        val rate = if (active > 0) Math.round(totals.done * 100f / active) else 0
        val activeDays = s.days.filter { it.pending + it.done + it.cancelled + it.missed > 0 }

        item(key = "kpis") {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Kpi("Tasks", "$active", "${activeDays.size} active day${if (activeDays.size == 1) "" else "s"}", Color(0xFF4285F4), Icons.Outlined.EventNote, Modifier.weight(1f))
                    Kpi("Completed", "${totals.done}", "$rate% of tasks", Color(0xFF34A853), Icons.Outlined.TaskAlt, Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Kpi("Left", "${totals.pending}", if (s.overdue > 0) "${s.overdue} overdue" else "none overdue", Color(0xFFF9AB00), Icons.Outlined.PendingActions, Modifier.weight(1f))
                    RateCard(rate, totals.done, active, Modifier.weight(1f))
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    MiniPill(Icons.Outlined.History, "${s.overdue} overdue", x.overdue)
                    MiniPill(Icons.Outlined.EventRepeat, "${s.postponed} postponed", x.postponed)
                    MiniPill(Icons.Outlined.Block, "${totals.cancelled} cancelled", x.cancelled)
                }
            }
        }
        item(key = "chart") {
            Card("Daily activity", Icons.Outlined.EventNote, MaterialTheme.colorScheme.primary) {
                DailyChart(s.days, month, today, onOpenDay)
            }
        }
        item(key = "tags") {
            Card("By company / tag", Icons.Outlined.Sell, x.rate) {
                val rows = s.byTag.sortedWith(compareBy({ it.tagId == null }, { -(it.done + it.pending) }))
                val shown = rows.mapNotNull { r -> if (r.tagId == null) r to null else tags.firstOrNull { it.id == r.tagId }?.let { r to it } }
                if (shown.isEmpty()) Text("No tasks this month.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                shown.forEach { (r, tag) ->
                    Breakdown(
                        icon = {
                            if (tag != null) TagAvatar(tag, 24.dp)
                            else Box(Modifier.size(24.dp).border(2.dp, x.outline, CircleShape))
                        },
                        label = tag?.name ?: "No tag", c = r.counts(),
                    )
                }
            }
        }
        item(key = "prio") {
            Card("By priority", Icons.Filled.Flag, Palette.priority(1, LocalExtra.current)) {
                if (s.byPriority.isEmpty()) Text("No tasks this month.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                s.byPriority.sortedBy { it.priority }.forEach { r ->
                    Breakdown(icon = { Icon(Icons.Filled.Flag, null, tint = Palette.priority(r.priority, LocalExtra.current)) }, label = Palette.priorityLabel(r.priority), c = r.counts())
                }
            }
        }
        item(key = "days-head") {
            Card("Day by day", Icons.Outlined.TaskAlt, x.done) {
                if (activeDays.isEmpty()) Text("No tasks this month.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                activeDays.asReversed().forEach { d -> DayRow(d, today) { onOpenDay(d.date) } }
            }
        }
    }
}

@Composable
private fun Card(title: String, icon: ImageVector, tint: Color, content: @Composable () -> Unit) {
    val x = LocalExtra.current
    Column(
        Modifier.fillMaxWidth().glassAppear().clip(RoundedCornerShape(24.dp))
            .then(if (x.glass != null) Modifier.glassPanel(RoundedCornerShape(24.dp)) else Modifier.background(x.surfaceHigh))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 6.dp)) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(22.dp))
            Text("  $title", style = MaterialTheme.typography.titleMedium)
        }
        content()
    }
}

@Composable
private fun Kpi(label: String, value: String, sub: String, hue: Color, icon: ImageVector, modifier: Modifier) {
    val dark = LocalExtra.current.dark
    // Black & White themes: the ink colour instead of a hue.
    val color = if (LocalExtra.current.mono) MaterialTheme.colorScheme.onSurface else hue
    Column(
        modifier.clip(RoundedCornerShape(24.dp)).background(color.copy(alpha = if (dark) 0.14f else 0.09f))
            .border(1.dp, color.copy(alpha = 0.28f), RoundedCornerShape(24.dp)).padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = color, modifier = Modifier.size(18.dp))
            Text("  $label", color = color, style = MaterialTheme.typography.labelLarge)
        }
        Text(value, fontSize = 32.sp, lineHeight = 38.sp, modifier = Modifier.padding(top = 6.dp))
        Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun RateCard(rate: Int, done: Int, active: Int, modifier: Modifier) {
    val x = LocalExtra.current
    val c = x.rate
    Row(
        modifier.clip(RoundedCornerShape(24.dp)).background(c.copy(alpha = if (x.dark) 0.14f else 0.09f))
            .border(1.dp, c.copy(alpha = 0.28f), RoundedCornerShape(24.dp)).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(64.dp), contentAlignment = Alignment.Center) {
            val track = x.surfaceHighest
            Canvas(Modifier.size(64.dp).semantics { contentDescription = "$rate percent complete" }) {
                val w = 6.dp.toPx()
                val inset = w / 2
                val sz = Size(size.width - w, size.height - w)
                drawArc(track, 0f, 360f, false, Offset(inset, inset), sz, style = Stroke(w))
                if (rate > 0) drawArc(c, -90f, 360f * rate / 100f, false, Offset(inset, inset), sz, style = Stroke(w, cap = StrokeCap.Round))
            }
            Text("$rate%", fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
        }
        Column(Modifier.padding(start = 10.dp)) {
            Text("Completion", color = c, style = MaterialTheme.typography.labelLarge)
            Text("$done of $active", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun MiniPill(icon: ImageVector, label: String, color: Color) {
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.12f)).padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = color, modifier = Modifier.size(16.dp))
        Text(" $label", color = color, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
private fun DailyChart(days: List<DayCounts>, month: YearMonth, today: String, onOpenDay: (String) -> Unit) {
    val x = LocalExtra.current
    val byDate = remember(days) { days.associateBy { it.date } }
    val n = month.lengthOfMonth()
    val all = remember(byDate, month) { List(n) { i -> month.atDay(i + 1).toString().let { byDate[it] ?: DayCounts(it) } } }
    val max = (all.maxOfOrNull { it.pending + it.done + it.cancelled + it.missed } ?: 0).coerceAtLeast(1)
    val todayColor = MaterialTheme.colorScheme.primary
    Canvas(
        Modifier.fillMaxWidth().height(150.dp)
            .semantics { contentDescription = "Daily activity chart. Tap a bar to open that day." }
            .pointerInput(all) {
                detectTapGestures { p ->
                    val i = (p.x / (size.width / n.toFloat())).toInt().coerceIn(0, n - 1)
                    onOpenDay(all[i].date)
                }
            },
    ) {
        val slot = size.width / n
        val gap = (slot * 0.22f).coerceAtMost(4.dp.toPx())
        val bw = slot - gap
        val h = size.height
        all.forEachIndexed { i, d ->
            val left = i * slot + gap / 2
            val total = d.pending + d.done + d.cancelled + d.missed
            if (total == 0) {
                drawRoundRect(x.surfaceHighest, Offset(left, h - 3.dp.toPx()), Size(bw, 3.dp.toPx()), CornerRadius(2.dp.toPx()))
            } else {
                var y = h
                fun seg(v: Int, c: Color) {
                    if (v == 0) return
                    val sh = h * v / max
                    y -= sh
                    drawRect(c, Offset(left, y), Size(bw, sh))
                }
                seg(d.done, x.done)
                seg(d.pending, if (d.date < today) x.overdue else x.pending)
                seg(d.missed, x.overdue) // left unfinished, moved on to the next day
                seg(d.cancelled, x.cancelled.copy(alpha = 0.6f))
            }
            if (d.date == today) drawCircle(todayColor, 2.5.dp.toPx(), Offset(left + bw / 2, 2.5.dp.toPx()))
        }
    }
    Row(Modifier.fillMaxWidth().padding(top = 4.dp)) {
        listOf(1, 8, 15, 22, n).forEachIndexed { idx, d ->
            Text(
                "$d", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f), textAlign = when (idx) { 0 -> androidx.compose.ui.text.style.TextAlign.Start; 4 -> androidx.compose.ui.text.style.TextAlign.End; else -> androidx.compose.ui.text.style.TextAlign.Center },
            )
        }
    }
    FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        listOf(x.done to "Completed", x.pending to "Left", x.overdue to "Not finished", x.cancelled.copy(alpha = 0.6f) to "Cancelled").forEach { (c, l) ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(10.dp).clip(RoundedCornerShape(3.dp)).background(c))
                Text(" $l", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun Breakdown(icon: @Composable () -> Unit, label: String, c: Counts) {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            icon()
            Text("  $label", Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${c.done}", color = LocalExtra.current.done, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
            Text(" / ${c.active} done", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
        }
        StackBar(c)
    }
}

@Composable
private fun DayRow(d: DayCounts, today: String, onClick: () -> Unit) {
    val x = LocalExtra.current
    val overdue = d.pending > 0 && d.date < today
    val notFinished = d.missed + if (overdue) d.pending else 0
    val total = d.pending + d.done + d.missed
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(horizontal = 4.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                Dates.shortLabel(d.date, today), Modifier.weight(1f),
                color = if (d.date == today) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                fontWeight = if (d.date == today) FontWeight.SemiBold else FontWeight.Normal,
            )
            Text("$total task${if (total == 1) "" else "s"}  ", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("${d.done} done  ", style = MaterialTheme.typography.labelMedium, color = x.done)
            if (notFinished > 0) Text("$notFinished not finished", style = MaterialTheme.typography.labelMedium, color = x.overdue)
            else Text("${d.pending} left", style = MaterialTheme.typography.labelMedium, color = x.pending)
        }
        StackBar(d.counts(), overdue = overdue)
    }
}

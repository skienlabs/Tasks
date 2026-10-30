package com.skienlabs.tasks.ui.teams

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.FileDownload
import androidx.compose.material.icons.outlined.LinkOff
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.Unarchive
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.skienlabs.tasks.data.Activity
import com.skienlabs.tasks.data.ApiException
import com.skienlabs.tasks.data.Dates
import com.skienlabs.tasks.data.Due
import com.skienlabs.tasks.data.Member
import com.skienlabs.tasks.data.Recurring
import com.skienlabs.tasks.data.Role
import com.skienlabs.tasks.data.Rule
import com.skienlabs.tasks.data.Store
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.data.Team
import com.skienlabs.tasks.data.TeamGroup
import com.skienlabs.tasks.data.TeamLink
import com.skienlabs.tasks.data.TeamTag
import com.skienlabs.tasks.data.Template
import com.skienlabs.tasks.ui.common.tagColor
import com.skienlabs.tasks.ui.theme.LocalExtra
import com.skienlabs.tasks.ui.theme.Palette
import kotlinx.coroutines.launch
import java.time.LocalDateTime
import java.time.YearMonth
import java.time.ZoneId

private val shape = RoundedCornerShape(20.dp)

@Composable
internal fun Modifier.teamCard(highlight: Color? = null): Modifier {
    val x = LocalExtra.current
    return this.clip(shape).background(x.card).border(1.dp, highlight ?: x.cardBorder, shape)
}

internal fun lateTask(t: Task, today: String, now: LocalDateTime): Boolean =
    t.isPending && ((Due.parse(t.dueAt)?.isBefore(now) == true) || t.date < today)

private fun Store.run(scope: kotlinx.coroutines.CoroutineScope, done: String? = null, after: () -> Unit = {}, block: suspend () -> Unit) {
    scope.launch {
        try {
            block(); done?.let { toast(it) }
        } catch (e: ApiException) {
            toast(e.message ?: "Something went wrong. Please try again.")
        } finally {
            after()
        }
    }
}

private val WEEKDAYS = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")

fun ruleLabel(r: Rule): String = when (r.freq) {
    "daily" -> "Every day"
    "weekdays" -> "Every weekday"
    "weekly" -> "Every " + (r.days ?: listOf(1)).joinToString(", ") { WEEKDAYS[it] }
    "monthly" -> if ((r.day ?: 1) >= 29) "Monthly on the ${r.day}th (or the month's last day)" else "Monthly on day ${r.day}"
    else -> ""
}

private val personColors = listOf("blue", "green", "purple", "orange", "pink", "teal", "indigo", "red", "brown", "yellow")
private fun colorOf(team: Team, uid: String?): String = personColors[team.members.indexOfFirst { it.uid == uid }.let { if (it < 0) 9 else it } % personColors.size]

// ---- Calendar ------------------------------------------------------------------------------

@Composable
fun TeamCalendar(team: Team, tasks: List<Task>, today: String, onOpen: (Task) -> Unit) {
    val x = LocalExtra.current
    var month by rememberSaveable { mutableStateOf(today.take(7)) }
    var day by rememberSaveable { mutableStateOf(today) }
    var who by rememberSaveable { mutableStateOf<String?>(null) }
    var whoMenu by remember { mutableStateOf(false) }
    val ym = YearMonth.parse(month)
    val grid = Dates.monthGrid(ym)
    val shown = tasks.filter { !it.isCancelled && (who == null || it.assignee == who) }
    val byDay = shown.groupBy { it.date }
    val now = rememberNow()
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Column(Modifier.fillMaxWidth().teamCard().padding(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { month = ym.minusMonths(1).toString() }) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, "Previous month") }
                    Text(
                        ym.month.getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.getDefault()) + " " + ym.year,
                        style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f), textAlign = TextAlign.Center,
                    )
                    IconButton(onClick = { month = ym.plusMonths(1).toString() }) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, "Next month") }
                }
                Box(Modifier.padding(horizontal = 4.dp)) {
                    FilterChip(selected = who != null, onClick = { whoMenu = true }, label = { Text(who?.let { team.member(it)?.name } ?: "Everyone") })
                    DropdownMenu(whoMenu, { whoMenu = false }) {
                        DropdownMenuItem(text = { Text("Everyone") }, onClick = { who = null; whoMenu = false })
                        team.members.forEach { m -> DropdownMenuItem(text = { Text(m.name) }, onClick = { who = m.uid; whoMenu = false }) }
                    }
                }
                Row(Modifier.fillMaxWidth().padding(top = 6.dp)) {
                    listOf("S", "M", "T", "W", "T", "F", "S").forEach { Text(it, Modifier.weight(1f), textAlign = TextAlign.Center, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                grid.chunked(7).forEach { week ->
                    Row(Modifier.fillMaxWidth()) {
                        week.forEach { d ->
                            val items = byDay[d] ?: emptyList()
                            val out = !d.startsWith(month)
                            val late = items.any { lateTask(it, today, now) }
                            Column(
                                Modifier.weight(1f).aspectRatio(0.82f).padding(2.dp).clip(RoundedCornerShape(10.dp))
                                    .background(if (d == today) MaterialTheme.colorScheme.primary.copy(alpha = 0.08f) else Color.Transparent)
                                    .border(1.dp, if (d == day) MaterialTheme.colorScheme.primary else Color.Transparent, RoundedCornerShape(10.dp))
                                    .clickable { day = d }.padding(3.dp),
                            ) {
                                Text(
                                    d.takeLast(2).trimStart('0'), style = MaterialTheme.typography.labelMedium,
                                    fontWeight = if (d == today) FontWeight.Bold else FontWeight.Normal,
                                    color = when { out -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f); d == today -> MaterialTheme.colorScheme.primary; late -> x.overdue; else -> MaterialTheme.colorScheme.onSurface },
                                )
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    items.take(6).forEach { t -> Box(Modifier.size(6.dp).clip(CircleShape).background(if (t.isDone) x.done.copy(alpha = 0.5f) else tagColor(colorOf(team, t.assignee)))) }
                                }
                            }
                        }
                    }
                }
                FlowRow(Modifier.padding(top = 8.dp, start = 4.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    team.members.take(10).forEach { m ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(8.dp).clip(CircleShape).background(tagColor(colorOf(team, m.uid))))
                            Text(" " + m.name.substringBefore(' '), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
        item {
            val list = (byDay[day] ?: emptyList()).sortedWith(compareBy({ !it.isPending }, { it.priority }))
            Column(Modifier.fillMaxWidth().teamCard().padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(Dates.longDate(day), style = MaterialTheme.typography.titleMedium)
                Text(if (list.isEmpty()) "Nothing planned" else "${list.size} task${if (list.size == 1) "" else "s"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                list.forEach { t ->
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { onOpen(t) }.padding(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.width(4.dp).height(32.dp).clip(RoundedCornerShape(2.dp)).background(tagColor(colorOf(team, t.assignee))))
                        Column(Modifier.weight(1f).padding(start = 10.dp)) {
                            Text(t.title, maxLines = 1, overflow = TextOverflow.Ellipsis, textDecoration = if (t.isDone) TextDecoration.LineThrough else null)
                            Text(team.member(t.assignee)?.name ?: "Former member", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (t.dueAt != null) DueChip(t)
                    }
                }
            }
        }
    }
}

// ---- Workload ------------------------------------------------------------------------------

@Composable
fun Workload(team: Team, tasks: List<Task>, today: String, onPerson: (Member) -> Unit) {
    val x = LocalExtra.current
    val now = rememberNow()
    val amber = if (x.dark) Color(0xFFFDD663) else Color(0xFFB06000)
    data class R(val m: Member, val open: Int, val week: Int, val late: Int, val urgent: Int, val review: Int)
    val weekEnd = Dates.addDays(today, 6)
    val rows = team.members.map { m ->
        val open = tasks.filter { it.assignee == m.uid && it.isPending }
        R(m, open.size, open.count { it.date <= weekEnd }, open.count { lateTask(it, today, now) }, open.count { it.priority == 1 }, tasks.count { it.assignee == m.uid && it.review == "waiting" })
    }.sortedWith(compareByDescending<R> { it.open }.thenBy { it.m.name.lowercase() })
    val most = (rows.maxOfOrNull { it.open } ?: 0).coerceAtLeast(1)
    val avg = if (rows.isEmpty()) 0.0 else rows.sumOf { it.open }.toDouble() / rows.size
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Text(
                "Open tasks per person · average ${String.format(java.util.Locale.US, "%.1f", avg)}. Busy people are marked so you can spread the work.",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        items(rows, key = { it.m.uid }) { r ->
            val heavy = r.open > 0 && r.open >= avg * 1.5 && r.open >= 3
            Row(Modifier.fillMaxWidth().teamCard().clickable { onPerson(r.m) }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                PersonMark(r.m, 36.dp)
                Column(Modifier.weight(1f).padding(start = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(r.m.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                        r.m.title?.let { Text("  $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1) }
                        if (heavy) Text("  BUSY", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = amber)
                    }
                    Box(Modifier.fillMaxWidth().padding(top = 6.dp).height(10.dp).clip(RoundedCornerShape(5.dp)).background(x.chip)) {
                        Box(Modifier.fillMaxWidth(r.open.toFloat() / most).height(10.dp).clip(RoundedCornerShape(5.dp)).background(if (heavy) amber else MaterialTheme.colorScheme.primary))
                        Box(Modifier.fillMaxWidth(r.late.toFloat() / most).height(10.dp).clip(RoundedCornerShape(5.dp)).background(x.overdue))
                    }
                    Text(
                        "${r.open} open · ${r.week} this week" + (if (r.late > 0) " · ${r.late} late" else "") + (if (r.urgent > 0) " · ${r.urgent} urgent" else "") + (if (r.review > 0) " · ${r.review} to review" else ""),
                        style = MaterialTheme.typography.bodySmall, color = if (r.late > 0) x.overdue else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
    }
}

// ---- Reports and export -----------------------------------------------------------------------

data class ReportRow(val m: Member, val total: Int, val done: Int, val onTime: Int, val open: Int, val late: Int)

fun reportRows(team: Team, tasks: List<Task>, from: String, to: String, today: String, now: LocalDateTime): Pair<List<ReportRow>, List<Task>> {
    val inRange = tasks.filter { it.date in from..to && !it.isCancelled }
    val rows = team.members.map { m ->
        val mine = inRange.filter { it.assignee == m.uid }
        val done = mine.filter { it.isDone }
        val onTime = done.count { t -> val due = Due.parse(t.dueAt); due == null || (t.completedAt ?: 0) <= due.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli() }
        ReportRow(m, mine.size, done.size, onTime, mine.size - done.size, mine.count { lateTask(it, today, now) })
    }.sortedWith(compareByDescending<ReportRow> { it.done }.thenByDescending { it.total })
    return rows to inRange
}

private fun csvCell(v: Any?): String {
    val s = v?.toString() ?: ""
    return if (Regex("[\",\\n]").containsMatchIn(s)) "\"" + s.replace("\"", "\"\"") + "\"" else s
}

private fun stamp(ms: Long?): String = ms?.let {
    java.time.Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))
} ?: ""

fun reportCsv(team: Team, tasks: List<Task>): String {
    fun name(uid: String?) = team.member(uid)?.name ?: if (uid == null) "" else "Former member"
    val header = listOf("Day", "Task", "Person", "Status", "Sign-off", "Priority", "Time limit", "Completed", "Given by", "Team tags", "Notes")
    val lines = listOf(header) + tasks.sortedBy { it.date }.map { t ->
        listOf(
            t.date, t.title, name(t.assignee), t.status, t.review ?: if (t.needsReview) "needed" else "", "P${t.priority}",
            t.dueAt?.replace('T', ' ') ?: "", stamp(t.completedAt), name(t.assignedBy), t.teamTagIds.mapNotNull { team.tag(it)?.name }.joinToString(" "), t.notes,
        )
    }
    return "﻿" + lines.joinToString("\r\n") { r -> r.joinToString(",") { csvCell(it) } }
}

/** A simple A4 report (people, then tasks), drawn with Android's own PDF writer. */
fun reportPdf(team: Team, rows: List<ReportRow>, tasks: List<Task>, from: String, to: String): ByteArray {
    val doc = android.graphics.pdf.PdfDocument()
    val w = 595
    val h = 842
    val margin = 40f
    val title = android.graphics.Paint().apply { textSize = 20f; isFakeBoldText = true; isAntiAlias = true }
    val sub = android.graphics.Paint().apply { textSize = 11f; color = 0xFF5F6368.toInt(); isAntiAlias = true }
    val head = android.graphics.Paint().apply { textSize = 10f; color = 0xFF5F6368.toInt(); isFakeBoldText = true; isAntiAlias = true }
    val body = android.graphics.Paint().apply { textSize = 11f; isAntiAlias = true }
    val line = android.graphics.Paint().apply { color = 0xFFE0E0E0.toInt(); strokeWidth = 1f }
    var pageNo = 1
    var page = doc.startPage(android.graphics.pdf.PdfDocument.PageInfo.Builder(w, h, pageNo).create())
    var c = page.canvas
    var y = margin + 10f
    fun newPage() {
        doc.finishPage(page)
        pageNo++
        page = doc.startPage(android.graphics.pdf.PdfDocument.PageInfo.Builder(w, h, pageNo).create())
        c = page.canvas
        y = margin + 10f
    }
    fun fit(text: String, p: android.graphics.Paint, width: Float): String {
        if (p.measureText(text) <= width) return text
        var s = text
        while (s.isNotEmpty() && p.measureText("$s…") > width) s = s.dropLast(1)
        return "$s…"
    }
    c.drawText(team.name, margin, y, title); y += 18f
    c.drawText("Team report · ${Dates.longDate(from)} – ${Dates.longDate(to)}", margin, y, sub); y += 24f
    val done = rows.sumOf { it.done }
    val total = rows.sumOf { it.total }
    c.drawText("$done of $total done · ${if (total > 0) done * 100 / total else 0}% complete · ${rows.sumOf { it.late }} late", margin, y, body); y += 26f
    val cols = floatArrayOf(margin, 220f, 310f, 370f, 430f, 490f)
    listOf("PERSON", "GIVEN", "DONE", "ON TIME", "OPEN", "LATE").forEachIndexed { i, s -> c.drawText(s, cols[i], y, head) }
    y += 6f; c.drawLine(margin, y, w - margin, y, line); y += 16f
    for (r in rows) {
        if (y > h - margin) newPage()
        c.drawText(fit(r.m.name, body, 170f), cols[0], y, body)
        listOf(r.total, r.done, r.onTime, r.open, r.late).forEachIndexed { i, v -> c.drawText("$v", cols[i + 1], y, body) }
        y += 6f; c.drawLine(margin, y, w - margin, y, line); y += 16f
    }
    y += 14f
    if (y > h - margin - 40) newPage()
    c.drawText("TASKS", margin, y, head); y += 16f
    for (t in tasks.sortedBy { it.date }) {
        if (y > h - margin) newPage()
        c.drawText(t.date, margin, y, body)
        c.drawText(fit(t.title, body, 250f), margin + 80f, y, body)
        c.drawText(fit(team.member(t.assignee)?.name ?: "Former member", body, 90f), margin + 340f, y, body)
        c.drawText(if (t.isDone) "Done" else "Open", margin + 440f, y, body)
        y += 6f; c.drawLine(margin, y, w - margin, y, line); y += 16f
    }
    doc.finishPage(page)
    val out = java.io.ByteArrayOutputStream()
    doc.writeTo(out)
    doc.close()
    return out.toByteArray()
}

@Composable
fun TeamReport(team: Team, tasks: List<Task>, today: String) {
    val context = LocalContext.current
    val x = LocalExtra.current
    var period by rememberSaveable { mutableStateOf("last") }
    val week = Dates.startOfWeek(today)
    val (from, to) = when (period) {
        "this" -> week to Dates.addDays(week, 6)
        "last" -> Dates.addDays(week, -7) to Dates.addDays(week, -1)
        else -> Dates.addDays(today, -29) to today
    }
    val now = rememberNow()
    val (rows, list) = reportRows(team, tasks, from, to, today, now)
    val done = rows.sumOf { it.done }
    val total = rows.sumOf { it.total }
    val best = rows.firstOrNull { it.done > 0 }
    val fileBase = "${team.name.replace(Regex("[^\\w -]"), "")} tasks $from to $to"
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("this" to "This week", "last" to "Last week", "30" to "Last 30 days").forEach { (k, l) -> FilterChip(selected = period == k, onClick = { period = k }, label = { Text(l) }) }
            }
        }
        item {
            Column(Modifier.fillMaxWidth().teamCard().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${Dates.longDate(from)} – ${Dates.longDate(to)}", style = MaterialTheme.typography.titleMedium)
                Text("$done of $total done" + (best?.let { " · most done: ${it.m.name} (${it.done})" } ?: ""), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(enabled = list.isNotEmpty(), onClick = { openBytes(context, "exports", "$fileBase.csv", "text/csv", reportCsv(team, list).toByteArray(), share = true) }) {
                        Icon(Icons.Outlined.FileDownload, null, Modifier.size(18.dp)); Text("  CSV")
                    }
                    OutlinedButton(enabled = list.isNotEmpty(), onClick = { openBytes(context, "exports", "$fileBase.pdf", "application/pdf", reportPdf(team, rows, list, from, to), share = true) }) {
                        Icon(Icons.Outlined.PictureAsPdf, null, Modifier.size(18.dp)); Text("  PDF")
                    }
                }
                Row(Modifier.fillMaxWidth().padding(top = 6.dp)) {
                    listOf("Person" to 2f, "Given" to 1f, "Done" to 1f, "On time" to 1.2f, "Late" to 1f).forEach { (l, w) ->
                        Text(l, Modifier.weight(w), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = if (l == "Person") TextAlign.Start else TextAlign.End)
                    }
                }
                rows.forEach { r ->
                    Row(Modifier.fillMaxWidth()) {
                        Text(r.m.name, Modifier.weight(2f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${r.total}", Modifier.weight(1f), textAlign = TextAlign.End)
                        Text("${r.done}", Modifier.weight(1f), textAlign = TextAlign.End)
                        Text("${r.onTime}", Modifier.weight(1.2f), textAlign = TextAlign.End)
                        Text("${r.late}", Modifier.weight(1f), textAlign = TextAlign.End, color = if (r.late > 0) x.overdue else MaterialTheme.colorScheme.onSurface)
                    }
                }
            }
        }
    }
}

// ---- A person's page ------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PersonSheet(store: Store, team: Team, member: Member, tasks: List<Task>?, today: String, onOpen: (Task) -> Unit, onAssign: (String) -> Unit, onDismiss: () -> Unit) {
    val x = LocalExtra.current
    val me = LocalMyUid.current
    val scope = rememberCoroutineScope()
    val m = team.member(member.uid) ?: member
    var editing by remember { mutableStateOf(false) }
    var title by remember { mutableStateOf(m.title ?: "") }
    val now = rememberNow()
    val mine = tasks?.filter { it.assignee == m.uid } ?: emptyList()
    val open = mine.filter { it.isPending }.sortedBy { it.dueAt ?: "${it.date}T99" }
    val from = Dates.addDays(today, -29)
    val recent = mine.filter { it.date in from..today && !it.isCancelled }
    val done = recent.filter { it.isDone }
    val onTime = done.count { t -> val due = Due.parse(t.dueAt); due == null || (t.completedAt ?: 0) <= due.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli() }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PersonMark(m, 52.dp)
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(m.name + if (m.uid == me) " (you)" else "", style = MaterialTheme.typography.titleLarge)
                    if (!editing) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(m.title ?: if (team.isAdmin || m.uid == me) "No job title" else (m.email ?: ""), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if ((team.isAdmin || m.uid == me) && !team.archived) IconButton(onClick = { editing = true }) { Icon(Icons.Outlined.Edit, "Edit job title", Modifier.size(18.dp)) }
                        }
                    }
                }
                RolePill(m.role)
            }
            if (editing) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(title, { title = it.take(60) }, Modifier.weight(1f), label = { Text("Job title") }, placeholder = { Text("e.g. Designer") }, singleLine = true)
                    TextButton(onClick = { store.run(scope, "Saved", after = { editing = false }) { store.setMemberTitle(team.id, m.uid, title) } }) { Text("Save") }
                }
            }
            m.email?.let { Text("$it · joined ${Dates.longDate(java.time.Instant.ofEpochMilli(m.joinedAt).atZone(ZoneId.systemDefault()).toLocalDate().toString())}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            val groups = team.groups.filter { m.uid in it.members }
            if (groups.isNotEmpty()) Text("Groups: " + groups.joinToString { it.name }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (team.isAdmin && tasks != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(
                        Triple("Open", "${open.size}", x.pending), Triple("Late", "${open.count { lateTask(it, today, now) }}", x.overdue),
                        Triple("Done (30 d)", "${done.size}", x.done), Triple("On time", if (done.isEmpty()) "–" else "${onTime * 100 / done.size}%", MaterialTheme.colorScheme.primary),
                    ).forEach { (l, v, c) ->
                        Column(Modifier.weight(1f).teamCard().padding(10.dp)) {
                            Text(v, style = MaterialTheme.typography.titleLarge, color = c)
                            Text(l, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                        }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Open tasks", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    if (!team.archived) TextButton(onClick = { onAssign(m.uid) }) { Text("Give a task") }
                }
                if (open.isEmpty()) Text("Nothing open.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                open.forEach { t ->
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { onOpen(t) }.padding(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(10.dp).clip(CircleShape).background(Palette.priority(t.priority, x)))
                        Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                            Text(t.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(Dates.shortLabel(t.date, today), style = MaterialTheme.typography.bodySmall, color = if (lateTask(t, today, now)) x.overdue else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (t.dueAt != null) DueChip(t)
                        if (m.uid != me && !team.archived) IconButton(onClick = { store.run(scope, "Reminder sent") { store.nudge(team.id, t) } }) { Icon(Icons.Outlined.NotificationsActive, "Remind about ${t.title}") }
                    }
                }
            }
        }
    }
}

// ---- Activity ----------------------------------------------------------------------------------

private val ACTIONS = mapOf(
    "created" to "created the team", "edited" to "edited the team", "settings" to "changed the team settings", "archived" to "archived the team",
    "unarchived" to "brought the team back", "invited" to "invited people", "joined" to "joined", "left" to "left", "removed" to "removed someone",
    "role" to "changed a role", "link" to "made a new invite link", "approved-join" to "let someone in", "given" to "gave a task",
    "reassigned" to "moved a task to someone else", "deleted" to "deleted a task", "completed" to "finished a task", "reopened" to "opened a task again",
    "moved" to "moved a task", "review-requested" to "finished a task (to review)", "approved" to "approved a task", "returned" to "sent a task back",
    "commented" to "commented", "nudged" to "sent a reminder", "status-done" to "marked a task done", "status-pending" to "opened a task again",
    "status-cancelled" to "cancelled a task", "group-created" to "made a group", "group-edited" to "edited a group", "group-deleted" to "deleted a group",
    "template-created" to "saved a template", "repeat-created" to "set up a repeating task", "repeat-edited" to "changed a repeating task", "repeat-deleted" to "stopped a repeating task",
)

private fun str(a: Activity, key: String): String? = (a.detail?.get(key) as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { it.isString }?.content

fun describeActivity(a: Activity, team: Team): String {
    fun name(uid: String?) = team.member(uid)?.name ?: "a former member"
    val what = when {
        a.action == "edited" && a.taskId != null -> "edited a task"
        a.action == "role" -> "made ${name(str(a, "uid"))} " + when (str(a, "role")) { "owner" -> "the owner"; "admin" -> "an admin"; else -> "a member" }
        a.action == "removed" -> "removed ${name(str(a, "uid"))}"
        a.action == "approved-join" -> "let in ${name(str(a, "uid"))}"
        a.action == "reassigned" -> "moved a task to ${name(str(a, "to"))}"
        a.action == "given" -> (a.detail?.get("to") as? kotlinx.serialization.json.JsonArray)?.let { to ->
            "gave " + (if (to.size > 1) "${to.size} people" else name((to.firstOrNull() as? kotlinx.serialization.json.JsonPrimitive)?.content)) + " a task"
        } ?: "gave a task"
        else -> ACTIONS[a.action] ?: a.action
    }
    val title = str(a, "title") ?: str(a, "name")
    return what + (title?.let { " · $it" } ?: "")
}

@Composable
fun ActivityLog(store: Store, team: Team) {
    val scope = rememberCoroutineScope()
    var items by remember(team.id) { mutableStateOf<List<Activity>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var more by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    val me = LocalMyUid.current
    fun load(before: Long?) {
        busy = true
        scope.launch {
            try {
                val list = store.loadActivity(team.id, before)
                items = if (before == null) list else (items ?: emptyList()) + list
                more = list.size == 50
            } catch (e: ApiException) {
                error = if (e.status == 0) "Connect to see the activity." else e.message
            } finally {
                busy = false
            }
        }
    }
    LaunchedEffect(team.id, team.updatedAt) { load(null) }
    val list = items
    when {
        list == null && error != null -> Text(error!!, Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        list == null -> LinearProgressIndicator(Modifier.fillMaxWidth().padding(16.dp))
        else -> LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            if (list.isEmpty()) item { Text("Nothing yet.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            var last = ""
            list.forEach { a ->
                val day = Dates.longDate(java.time.Instant.ofEpochMilli(a.createdAt).atZone(ZoneId.systemDefault()).toLocalDate().toString())
                if (day != last) {
                    last = day
                    item(key = "d$day${a.id}") { Text(day, Modifier.padding(top = 12.dp, bottom = 4.dp), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                item(key = a.id) {
                    Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.Top) {
                        PersonMark(team.member(a.uid) ?: Member(a.uid ?: "", name = a.name), 26.dp)
                        Text(
                            (if (a.uid == me) "You" else a.name) + " " + describeActivity(a, team),
                            Modifier.weight(1f).padding(horizontal = 10.dp), style = MaterialTheme.typography.bodyMedium,
                        )
                        Text(
                            java.time.Instant.ofEpochMilli(a.createdAt).atZone(ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("h:mm a")),
                            style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            if (more && list.isNotEmpty()) item { TextButton(enabled = !busy, onClick = { load(list.last().id) }) { Text("Older") } }
        }
    }
}

// ---- Settings ----------------------------------------------------------------------------------

@Composable
private fun SettingsCard(title: String, subtitle: String? = null, action: @Composable () -> Unit = {}, content: @Composable () -> Unit = {}) {
    Column(Modifier.fillMaxWidth().teamCard().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            action()
        }
        content()
    }
}

@Composable
private fun ColorRow(value: String, onChange: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Palette.tags.keys.forEach { k ->
            Box(Modifier.size(30.dp).clip(CircleShape).background(tagColor(k)).border(2.dp, if (k == value) MaterialTheme.colorScheme.onSurface else Color.Transparent, CircleShape).clickable { onChange(k) })
        }
    }
}

@Composable
fun InviteLinkCard(store: Store, team: Team) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    var link by remember(team.id) { mutableStateOf<TeamLink?>(null) }
    var loaded by remember(team.id) { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    LaunchedEffect(team.id) {
        link = runCatching { store.teamLink(team.id) }.getOrNull()
        loaded = true
    }
    SettingsCard("Invite link", "Anyone with the link can ask to join. You approve each request, so a link that travels too far lets nobody in.") {
        val l = link
        when {
            !loaded -> LinearProgressIndicator(Modifier.fillMaxWidth())
            l == null -> Button(enabled = !busy && !team.archived, onClick = {
                busy = true; store.run(scope, after = { busy = false }) { link = store.makeTeamLink(team.id) }
            }) { Text("Make an invite link") }
            else -> {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    QrImage(l.qr, 132)
                    Column(Modifier.weight(1f).padding(start = 12.dp)) {
                        Text(l.url, style = MaterialTheme.typography.bodySmall, maxLines = 3, overflow = TextOverflow.Ellipsis)
                        Text("People scan the QR code with their phone camera, or open the link.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                    }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    TextButton(onClick = { clipboard.setText(AnnotatedString(l.url)); store.toast("Link copied") }) { Icon(Icons.Outlined.ContentCopy, null, Modifier.size(18.dp)); Text(" Copy") }
                    TextButton(onClick = {
                        val send = android.content.Intent(android.content.Intent.ACTION_SEND).setType("text/plain")
                            .putExtra(android.content.Intent.EXTRA_TEXT, "Join ${team.name} on Tasks: ${l.url}")
                        context.startActivity(android.content.Intent.createChooser(send, "Share the invite link").addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
                    }) { Icon(Icons.Outlined.Share, null, Modifier.size(18.dp)); Text(" Share") }
                    TextButton(enabled = !busy, onClick = { busy = true; store.run(scope, "New link made; the old one no longer works", after = { busy = false }) { link = store.makeTeamLink(team.id) } }) {
                        Icon(Icons.Outlined.Refresh, null, Modifier.size(18.dp)); Text(" New link")
                    }
                    TextButton(enabled = !busy, onClick = { busy = true; store.run(scope, "Invite link turned off", after = { busy = false }) { store.stopTeamLink(team.id); link = null } }) {
                        Icon(Icons.Outlined.LinkOff, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.error); Text(" Turn off", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
    }
}

@Composable
private fun GroupDialog(store: Store, team: Team, group: TeamGroup?, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(group?.name ?: "") }
    var color by remember { mutableStateOf(group?.color ?: "blue") }
    var members by remember { mutableStateOf(group?.members ?: emptyList()) }
    var busy by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(if (group == null) "New group" else "Edit group") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(name, { name = it.take(40) }, label = { Text("Name") }, placeholder = { Text("e.g. Design, Night shift") }, singleLine = true)
                ColorRow(color) { color = it }
                Text("People in it", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    team.members.forEach { m ->
                        FilterChip(selected = m.uid in members, onClick = { members = if (m.uid in members) members - m.uid else members + m.uid }, label = { Text(m.name) })
                    }
                }
            }
        },
        confirmButton = {
            TextButton(enabled = name.isNotBlank() && !busy, onClick = {
                busy = true
                store.run(scope, if (group == null) "Group made" else "Group saved", after = { busy = false }) { store.saveGroup(team.id, group?.id, name, color, members); onDismiss() }
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") } },
    )
}

@Composable
private fun TagDialog(store: Store, team: Team, tag: TeamTag?, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(tag?.name ?: "") }
    var color by remember { mutableStateOf(tag?.color ?: "blue") }
    var busy by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(if (tag == null) "New team tag" else "Edit team tag") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(name, { name = it.take(40) }, label = { Text("Name") }, placeholder = { Text("e.g. Urgent, Client A") }, singleLine = true)
                ColorRow(color) { color = it }
            }
        },
        confirmButton = {
            TextButton(enabled = name.isNotBlank() && !busy, onClick = {
                busy = true
                store.run(scope, after = { busy = false }) { store.saveTeamTag(team.id, tag?.id, name, color); onDismiss() }
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") } },
    )
}

@Composable
fun RulePicker(rule: Rule?, onChange: (Rule?) -> Unit) {
    val freq = rule?.freq ?: "never"
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Repeat", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("never" to "Never", "daily" to "Daily", "weekdays" to "Weekdays", "weekly" to "Weekly", "monthly" to "Monthly").forEach { (k, l) ->
                FilterChip(selected = freq == k, onClick = {
                    onChange(when (k) { "never" -> null; "weekly" -> Rule("weekly", days = rule?.days ?: listOf(1)); "monthly" -> Rule("monthly", day = rule?.day ?: 1); else -> Rule(k) })
                }, label = { Text(l) })
            }
        }
        if (freq == "weekly") {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                WEEKDAYS.forEachIndexed { i, d ->
                    val on = i in (rule?.days ?: emptyList())
                    FilterChip(selected = on, onClick = {
                        val days = if (on) (rule?.days ?: emptyList()) - i else ((rule?.days ?: emptyList()) + i).sorted()
                        if (days.isNotEmpty()) onChange(Rule("weekly", days = days))
                    }, label = { Text(d) })
                }
            }
        }
        if (freq == "monthly") {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Day of the month: ", style = MaterialTheme.typography.bodyMedium)
                IconButton(onClick = { onChange(Rule("monthly", day = ((rule?.day ?: 1) - 1).coerceAtLeast(1))) }) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, "Earlier day") }
                Text("${rule?.day ?: 1}", style = MaterialTheme.typography.titleMedium)
                IconButton(onClick = { onChange(Rule("monthly", day = ((rule?.day ?: 1) + 1).coerceAtMost(31))) }) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, "Later day") }
            }
        }
    }
}

@Composable
fun TeamSettingsPane(store: Store, team: Team, onUseTemplate: (Template) -> Unit, onDelete: () -> Unit) {
    val scope = rememberCoroutineScope()
    val teams by store.teams.collectAsStateWithLifecycle()
    var group by remember { mutableStateOf<TeamGroup?>(null) }
    var newGroup by remember { mutableStateOf(false) }
    var tag by remember { mutableStateOf<TeamTag?>(null) }
    var newTag by remember { mutableStateOf(false) }
    var editRule by remember { mutableStateOf<Recurring?>(null) }
    var archiving by remember { mutableStateOf(false) }
    LaunchedEffect(team.id) {
        runCatching { store.loadTemplates(team.id) }
        runCatching { store.loadRecurring(team.id) }
    }
    val templates = teams.templates[team.id]
    val recurring = teams.recurring[team.id]
    val owner = team.role == Role.OWNER
    val live = !team.archived
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (team.archived) item {
            Text("This team is archived: everything stays readable, but nothing can change until its owner brings it back.",
                Modifier.fillMaxWidth().teamCard().padding(14.dp), style = MaterialTheme.typography.bodyMedium)
        }
        item {
            SettingsCard("Who can give tasks") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Members can give tasks too", style = MaterialTheme.typography.bodyLarge)
                        Text("They can give tasks to anyone in the team and follow the ones they gave. Off: only the owner and admins.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(checked = team.settings.membersCanAssign, enabled = live, onCheckedChange = { on ->
                        store.run(scope, if (on) "Members can give tasks now" else "Only admins give tasks now") { store.setMembersCanAssign(team.id, on) }
                    })
                }
            }
        }
        item { InviteLinkCard(store, team) }
        item {
            SettingsCard("Groups", "Smaller groups inside the team (Design, Sales, Night shift…). Give a task to a whole group at once.",
                action = { if (live) IconButton(onClick = { newGroup = true }) { Icon(Icons.Outlined.Add, "New group") } }) {
                if (team.groups.isEmpty()) Text("No groups yet.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                team.groups.forEach { g ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(12.dp).clip(RoundedCornerShape(4.dp)).background(tagColor(g.color)))
                        Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                            Text(g.name, style = MaterialTheme.typography.bodyLarge)
                            Text(if (g.members.isEmpty()) "Nobody yet" else g.members.joinToString { (team.member(it)?.name ?: "?").substringBefore(' ') }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        if (live) {
                            IconButton(onClick = { group = g }) { Icon(Icons.Outlined.Edit, "Edit ${g.name}") }
                            IconButton(onClick = { store.run(scope, "Group deleted") { store.deleteGroup(team.id, g.id) } }) { Icon(Icons.Outlined.DeleteOutline, "Delete ${g.name}") }
                        }
                    }
                }
            }
        }
        item {
            SettingsCard("Team tags", "Tags everyone in the team sees on its tasks (Urgent, Client A…). People keep their own tags too.",
                action = { if (live) IconButton(onClick = { newTag = true }) { Icon(Icons.Outlined.Add, "New team tag") } }) {
                if (team.tags.isEmpty()) Text("No team tags yet.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    team.tags.forEach { t ->
                        val c = tagColor(t.color)
                        Row(
                            Modifier.clip(RoundedCornerShape(8.dp)).background(c.copy(alpha = 0.12f)).border(1.dp, c.copy(alpha = 0.4f), RoundedCornerShape(8.dp))
                                .clickable(enabled = live) { tag = t }.padding(start = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("# ${t.name}", color = c, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelLarge)
                            if (live) IconButton(onClick = { store.run(scope, "Team tag deleted") { store.deleteTeamTag(team.id, t.id) } }, modifier = Modifier.size(32.dp)) {
                                Icon(Icons.Outlined.DeleteOutline, "Delete ${t.name}", Modifier.size(16.dp), tint = c)
                            }
                        }
                    }
                }
            }
        }
        item {
            SettingsCard("Templates", "Tasks you give often. Save one from Give a task (Save as template), then start from it.") {
                if (templates == null) LinearProgressIndicator(Modifier.fillMaxWidth())
                else if (templates.isEmpty()) Text("No templates yet.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                templates?.forEach { tp ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(tp.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                listOfNotNull(if (tp.subtasks.isNotEmpty()) "${tp.subtasks.size} steps" else null, tp.dueTime?.let { "by $it" }, if (tp.needsReview) "needs sign-off" else null).joinToString(" · ").ifBlank { tp.title },
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1,
                            )
                        }
                        if (live) {
                            TextButton(onClick = { onUseTemplate(tp) }) { Text("Use") }
                            IconButton(onClick = { store.run(scope, "Template deleted") { store.deleteTemplate(team.id, tp.id) } }) { Icon(Icons.Outlined.DeleteOutline, "Delete ${tp.name}") }
                        }
                    }
                }
            }
        }
        item {
            SettingsCard("Repeating tasks", "Given out by themselves on their days. Set one up from Give a task, then Repeat.") {
                if (recurring == null) LinearProgressIndicator(Modifier.fillMaxWidth())
                else if (recurring.isEmpty()) Text("None yet.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                recurring?.forEach { r ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(r.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, color = if (r.active) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(
                                ruleLabel(r.rule) + " · " + (if (r.assignees.size > 2) "${r.assignees.size} people" else r.assignees.joinToString { (team.member(it)?.name ?: "?").substringBefore(' ') }) +
                                    if (r.active) " · next ${Dates.longDate(r.nextDate)}" else " · paused",
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2,
                            )
                        }
                        if (live) {
                            IconButton(onClick = { store.run(scope, if (r.active) "Paused" else "Resumed") { store.saveRecurring(team.id, r.id, active = !r.active) } }) {
                                Icon(if (r.active) Icons.Outlined.Pause else Icons.Outlined.PlayArrow, if (r.active) "Pause ${r.title}" else "Resume ${r.title}")
                            }
                            IconButton(onClick = { editRule = r }) { Icon(Icons.Outlined.Edit, "Change when ${r.title} repeats") }
                            IconButton(onClick = { store.run(scope, "Stopped repeating") { store.deleteRecurring(team.id, r.id) } }) { Icon(Icons.Outlined.DeleteOutline, "Stop ${r.title}") }
                        }
                    }
                }
            }
        }
        if (owner) item {
            SettingsCard(
                if (team.archived) "Bring the team back" else "Archive the team",
                if (team.archived) "Everyone can work in it again." else "For a finished project: it stays readable for everyone, but nothing new happens in it.",
                action = {
                    OutlinedButton(onClick = { if (team.archived) store.run(scope, "${team.name} is back") { store.archiveTeam(team.id, false) } else archiving = true }) {
                        Icon(if (team.archived) Icons.Outlined.Unarchive else Icons.Outlined.Archive, null, Modifier.size(18.dp)); Text(if (team.archived) " Unarchive" else " Archive")
                    }
                },
            )
        }
        if (owner) item {
            SettingsCard("Delete the team", "Deleted for everyone. Tasks it gave out stay in each person's list, as their own.", action = {
                OutlinedButton(onClick = onDelete) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            })
        }
    }
    if (newGroup || group != null) GroupDialog(store, team, group) { newGroup = false; group = null }
    if (newTag || tag != null) TagDialog(store, team, tag) { newTag = false; tag = null }
    editRule?.let { r ->
        var rule by remember(r.id) { mutableStateOf<Rule?>(r.rule) }
        AlertDialog(
            onDismissRequest = { editRule = null },
            title = { Text("When it repeats") },
            text = { RulePicker(rule) { if (it != null) rule = it } },
            confirmButton = { TextButton(onClick = { val nr = rule; store.run(scope, "Saved", after = { editRule = null }) { if (nr != null) store.saveRecurring(team.id, r.id, rule = nr) } }) { Text("Save") } },
            dismissButton = { TextButton(onClick = { editRule = null }) { Text("Cancel") } },
        )
    }
    if (archiving) AlertDialog(
        onDismissRequest = { archiving = false },
        title = { Text("Archive ${team.name}?") },
        text = { Text("People keep their tasks. Nobody can give new tasks, comment or invite until you bring it back.") },
        confirmButton = { TextButton(onClick = { store.run(scope, "${team.name} archived", after = { archiving = false }) { store.archiveTeam(team.id, true) } }) { Text("Archive") } },
        dismissButton = { TextButton(onClick = { archiving = false }) { Text("Cancel") } },
    )
}

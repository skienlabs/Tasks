package com.skienlabs.tasks.ui.teams

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skienlabs.tasks.data.Due
import com.skienlabs.tasks.data.Member
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.data.TaskAccess
import com.skienlabs.tasks.data.Team
import com.skienlabs.tasks.data.TeamsState
import com.skienlabs.tasks.ui.common.tagColor
import com.skienlabs.tasks.ui.theme.LocalExtra
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset

/** The teams I'm in (and my uid), for badges and what a task's menu offers. */
val LocalTeams = staticCompositionLocalOf { TeamsState() }
val LocalMyUid = staticCompositionLocalOf<String?> { null }

/** Team tasks are worked on by their person; their admins change what the task is. */
@Composable
fun accessOf(task: Task): TaskAccess {
    if (task.teamId == null) return TaskAccess(null, false)
    val team = LocalTeams.current.team(task.teamId)
    return TaskAccess(team, team?.isAdmin != true)
}

@Composable
fun memberName(teamId: String?, uid: String?): String? {
    if (uid == null) return null
    if (uid == LocalMyUid.current) return "you"
    return LocalTeams.current.team(teamId)?.member(uid)?.name
}

/** The time now, ticking every half minute (for countdowns). */
@Composable
fun rememberNow(): LocalDateTime {
    var now by remember { mutableStateOf(LocalDateTime.now()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            now = LocalDateTime.now()
        }
    }
    return now
}

/** "Fri 5:00 PM · 2d left": amber within a day, red once it has passed. */
@Composable
fun DueChip(task: Task, large: Boolean = false) {
    val x = LocalExtra.current
    val now = rememberNow()
    val info = Due.describe(task.dueAt, now, done = task.isDone, completedAt = task.completedAt) ?: return
    val muted = !task.isPending
    val amber = if (x.dark) Color(0xFFFDD663) else Color(0xFFB06000)
    val c = when {
        muted -> MaterialTheme.colorScheme.onSurfaceVariant
        info.tone == Due.Tone.OVER -> x.overdue
        info.tone == Due.Tone.SOON -> amber
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    val strong = !muted && (info.tone == Due.Tone.OVER || info.tone == Due.Tone.SOON)
    Row(
        Modifier.height(if (large) 26.dp else 22.dp).clip(RoundedCornerShape(50))
            .background(if (strong) c.copy(alpha = if (x.dark) 0.16f else 0.11f) else x.chip)
            .padding(start = 6.dp, end = 8.dp)
            .semantics { contentDescription = "Time limit ${info.full}, ${info.left}" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.Timer, null, Modifier.size(if (large) 15.dp else 13.dp), tint = c)
        Text(
            " ${info.label}", color = if (strong) c else MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, maxLines = 1,
        )
        if (!task.isCancelled) {
            Text(
                " · ${info.left}", color = if (strong) c else MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.labelMedium, maxLines = 1,
            )
        }
    }
}

/** "Acme · from Boss": a task given out in a team. */
@Composable
fun TeamBadge(task: Task) {
    val x = LocalExtra.current
    val team = LocalTeams.current.team(task.teamId)
    val by = memberName(task.teamId, task.assignedBy)
    Row(
        Modifier.height(22.dp).clip(RoundedCornerShape(50)).background(x.chip).padding(start = 6.dp, end = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.Groups, null, Modifier.size(14.dp), tint = tagColor(team?.color ?: "grey"))
        Text(
            " " + (team?.name ?: "Team task") + if (by != null && by != "you") " · from ${by.substringBefore(' ')}" else "",
            color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 240.dp),
        )
    }
}

/** A team's mark: initials on its colour, a rounded square (people are round). */
@Composable
fun TeamMark(name: String, color: String, size: Dp = 40.dp) {
    val c = tagColor(color)
    val initials = name.split(Regex("\\s+")).filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1).uppercase() }
    Box(
        Modifier.size(size).clip(RoundedCornerShape(if (size > 32.dp) 12.dp else 8.dp)).background(c.copy(alpha = if (LocalExtra.current.dark) 0.16f else 0.12f))
            .border(1.dp, c.copy(alpha = 0.4f), RoundedCornerShape(if (size > 32.dp) 12.dp else 8.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Text(initials.ifEmpty { "?" }, color = c, fontWeight = FontWeight.Bold, fontSize = (size.value * 0.38f).sp)
    }
}

@Composable
fun TeamMark(team: Team, size: Dp = 40.dp) = TeamMark(team.name, team.color, size)

@Composable
fun PersonMark(m: Member?, size: Dp = 32.dp) {
    Box(Modifier.size(size).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
        Text(
            (m?.name?.takeIf { it.isNotBlank() } ?: m?.email ?: "?").take(1).uppercase(),
            color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Medium, fontSize = (size.value * 0.45f).sp,
        )
    }
}

@Composable
fun RolePill(role: String) {
    val x = LocalExtra.current
    val strong = role != com.skienlabs.tasks.data.Role.MEMBER
    Box(
        Modifier.clip(RoundedCornerShape(50))
            .background(if (strong) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f) else x.chip)
            .padding(horizontal = 8.dp, vertical = 2.dp),
    ) {
        Text(
            com.skienlabs.tasks.data.Role.label(role), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold,
            color = if (strong) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun toMillis(date: LocalDate) = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
private fun fromMillis(ms: Long) = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate()

/**
 * The optional time limit: off by default. Switched on it shows the date and time (tap either
 * to change it); a countdown then shows on the task.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TimeLimitField(value: String?, onChange: (String?) -> Unit, date: String, enabled: Boolean = true) {
    var pickDate by remember { mutableStateOf(false) }
    var pickTime by remember { mutableStateOf(false) }
    val t = Due.parse(value)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier.clip(RoundedCornerShape(12.dp)).clickable(enabled = enabled) { onChange(if (value == null) Due.default(date) else null) }
                .padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.Timer, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text("Time limit", style = MaterialTheme.typography.bodyLarge)
                Text(
                    if (!enabled) "Set by the team's admins" else if (value != null) "A countdown shows on the task" else "Finish by a date and time",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(checked = value != null, onCheckedChange = { on -> onChange(if (on) Due.default(date) else null) }, enabled = enabled)
        }
        if (t != null) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = true, enabled = enabled, onClick = { pickDate = true },
                    leadingIcon = { Icon(Icons.Outlined.CalendarMonth, null, Modifier.size(18.dp)) },
                    label = { Text(t.toLocalDate().format(java.time.format.DateTimeFormatter.ofPattern("EEE, d MMM yyyy"))) },
                )
                FilterChip(
                    selected = true, enabled = enabled, onClick = { pickTime = true },
                    leadingIcon = { Icon(Icons.Outlined.Schedule, null, Modifier.size(18.dp)) },
                    label = { Text(t.toLocalTime().format(java.time.format.DateTimeFormatter.ofLocalizedTime(java.time.format.FormatStyle.SHORT))) },
                )
            }
            if (t.isBefore(LocalDateTime.now())) {
                Text("This time has already passed", style = MaterialTheme.typography.bodySmall, color = LocalExtra.current.overdue)
            }
        }
    }
    if (pickDate && t != null) {
        val state = rememberDatePickerState(initialSelectedDateMillis = toMillis(t.toLocalDate()), yearRange = 1900..2999)
        DatePickerDialog(
            onDismissRequest = { pickDate = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { ms -> onChange(Due.format(fromMillis(ms).atTime(t.toLocalTime()))) }
                    pickDate = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { pickDate = false }) { Text("Cancel") } },
        ) { DatePicker(state) }
    }
    if (pickTime && t != null) {
        val state = rememberTimePickerState(initialHour = t.hour, initialMinute = t.minute)
        AlertDialog(
            onDismissRequest = { pickTime = false },
            confirmButton = {
                TextButton(onClick = {
                    onChange(Due.format(t.toLocalDate().atTime(state.hour, state.minute)))
                    pickTime = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { pickTime = false }) { Text("Cancel") } },
            text = { TimePicker(state) },
        )
    }
}

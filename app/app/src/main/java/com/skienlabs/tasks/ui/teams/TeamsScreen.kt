package com.skienlabs.tasks.ui.teams

import android.content.Intent
import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.outlined.AddTask
import androidx.compose.material.icons.outlined.AdminPanelSettings
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.GroupAdd
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.MailOutline
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.PersonOutline
import androidx.compose.material.icons.outlined.PersonRemove
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.outlined.Replay
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Tab
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.skienlabs.tasks.data.ApiException
import com.skienlabs.tasks.data.Dates
import com.skienlabs.tasks.data.Due
import com.skienlabs.tasks.data.Invite
import com.skienlabs.tasks.data.Member
import com.skienlabs.tasks.data.Role
import com.skienlabs.tasks.data.Steps
import com.skienlabs.tasks.data.Store
import com.skienlabs.tasks.data.Subtask
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.data.Team
import com.skienlabs.tasks.data.TeamInvite
import com.skienlabs.tasks.data.subtasksJson
import com.skienlabs.tasks.ui.common.tagColor
import com.skienlabs.tasks.ui.day.StepsEditor
import com.skienlabs.tasks.ui.theme.LocalExtra
import com.skienlabs.tasks.ui.theme.Palette
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

// The team board: what was given out in the last ~6 weeks and the next 6, plus whatever is open.
private fun boardRange(today: String) = Dates.addDays(today, -45) to Dates.addDays(today, 45)

private val cardShape = RoundedCornerShape(20.dp)

@Composable
private fun Modifier.card(highlight: Color? = null): Modifier {
    val x = LocalExtra.current
    return this.clip(cardShape).background(x.card).border(1.dp, highlight ?: x.cardBorder, cardShape)
}

/** Runs a team action; a refusal ("Only the owner can…") or no connection becomes a message. */
private fun Store.attempt(scope: kotlinx.coroutines.CoroutineScope, done: String? = null, after: () -> Unit = {}, block: suspend () -> Unit) {
    scope.launch {
        try {
            block()
            done?.let { toast(it) }
        } catch (e: ApiException) {
            toast(e.message ?: "Something went wrong. Please try again.")
        } finally {
            after()
        }
    }
}

/** What an admin sends people they invited (the server sends no email itself). */
fun inviteMessage(team: Team, emails: List<String>, baseUrl: String): String {
    val origin = baseUrl.trimEnd('/')
    val who = if (emails.size == 1) emails[0] else "the email address I invited"
    return listOf(
        "Hi! I've invited you to join \"${team.name}\" on Tasks, so we can share work there.",
        "",
        "1. Get the app: $origin/download/android (Android), or use it on the web at $origin",
        "2. Sign in with $who",
        "3. Open Teams and accept the invite: $origin/?v=teams",
    ).joinToString("\n")
}

private fun shareText(context: android.content.Context, subject: String, text: String) {
    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, subject).putExtra(Intent.EXTRA_TEXT, text)
    context.startActivity(Intent.createChooser(send, "Send the invite").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

/** Splits "a@x.com, b@y.com" into clean addresses (and the bits that aren't). */
fun parseEmails(text: String): Pair<List<String>, List<String>> {
    val good = mutableListOf<String>()
    val bad = mutableListOf<String>()
    for (raw in text.split(Regex("[\\s,;]+")).map { it.trim().removePrefix("<").removeSuffix(">") }.filter { it.isNotEmpty() }) {
        val e = raw.lowercase()
        if (Regex("^[^\\s@<>,;\"]+@[^\\s@<>,;\"]+\\.[^\\s@<>,;\".]{2,}$").matches(e)) { if (e !in good) good += e } else bad += raw
    }
    return good to bad
}

/**
 * Teams: invites waiting for me, my teams, and for each team its tasks and people. Admins give
 * out tasks and see who finished what; members see the tasks given to them.
 */
@Composable
fun TeamsScreen(
    store: Store,
    today: String,
    myUid: String?,
    baseUrl: String,
    onOpenTask: (Task) -> Unit,
) {
    val teamsState by store.teams.collectAsStateWithLifecycle()
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    var creating by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { runCatching { store.loadTeams() } }

    val team = teamsState.team(selected)
    LaunchedEffect(selected, team, teamsState.loaded) { if (selected != null && team == null && teamsState.loaded) selected = null }
    BackHandler(enabled = team != null) { selected = null }

    if (team != null) {
        TeamDetail(store, team, today, myUid, baseUrl, onOpenTask) { selected = null }
    } else {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Teams", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
                    FilledTonalButton(onClick = { creating = true }) {
                        Icon(Icons.Outlined.Groups, null, Modifier.size(18.dp)); Text("  New team")
                    }
                }
            }
            if (teamsState.invites.isNotEmpty()) item { Text("Invites for you", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 6.dp)) }
            items(teamsState.invites, key = { "i" + it.id }) { InviteCard(store, it) { t -> selected = t.id } }
            if (teamsState.invites.isNotEmpty() && teamsState.teams.isNotEmpty()) item { Text("Your teams", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 6.dp)) }
            items(teamsState.teams, key = { it.id }) { t ->
                Row(
                    Modifier.fillMaxWidth().card().clickable { selected = t.id }.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TeamMark(t, 42.dp)
                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                        Text(t.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            "${t.members.size} ${if (t.members.size == 1) "person" else "people"}" + if (t.isAdmin && t.invites.isNotEmpty()) " · ${t.invites.size} invited" else "",
                            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    RolePill(t.role)
                }
            }
            if (teamsState.teams.isEmpty() && teamsState.invites.isEmpty()) {
                item {
                    Column(Modifier.fillMaxWidth().card().padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Icon(Icons.Outlined.Groups, null, Modifier.size(40.dp), tint = MaterialTheme.colorScheme.primary)
                        Text("Work together", style = MaterialTheme.typography.titleLarge)
                        Text(
                            "Make a team for your company, invite people by their email, and give them tasks. You see who finished what; they see the tasks in their own list, on Android and on the web.",
                            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            "Invited somewhere? Sign in with the email that was invited and the invite shows up here.",
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        OutlinedButton(onClick = { creating = true }) { Text("Create a team") }
                    }
                }
            }
        }
    }
    if (creating) TeamFormSheet(store, null, onDismiss = { creating = false }) { selected = it.id }
}

@Composable
private fun InviteCard(store: Store, invite: Invite, onJoined: (Team) -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf("") }
    Column(Modifier.fillMaxWidth().card(MaterialTheme.colorScheme.primary.copy(alpha = 0.45f)).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TeamMark(invite.teamName, invite.teamColor, 44.dp)
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Text(invite.teamName, style = MaterialTheme.typography.titleMedium)
                Text(
                    "${invite.invitedByName} invited you as ${if (invite.role == Role.ADMIN) "an admin" else "a member"} · ${invite.memberCount} ${if (invite.memberCount == 1) "person" else "people"}",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.End) {
            TextButton(enabled = busy.isEmpty(), onClick = {
                busy = "decline"
                store.attempt(scope, "Invite declined", after = { busy = "" }) { store.declineInvite(invite.id) }
            }) { Text("Decline") }
            Button(enabled = busy.isEmpty(), onClick = {
                busy = "accept"
                store.attempt(scope, "You joined ${invite.teamName}", after = { busy = "" }) { onJoined(store.acceptInvite(invite.id)) }
            }, modifier = Modifier.padding(start = 8.dp)) {
                if (busy == "accept") CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary) else Text("Join team")
            }
        }
    }
}

private enum class TeamTab(val label: String) { OVERVIEW("Overview"), TASKS("Tasks"), MINE("My tasks"), PEOPLE("People") }

private fun isLate(t: Task, today: String, now: LocalDateTime): Boolean =
    t.isPending && ((Due.parse(t.dueAt)?.isBefore(now) == true) || t.date < today)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TeamDetail(store: Store, team: Team, today: String, myUid: String?, baseUrl: String, onOpenTask: (Task) -> Unit, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val admin = team.isAdmin
    val tabs = if (admin) listOf(TeamTab.OVERVIEW, TeamTab.TASKS, TeamTab.PEOPLE) else listOf(TeamTab.MINE, TeamTab.PEOPLE)
    var tab by rememberSaveable(team.id) { mutableStateOf(tabs.first()) }
    if (tab !in tabs) tab = tabs.first()
    var menu by remember { mutableStateOf(false) }
    var edit by remember { mutableStateOf(false) }
    var invite by remember { mutableStateOf(false) }
    var assign by remember { mutableStateOf<Pair<Task?, String?>?>(null) }
    var confirm by remember { mutableStateOf<Confirm?>(null) }
    val teamsState by store.teams.collectAsStateWithLifecycle()
    val sync by store.sync.collectAsStateWithLifecycle()
    val board = teamsState.boards[team.id]
    var boardError by remember(team.id) { mutableStateOf<String?>(null) }

    LaunchedEffect(team.id, admin, today) {
        if (!admin) return@LaunchedEffect
        val (from, to) = boardRange(today)
        boardError = null
        try {
            store.loadBoard(team.id, from, to)
        } catch (e: ApiException) {
            boardError = if (e.status == 0) "Connect to see your team's tasks." else e.message
        }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "All teams") }
                TeamMark(team, 44.dp)
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(team.name, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        "You are ${when (team.role) { Role.OWNER -> "the owner"; Role.ADMIN -> "an admin"; else -> "a member" }} · ${team.members.size} ${if (team.members.size == 1) "person" else "people"}",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1,
                    )
                }
                Box {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreVert, "Team options") }
                    DropdownMenu(menu, { menu = false }) {
                        if (admin) {
                            DropdownMenuItem(text = { Text("Invite people") }, leadingIcon = { Icon(Icons.Outlined.GroupAdd, null) }, onClick = { menu = false; invite = true })
                            DropdownMenuItem(text = { Text("Rename or recolour") }, leadingIcon = { Icon(Icons.Outlined.Edit, null) }, onClick = { menu = false; edit = true })
                            HorizontalDivider()
                        }
                        if (team.role != Role.OWNER) {
                            DropdownMenuItem(
                                text = { Text("Leave team", color = MaterialTheme.colorScheme.error) },
                                leadingIcon = { Icon(Icons.AutoMirrored.Outlined.Logout, null, tint = MaterialTheme.colorScheme.error) },
                                onClick = {
                                    menu = false
                                    confirm = Confirm(
                                        "Leave ${team.name}?", "Tasks the team gave you stay in your list, as your own. An admin can invite you again.", "Leave team",
                                    ) { store.removeMember(team.id, myUid ?: ""); store.toast("You left ${team.name}") }
                                },
                            )
                        } else {
                            DropdownMenuItem(
                                text = { Text("Delete team", color = MaterialTheme.colorScheme.error) },
                                leadingIcon = { Icon(Icons.Outlined.DeleteOutline, null, tint = MaterialTheme.colorScheme.error) },
                                onClick = {
                                    menu = false
                                    confirm = Confirm(
                                        "Delete ${team.name}?", "The team and its invites are deleted for everyone. Tasks it gave out stay in each person's list, as their own.", "Delete team",
                                    ) { store.deleteTeam(team.id); store.toast("${team.name} was deleted") }
                                },
                            )
                        }
                    }
                }
            }
            if (!sync.online) {
                Row(
                    Modifier.padding(horizontal = 16.dp, vertical = 4.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp))
                        .background(LocalExtra.current.chip).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Outlined.CloudOff, null, Modifier.size(18.dp))
                    Text("  You're offline. Team changes need a connection; your own tasks still work.", style = MaterialTheme.typography.bodySmall)
                }
            }
            PrimaryTabRow(selectedTabIndex = tabs.indexOf(tab), containerColor = Color.Transparent) {
                tabs.forEach { t -> Tab(selected = tab == t, onClick = { tab = t }, text = { Text(t.label) }) }
            }
            when (tab) {
                TeamTab.OVERVIEW, TeamTab.TASKS -> when {
                    board == null && boardError != null -> Text(boardError!!, Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    board == null -> LinearProgressIndicator(Modifier.fillMaxWidth().padding(16.dp))
                    tab == TeamTab.OVERVIEW -> Overview(team, board.tasks, today, myUid) { tab = TeamTab.TASKS }
                    else -> BoardList(store, team, board.tasks, today, myUid) { t -> assign = t to null }
                }
                TeamTab.MINE -> MyTeamTasks(store, team, today, onOpenTask)
                TeamTab.PEOPLE -> People(store, team, myUid, baseUrl) { invite = true }
            }
        }
        if (admin && tab != TeamTab.PEOPLE && board != null) {
            ExtendedFloatingActionButton(
                onClick = { assign = null to null },
                icon = { Icon(Icons.Outlined.AddTask, null) }, text = { Text("Give a task") },
                modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
            )
        }
    }

    if (edit) TeamFormSheet(store, team, onDismiss = { edit = false })
    if (invite) InviteSheet(store, team, baseUrl) { invite = false }
    assign?.let { (task, who) -> AssignSheet(store, team, task, who, today, myUid) { assign = null } }
    confirm?.let { c -> ConfirmDialog(c, store) { confirm = null } }
}

private class Confirm(val title: String, val text: String, val action: String, val run: suspend () -> Unit)

@Composable
private fun ConfirmDialog(c: Confirm, store: Store, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = { if (!busy) onDone() },
        title = { Text(c.title) },
        text = { Text(c.text) },
        confirmButton = {
            TextButton(enabled = !busy, onClick = {
                busy = true
                store.attempt(scope, after = { busy = false; onDone() }) { c.run() }
            }) { Text(c.action, color = MaterialTheme.colorScheme.error) }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onDone) { Text("Cancel") } },
    )
}

@Composable
private fun Overview(team: Team, tasks: List<Task>, today: String, myUid: String?, onOpenTasks: () -> Unit) {
    val x = LocalExtra.current
    var period by rememberSaveable { mutableStateOf("week") }
    val now = rememberNow()
    val from = when (period) { "week" -> Dates.startOfWeek(today); "7" -> Dates.addDays(today, -6); else -> Dates.addDays(today, -29) }
    val to = if (period == "week") Dates.addDays(Dates.startOfWeek(today), 6) else today
    fun inPeriod(t: Task) = if (t.isPending) t.date <= to else t.date in from..to
    data class R(val m: Member, val total: Int, val done: Int, val open: Int, val late: Int)
    val rows = team.members.map { m ->
        val mine = tasks.filter { it.assignee == m.uid && inPeriod(it) }
        R(m, mine.count { !it.isCancelled }, mine.count { it.isDone }, mine.count { it.isPending }, mine.count { isLate(it, today, now) })
    }.sortedWith(compareByDescending<R> { it.total }.thenBy { it.m.name.lowercase() })
    val soon = tasks.count { t -> t.isPending && Due.parse(t.dueAt)?.let { it.isAfter(now) && it.isBefore(now.plusDays(1)) } == true }
    val recent = tasks.filter { it.isDone && it.completedAt != null }.sortedByDescending { it.completedAt }.take(8)

    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("week" to "This week", "7" to "Last 7 days", "30" to "Last 30 days").forEach { (k, l) ->
                    FilterChip(selected = period == k, onClick = { period = k }, label = { Text(l) })
                }
            }
        }
        item {
            val amber = if (x.dark) Color(0xFFFDD663) else Color(0xFFB06000)
            val tiles = listOf(
                Triple("Done", rows.sumOf { it.done }, x.done), Triple("Open", rows.sumOf { it.open }, x.pending),
                Triple("Late", rows.sumOf { it.late }, x.overdue), Triple("Due within a day", soon, amber),
            )
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                tiles.chunked(2).forEach { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        pair.forEach { (label, v, c) ->
                            Column(Modifier.weight(1f).card().padding(14.dp)) {
                                Text("$v", style = MaterialTheme.typography.headlineMedium, color = c)
                                Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
        item {
            Column(Modifier.fillMaxWidth().card().padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("People", style = MaterialTheme.typography.titleMedium)
                rows.forEach { r ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        PersonMark(r.m, 32.dp)
                        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                            Text(r.m.name + if (r.m.uid == myUid) " (you)" else "", style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            LinearProgressIndicator(
                                progress = { if (r.total > 0) r.done.toFloat() / r.total else 0f },
                                modifier = Modifier.fillMaxWidth().padding(top = 6.dp).height(6.dp).clip(RoundedCornerShape(3.dp)),
                                color = x.done, trackColor = x.chip, drawStopIndicator = {},
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(if (r.total > 0) "${r.done}/${r.total} done" else "Nothing given", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if (r.late > 0) Text("${r.late} late", style = MaterialTheme.typography.bodySmall, color = x.overdue, fontWeight = FontWeight.SemiBold)
                            else if (r.open > 0) Text("${r.open} open", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                TextButton(onClick = onOpenTasks) { Text("See all team tasks") }
            }
        }
        item {
            Column(Modifier.fillMaxWidth().card().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Recently completed", style = MaterialTheme.typography.titleMedium)
                if (recent.isEmpty()) Text("Nothing finished yet.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                recent.forEach { t ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.CheckCircle, null, Modifier.size(20.dp), tint = x.done)
                        Column(Modifier.weight(1f).padding(start = 10.dp)) {
                            Text(t.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            val whenDone = Instant.ofEpochMilli(t.completedAt!!).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("EEE d MMM, h:mm a"))
                            Text("${team.member(t.assignee)?.name ?: "Former member"} · $whenDone", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if (t.dueAt != null) Box(Modifier.padding(top = 4.dp)) { DueChip(t) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BoardList(store: Store, team: Team, tasks: List<Task>, today: String, myUid: String?, onEdit: (Task) -> Unit) {
    var who by rememberSaveable { mutableStateOf<String?>(null) }
    var status by rememberSaveable { mutableStateOf("open") }
    var whoMenu by remember { mutableStateOf(false) }
    val shown = tasks.filter { who == null || it.assignee == who }
        .filter { when (status) { "open" -> it.isPending; "done" -> it.isDone; else -> true } }
        .sortedWith(
            if (status == "done") compareByDescending { it.completedAt ?: 0 }
            else compareBy<Task>({ !it.isPending }, { it.dueAt ?: "${it.date}T99" }, { it.priority }),
        )
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Box {
                    FilterChip(selected = who != null, onClick = { whoMenu = true }, label = { Text(who?.let { team.member(it)?.name } ?: "Everyone") })
                    DropdownMenu(whoMenu, { whoMenu = false }) {
                        DropdownMenuItem(text = { Text("Everyone") }, onClick = { who = null; whoMenu = false })
                        team.members.forEach { m -> DropdownMenuItem(text = { Text(m.name + if (m.uid == myUid) " (you)" else "") }, onClick = { who = m.uid; whoMenu = false }) }
                    }
                }
                listOf("open" to "Open", "done" to "Done", "all" to "All").forEach { (k, l) -> FilterChip(selected = status == k, onClick = { status = k }, label = { Text(l) }) }
            }
        }
        if (shown.isEmpty()) {
            item {
                Text(
                    when (status) { "open" -> "No open team tasks."; "done" -> "Nothing completed in the last six weeks."; else -> "No team tasks yet." },
                    Modifier.fillMaxWidth().card().padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        items(shown, key = { it.id }) { t -> BoardRow(store, team, t, today, onEdit) }
    }
}

@Composable
private fun BoardRow(store: Store, team: Team, task: Task, today: String, onEdit: (Task) -> Unit) {
    val x = LocalExtra.current
    val scope = rememberCoroutineScope()
    var menu by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf<Confirm?>(null) }
    val person = team.member(task.assignee)
    val late = isLate(task, today, rememberNow())
    Row(
        Modifier.fillMaxWidth().card(if (late) x.overdue.copy(alpha = 0.45f) else null).clickable { onEdit(task) }.padding(start = 12.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            when { task.isDone -> Icons.Filled.CheckCircle; task.isCancelled -> Icons.Filled.Block; else -> Icons.Outlined.RadioButtonUnchecked },
            null, Modifier.padding(top = 2.dp).size(22.dp),
            tint = when { task.isDone -> x.done; task.isCancelled -> MaterialTheme.colorScheme.onSurfaceVariant; else -> Palette.priority(task.priority, x) },
        )
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Text(
                task.title, style = MaterialTheme.typography.bodyLarge,
                textDecoration = if (task.isPending) null else TextDecoration.LineThrough,
                color = if (task.isPending) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PersonMark(person, 18.dp)
                    Text(" ${person?.name ?: "Former member"} · ${Dates.shortLabel(task.date, today)}", style = MaterialTheme.typography.bodySmall,
                        color = if (late && task.date < today) x.overdue else MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (task.dueAt != null) DueChip(task)
                val p = Steps.progress(task.subtasks)
                if (p.total > 0) Text("${p.done}/${p.total} steps", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (task.notes.isNotBlank()) Text(task.notes.lineSequence().first(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Box {
            IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreVert, "More actions for \"${task.title}\"") }
            DropdownMenu(menu, { menu = false }) {
                DropdownMenuItem(text = { Text("Edit or reassign") }, leadingIcon = { Icon(Icons.Outlined.Edit, null) }, onClick = { menu = false; onEdit(task) })
                if (task.isPending) {
                    DropdownMenuItem(text = { Text("Cancel task") }, leadingIcon = { Icon(Icons.Filled.Block, null) }, onClick = {
                        menu = false
                        store.attempt(scope) { store.updateTeamTask(team.id, task, buildJsonObject { put("status", "cancelled") }) }
                    })
                } else {
                    DropdownMenuItem(text = { Text("Open it again") }, leadingIcon = { Icon(Icons.Outlined.Replay, null) }, onClick = {
                        menu = false
                        store.attempt(scope) { store.updateTeamTask(team.id, task, buildJsonObject { put("status", "pending") }) }
                    })
                }
                DropdownMenuItem(
                    text = { Text("Delete", color = MaterialTheme.colorScheme.error) },
                    leadingIcon = { Icon(Icons.Outlined.DeleteOutline, null, tint = MaterialTheme.colorScheme.error) },
                    onClick = {
                        menu = false
                        confirm = Confirm("Delete this task?", "\"${task.title}\" disappears from ${person?.name?.let { "$it's" } ?: "their"} list too.", "Delete") {
                            store.deleteTeamTask(team.id, task); store.toast("Task deleted")
                        }
                    },
                )
            }
        }
    }
    confirm?.let { c -> ConfirmDialog(c, store) { confirm = null } }
}

@Composable
private fun MyTeamTasks(store: Store, team: Team, today: String, onOpenTask: (Task) -> Unit) {
    val x = LocalExtra.current
    val state by store.state.collectAsStateWithLifecycle()
    val mine = state.tasks.values.filter { it.teamId == team.id }
        .sortedWith(compareBy<Task>({ !it.isPending }, { it.dueAt ?: "${it.date}T99" })).take(50)
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Text(
                "Tasks given to you in ${team.name} are in your Tasks list too. Complete, postpone, tick steps and add notes there.",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (mine.isEmpty()) item { Text("No tasks from this team yet.", Modifier.fillMaxWidth().card().padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(mine, key = { it.id }) { t ->
            Row(Modifier.fillMaxWidth().card().clickable { onOpenTask(t) }.padding(12.dp), verticalAlignment = Alignment.Top) {
                Icon(if (t.isDone) Icons.Filled.CheckCircle else Icons.Outlined.RadioButtonUnchecked, null, Modifier.size(22.dp), tint = if (t.isDone) x.done else Palette.priority(t.priority, x))
                Column(Modifier.weight(1f).padding(start = 12.dp)) {
                    Text(t.title, style = MaterialTheme.typography.bodyLarge, textDecoration = if (t.isPending) null else TextDecoration.LineThrough)
                    FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        val by = team.member(t.assignedBy)?.name
                        Text(Dates.shortLabel(t.date, today) + (by?.let { " · from $it" } ?: ""), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (t.dueAt != null) DueChip(t)
                    }
                }
            }
        }
    }
}

@Composable
private fun People(store: Store, team: Team, myUid: String?, baseUrl: String, onInvite: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val admin = team.isAdmin
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Column(Modifier.fillMaxWidth().card().padding(vertical = 8.dp)) {
                Row(Modifier.padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("${team.members.size} ${if (team.members.size == 1) "person" else "people"}", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    if (admin) TextButton(onClick = onInvite) { Icon(Icons.Outlined.GroupAdd, null, Modifier.size(18.dp)); Text("  Invite") }
                }
                team.members.forEach { m -> PersonRow(store, team, m, myUid) }
            }
        }
        if (admin && team.invites.isNotEmpty()) {
            item {
                Column(Modifier.fillMaxWidth().card().padding(vertical = 8.dp)) {
                    Text("Waiting to join · ${team.invites.size}", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp))
                    team.invites.forEach { i -> InviteRow(store, team, i, scope) { shareText(context, "Join ${team.name} on Tasks", inviteMessage(team, listOf(i.email), baseUrl)) } }
                }
            }
        }
    }
}

@Composable
private fun InviteRow(store: Store, team: Team, i: TeamInvite, scope: kotlinx.coroutines.CoroutineScope, onShare: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(36.dp).clip(CircleShape).background(LocalExtra.current.chip), contentAlignment = Alignment.Center) { Icon(Icons.Outlined.MailOutline, null, Modifier.size(18.dp)) }
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(i.email, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${if (i.role == Role.ADMIN) "As admin" else "As member"} · invited by ${i.invitedByName}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        IconButton(onClick = onShare) { Icon(Icons.Outlined.Share, "Send ${i.email} the invite") }
        IconButton(onClick = { store.attempt(scope, "Invite cancelled") { store.cancelInvite(team.id, i.id) } }) { Icon(Icons.Outlined.DeleteOutline, "Cancel the invite for ${i.email}") }
    }
}

@Composable
private fun PersonRow(store: Store, team: Team, m: Member, myUid: String?) {
    var menu by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf<Confirm?>(null) }
    val scope = rememberCoroutineScope()
    val iOwn = team.role == Role.OWNER
    val me = m.uid == myUid
    val canPromote = team.isAdmin && !me && m.role == Role.MEMBER
    val canDemote = iOwn && m.role == Role.ADMIN
    val canTransfer = iOwn && !me
    val canRemove = team.isAdmin && !me && m.role != Role.OWNER && (iOwn || m.role == Role.MEMBER)
    Row(Modifier.fillMaxWidth().padding(start = 14.dp, end = 4.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        PersonMark(m, 36.dp)
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(m.name + if (me) " (you)" else "", style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            m.email?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
        RolePill(m.role)
        if (canPromote || canDemote || canTransfer || canRemove) {
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreVert, "Manage ${m.name}") }
                DropdownMenu(menu, { menu = false }) {
                    if (canPromote) DropdownMenuItem(text = { Text("Make admin") }, leadingIcon = { Icon(Icons.Outlined.AdminPanelSettings, null) }, onClick = {
                        menu = false; store.attempt(scope, "${m.name} is now an admin") { store.setRole(team.id, m.uid, Role.ADMIN) }
                    })
                    if (canDemote) DropdownMenuItem(text = { Text("Make member") }, leadingIcon = { Icon(Icons.Outlined.PersonOutline, null) }, onClick = {
                        menu = false; store.attempt(scope, "${m.name} is now a member") { store.setRole(team.id, m.uid, Role.MEMBER) }
                    })
                    if (canTransfer) DropdownMenuItem(text = { Text("Make owner") }, leadingIcon = { Icon(Icons.Outlined.Star, null) }, onClick = {
                        menu = false
                        confirm = Confirm("Hand ${team.name} over to ${m.name}?", "They become the owner and you stay on as an admin. Only they can undo this.", "Make owner") {
                            store.setRole(team.id, m.uid, Role.OWNER); store.toast("${m.name} now owns the team")
                        }
                    })
                    if (canRemove) DropdownMenuItem(
                        text = { Text("Remove from team", color = MaterialTheme.colorScheme.error) },
                        leadingIcon = { Icon(Icons.Outlined.PersonRemove, null, tint = MaterialTheme.colorScheme.error) },
                        onClick = {
                            menu = false
                            confirm = Confirm("Remove ${m.name}?", "Tasks the team gave them stay in their own list, as their own tasks.", "Remove") {
                                store.removeMember(team.id, m.uid); store.toast("${m.name} was removed")
                            }
                        },
                    )
                }
            }
        } else Spacer(Modifier.width(48.dp))
    }
    confirm?.let { c -> ConfirmDialog(c, store) { confirm = null } }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TeamFormSheet(store: Store, team: Team?, onDismiss: () -> Unit, onSaved: (Team) -> Unit = {}) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var name by rememberSaveable { mutableStateOf(team?.name ?: "") }
    var color by rememberSaveable { mutableStateOf(team?.color ?: "blue") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    ModalBottomSheet(onDismissRequest = { if (!busy) onDismiss() }, sheetState = sheet) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(if (team == null) "New team" else "Team settings", style = MaterialTheme.typography.titleLarge)
            Row(verticalAlignment = Alignment.CenterVertically) {
                TeamMark(name.ifBlank { "Team" }, color, 48.dp)
                Text(
                    if (team == null) "  A team for your company or crew. You can invite people next." else "  Everyone in the team sees the new name.",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            OutlinedTextField(
                name, { name = it.take(60) }, label = { Text("Team name") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
            )
            Text("Colour", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Palette.tags.keys.forEach { k ->
                    Box(Modifier.size(36.dp).clip(CircleShape).background(tagColor(k)).clickable { color = k }, contentAlignment = Alignment.Center) {
                        if (k == color) Icon(Icons.Filled.Check, Palette.tags[k]?.label, tint = if (LocalExtra.current.dark) Color.Black else Color.White)
                    }
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") }
                Button(enabled = name.isNotBlank() && !busy, modifier = Modifier.padding(start = 8.dp), onClick = {
                    busy = true
                    error = null
                    scope.launch {
                        try {
                            val saved = if (team == null) store.createTeam(name, color) else store.updateTeam(team.id, name, color)
                            onSaved(saved)
                            onDismiss()
                        } catch (e: ApiException) {
                            error = e.message
                        } finally {
                            busy = false
                        }
                    }
                }) { Text(if (team == null) "Create team" else "Save") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun InviteSheet(store: Store, team: Team, baseUrl: String, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var text by rememberSaveable { mutableStateOf("") }
    var role by rememberSaveable { mutableStateOf(Role.MEMBER) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var result by remember { mutableStateOf<com.skienlabs.tasks.data.InviteResult?>(null) }
    val (good, bad) = parseEmails(text)
    ModalBottomSheet(onDismissRequest = { if (!busy) onDismiss() }, sheetState = sheet) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            val r = result
            if (r != null) {
                Text("Invites sent", style = MaterialTheme.typography.titleLarge)
                if (r.invited.isNotEmpty()) {
                    Text(
                        "${if (r.invited.size == 1) "The invite is" else "${r.invited.size} invites are"} waiting in Tasks for ${r.invited.joinToString()}. They see it as soon as they sign in with that email.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                if (r.alreadyMembers.isNotEmpty()) Text("Already in the team: ${r.alreadyMembers.joinToString()}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (r.invited.isNotEmpty()) {
                    Text("Tasks doesn't send emails itself. Send them this message so they know where to go:", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    val msg = inviteMessage(r.team, r.invited, baseUrl)
                    Text(msg, style = MaterialTheme.typography.bodySmall, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(LocalExtra.current.chip).padding(12.dp))
                    Button(onClick = { shareText(context, "Join ${team.name} on Tasks", msg) }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Outlined.Share, null, Modifier.size(18.dp)); Text("  Send the invite message")
                    }
                }
                TextButton(onClick = onDismiss, modifier = Modifier.align(Alignment.End)) { Text("Done") }
            } else {
                Text("Invite to ${team.name}", style = MaterialTheme.typography.titleLarge)
                OutlinedTextField(
                    text, { text = it; error = null }, label = { Text("Email addresses") }, placeholder = { Text("anna@company.com, raj@gmail.com") },
                    minLines = 2, modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    supportingText = { Text("Separate several with commas. They join by signing in with this email.") },
                )
                Text("They join as", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    listOf(Role.MEMBER, Role.ADMIN).forEachIndexed { i, r2 ->
                        SegmentedButton(selected = role == r2, onClick = { role = r2 }, shape = SegmentedButtonDefaults.itemShape(i, 2)) { Text(Role.label(r2)) }
                    }
                }
                Text(
                    if (role == Role.ADMIN) "Admins give out tasks, see everyone's progress and manage people."
                    else "Members work on the tasks given to them: complete, postpone, tick steps, add notes and images.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") }
                    Button(enabled = good.isNotEmpty() && !busy, modifier = Modifier.padding(start = 8.dp), onClick = {
                        if (bad.isNotEmpty()) { error = "Not an email address: ${bad.take(3).joinToString()}"; return@Button }
                        busy = true
                        scope.launch {
                            try {
                                result = store.invite(team.id, good, role)
                            } catch (e: ApiException) {
                                error = e.message
                            } finally {
                                busy = false
                            }
                        }
                    }) { Text(if (good.size > 1) "Invite ${good.size} people" else "Invite") }
                }
            }
        }
    }
}

/** Give someone a task, or edit one already given ([task]). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AssignSheet(store: Store, team: Team, task: Task?, defaultAssignee: String?, today: String, myUid: String?, onDismiss: () -> Unit) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val key = task?.id ?: "new"
    var assignee by rememberSaveable(key) { mutableStateOf(task?.assignee ?: defaultAssignee ?: team.members.firstOrNull { it.uid != myUid }?.uid ?: myUid ?: "") }
    var title by rememberSaveable(key) { mutableStateOf(task?.title ?: "") }
    var notes by rememberSaveable(key) { mutableStateOf(task?.notes ?: "") }
    var priority by rememberSaveable(key) { mutableStateOf(task?.priority ?: 4) }
    var date by rememberSaveable(key) { mutableStateOf(task?.date ?: today) }
    var dueAt by rememberSaveable(key) { mutableStateOf(task?.dueAt) }
    var steps by remember(key) { mutableStateOf(task?.subtasks ?: emptyList<Subtask>()) }
    var whoMenu by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val valid = title.isNotBlank() && team.member(assignee) != null && (dueAt == null || Due.isValid(dueAt)) && (date >= today || date == task?.date)

    ModalBottomSheet(onDismissRequest = { if (!busy) onDismiss() }, sheetState = sheet) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(if (task == null) "Give a task" else "Edit team task", style = MaterialTheme.typography.titleLarge)
            Box {
                val m = team.member(assignee)
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).border(1.dp, LocalExtra.current.outline, RoundedCornerShape(12.dp))
                        .clickable { whoMenu = true }.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PersonMark(m, 28.dp)
                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                        Text("For", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text((m?.name ?: "Pick someone") + if (m?.uid == myUid) " (you)" else "", style = MaterialTheme.typography.bodyLarge)
                    }
                    m?.let { RolePill(it.role) }
                }
                DropdownMenu(whoMenu, { whoMenu = false }) {
                    team.members.forEach { mm ->
                        DropdownMenuItem(
                            text = { Text(mm.name + if (mm.uid == myUid) " (you)" else "") },
                            leadingIcon = { PersonMark(mm, 24.dp) },
                            onClick = { assignee = mm.uid; whoMenu = false },
                        )
                    }
                }
            }
            if (task != null && assignee != task.assignee) {
                Text("It moves to their list; your tags on it stay behind.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            OutlinedTextField(
                title, { title = it.replace("\n", " ").take(500) }, label = { Text("Task") }, maxLines = 4, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )
            OutlinedTextField(
                notes, { notes = it.take(5000) }, label = { Text("Details") }, placeholder = { Text("What needs to happen, links, who to ask…") },
                minLines = 2, maxLines = 8, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )
            StepsEditor(steps) { steps = it }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Priority", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    for (p in 1..4) {
                        SegmentedButton(
                            selected = priority == p, onClick = { priority = p }, shape = SegmentedButtonDefaults.itemShape(p - 1, 4),
                            icon = { Icon(if (p == 4) Icons.Outlined.Flag else Icons.Filled.Flag, null, Modifier.size(18.dp), tint = Palette.priority(p, LocalExtra.current)) },
                        ) { Text(Palette.priorityLabel(p), maxLines = 1) }
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Day", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("Today" to today, "Tomorrow" to Dates.addDays(today, 1), "Next week" to Dates.addDays(today, 7)).forEach { (l, d) ->
                        FilterChip(selected = date == d, onClick = { date = d }, label = { Text(l) })
                    }
                    if (date !in listOf(today, Dates.addDays(today, 1), Dates.addDays(today, 7))) FilterChip(selected = true, onClick = {}, label = { Text(Dates.shortLabel(date, today)) })
                }
            }
            TimeLimitField(dueAt, { dueAt = it }, date)
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") }
                Button(enabled = valid && !busy, modifier = Modifier.padding(start = 8.dp), onClick = {
                    busy = true
                    error = null
                    scope.launch {
                        try {
                            val cleanSteps = Steps.normalize(steps)
                            if (task == null) {
                                store.assignTask(team.id, buildJsonObject {
                                    put("assignee", assignee); put("title", title.trim()); put("notes", notes.trim()); put("priority", priority); put("date", date)
                                    dueAt?.let { put("dueAt", it) }
                                    if (cleanSteps.isNotEmpty()) put("subtasks", subtasksJson(cleanSteps))
                                })
                                store.toast("Task given")
                            } else {
                                val patch = buildJsonObject {
                                    if (assignee != task.assignee) put("assignee", assignee)
                                    if (title.trim() != task.title) put("title", title.trim())
                                    if (notes.trim() != task.notes) put("notes", notes.trim())
                                    if (priority != task.priority) put("priority", priority)
                                    if (date != task.date) put("date", date)
                                    if (dueAt != task.dueAt) { if (dueAt == null) put("dueAt", JsonNull) else put("dueAt", dueAt) }
                                    if (cleanSteps != task.subtasks) put("subtasks", subtasksJson(cleanSteps))
                                }
                                if (patch.isNotEmpty()) store.updateTeamTask(team.id, task, patch)
                                store.toast("Task saved")
                            }
                            onDismiss()
                        } catch (e: ApiException) {
                            error = e.message
                        } finally {
                            busy = false
                        }
                    }
                }) { Text(if (task == null) "Give task" else "Save") }
            }
        }
    }
}

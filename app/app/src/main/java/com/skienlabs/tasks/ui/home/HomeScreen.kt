package com.skienlabs.tasks.ui.home

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.Sell
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.MarkEmailUnread
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.animation.core.animateFloat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.skienlabs.tasks.AppController
import com.skienlabs.tasks.data.Dates
import com.skienlabs.tasks.data.Profile
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.data.TaskPatch
import com.skienlabs.tasks.data.ThemePref
import com.skienlabs.tasks.ui.account.AccountSheet
import com.skienlabs.tasks.ui.account.Avatar
import com.skienlabs.tasks.ui.common.AppLogo
import com.skienlabs.tasks.ui.day.DayPage
import com.skienlabs.tasks.ui.day.RowActions
import com.skienlabs.tasks.ui.day.TagFilterRow
import com.skienlabs.tasks.ui.day.WeekStrip
import com.skienlabs.tasks.ui.summary.SummaryScreen
import com.skienlabs.tasks.ui.tags.TagEditor
import com.skienlabs.tasks.ui.tags.TagsScreen
import com.skienlabs.tasks.ui.task.TaskSheet
import com.skienlabs.tasks.ui.theme.LocalExtra
import com.skienlabs.tasks.ui.theme.glassPanel
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.takeOrElse
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.time.YearMonth
import kotlin.math.abs

private const val TAB_TASKS = 0
private const val TAB_SUMMARY = 1
private const val TAB_TEAMS = 2
private const val TAB_TAGS = 3

private val PAGE_COUNT = (Dates.between(Dates.MIN, Dates.MAX) + 1).toInt()
private fun pageOf(date: String) = Dates.between(Dates.MIN, date).toInt()
private fun dateOf(page: Int) = Dates.addDays(Dates.MIN, page.toLong())

/** Which sheet is open, if any. A task sheet holds the task (null task = new). */
private sealed interface Sheet {
    data class TaskEdit(val task: Task?) : Sheet
    /** [date]: the task's day, when it may not be loaded yet (opened from search). */
    data class TaskView(val id: String, val date: String? = null) : Sheet
    data object Month : Sheet
    data object Account : Sheet
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(app: AppController, profile: Profile, theme: ThemePref) {
    val store = app.store
    val state by store.state.collectAsStateWithLifecycle()
    val sync by store.sync.collectAsStateWithLifecycle()
    val teams by store.teams.collectAsStateWithLifecycle()
    val today by app.today.collectAsStateWithLifecycle()
    val date by app.visibleDate.collectAsStateWithLifecycle()
    val visibleMonth by app.visibleMonth.collectAsStateWithLifecycle()
    val statsVersion by app.statsVersion.collectAsStateWithLifecycle()
    val savedFilter by remember(profile.uid) { app.prefs.tagFilter(profile.uid) }.collectAsStateWithLifecycle(null)
    val hideVerify by remember(profile.uid) { app.prefs.hideVerify(profile.uid) }.collectAsStateWithLifecycle(true)
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current

    var tab by rememberSaveable { mutableStateOf(TAB_TASKS) }
    var searching by rememberSaveable { mutableStateOf(false) }
    val recentSearches by remember(profile.uid) { app.prefs.recentSearches(profile.uid) }.collectAsStateWithLifecycle(emptyList())
    var sheet by remember { mutableStateOf<Sheet?>(null) }
    var newTag by remember { mutableStateOf(false) }
    val failed = remember { mutableStateMapOf<String, Boolean>() }
    val snackbar = remember { SnackbarHostState() }
    val quickAddFocus = remember { FocusRequester() }

    // A filter for a tag that no longer exists (deleted here or elsewhere) is dropped.
    val filter = savedFilter?.takeIf { id -> !state.tagsLoaded || state.tag(id) != null }
    LaunchedEffect(savedFilter, state.tagsLoaded, state.tags) {
        if (savedFilter != null && state.tagsLoaded && state.tag(savedFilter!!) == null) app.prefs.setTagFilter(profile.uid, null)
    }
    fun setFilter(id: String?) { scope.launch { app.prefs.setTagFilter(profile.uid, id) } }

    // ---- Messages -------------------------------------------------------------------
    LaunchedEffect(store) {
        // The newest message replaces the one on screen.
        store.toasts.collectLatest { t ->
            val result = withTimeoutOrNull(if (t.actionLabel != null) 6000L else 3500L) {
                snackbar.showSnackbar(t.message, t.actionLabel, withDismissAction = false, duration = SnackbarDuration.Indefinite)
            }
            if (result == null) snackbar.currentSnackbarData?.dismiss()
            if (result == SnackbarResult.ActionPerformed) t.action?.invoke()
        }
    }

    // ---- Loading --------------------------------------------------------------------
    suspend fun load(d: String, prefetch: Boolean) {
        val ok = app.refreshDay(d, prefetch)
        if (ok) failed.remove(d) else if (!prefetch) failed[d] = true
    }
    LaunchedEffect(date, today, profile.uid) {
        launch { load(date, prefetch = false) }
        // Neighbours, so swiping/tapping to them is instant.
        for (n in listOf(1L, -1L)) {
            val d = Dates.addDays(date, n)
            if (Dates.isValid(d) && d !in store.state.value.loadedDays) launch { load(d, prefetch = true) }
        }
        if (date != today && today !in store.state.value.loadedDays) launch { load(today, prefetch = true) }
    }
    val week = Dates.startOfWeek(date)
    LaunchedEffect(week, profile.uid) {
        app.visibleMonth.value = YearMonth.parse(date.take(7))
        app.refreshSummary()
    }
    LaunchedEffect(profile.uid) { app.refreshTags() }

    // A notification or an invite link opens Teams (the screen picks the team or the join sheet).
    val openTeamRequest by app.openTeamRequest.collectAsStateWithLifecycle()
    val joinRequest by app.joinRequest.collectAsStateWithLifecycle()
    val openTaskRequest by app.openTaskRequest.collectAsStateWithLifecycle()
    LaunchedEffect(openTaskRequest, state.tasks.size) {
        val t = openTaskRequest?.let { state.tasks[it] } ?: return@LaunchedEffect
        app.openTaskRequest.value = null
        searching = false
        tab = TAB_TASKS
        if (filter != null && filter !in t.tagIds) setFilter(null)
        app.visibleDate.value = t.date
        sheet = Sheet.TaskView(t.id, t.date)
    }
    LaunchedEffect(openTeamRequest, joinRequest) {
        if (openTeamRequest != null || joinRequest != null) {
            searching = false
            sheet = null
            tab = TAB_TEAMS
        }
    }

    // "+" on the widget: open a new task for today.
    val newTaskRequest by app.newTaskRequest.collectAsStateWithLifecycle()
    LaunchedEffect(newTaskRequest) {
        if (newTaskRequest) {
            app.newTaskRequest.value = false
            tab = TAB_TASKS
            app.visibleDate.value = app.today.value
            sheet = Sheet.TaskEdit(null)
        }
    }

    // Ask once for permission to post the end-of-day summary (Android 13+).
    val context = androidx.compose.ui.platform.LocalContext.current
    val notifPermission = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission(),
    ) { scope.launch { com.skienlabs.tasks.notify.DailySummary.reschedule(context) } }
    // Team news while the app is closed (checked about every 15 minutes).
    LaunchedEffect(profile.uid) { com.skienlabs.tasks.notify.TeamNotices.schedule(context) }
    LaunchedEffect(profile.uid) {
        if (android.os.Build.VERSION.SDK_INT < 33 || com.skienlabs.tasks.notify.DailySummary.canNotify(context)) return@LaunchedEffect
        if (app.prefs.notificationsAsked.first() || !app.prefs.dailySummary.first().enabled) return@LaunchedEffect
        app.prefs.setNotificationsAsked()
        kotlinx.coroutines.delay(1200) // let the day appear first
        notifPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
    }

    // ---- Day pager (moves with the selected date) -------------------------------------
    val pager = rememberPagerState(initialPage = pageOf(date)) { PAGE_COUNT }
    LaunchedEffect(pager) {
        snapshotFlow { pager.settledPage }.collect { p -> dateOf(p).let { if (it != app.visibleDate.value) app.visibleDate.value = it } }
    }
    LaunchedEffect(date) {
        val target = pageOf(date)
        val diff = target - pager.currentPage
        if (diff != 0) {
            if (abs(diff) <= 3) pager.animateScrollToPage(target) else pager.scrollToPage(target)
        }
    }
    fun go(d: String) {
        if (Dates.isValid(d)) app.visibleDate.value = d
    }

    BackHandler(enabled = tab != TAB_TASKS && !searching) { tab = TAB_TASKS }
    BackHandler(enabled = tab == TAB_TASKS && date != today && sheet == null && !searching) { go(today) }

    val manageTags = { if (state.tags.isEmpty()) newTag = true else { sheet = null; tab = TAB_TAGS } }
    val actions = remember(store, today) {
        RowActions(
            open = { sheet = Sheet.TaskEdit(it) },
            toggle = { if (it.isPending) store.completeTask(it.id) else store.restoreTask(it.id) },
            postpone = { store.postponeTask(it.id, today) },
            cancel = { store.cancelTask(it.id) },
            delete = { store.deleteTask(it.id) },
            moveToToday = { store.moveTasks(listOf(it.id), today) },
            setPriority = { t, p -> store.updateTask(t.id, TaskPatch(priority = p)) },
            setTags = { t, ids -> store.updateTask(t.id, TaskPatch(tagIds = ids)) },
            manageTags = { manageTags() },
            toggleStep = { t, stepId -> store.toggleStep(t.id, stepId) },
            view = { sheet = Sheet.TaskView(it.id) },
        )
    }

    val firstName = profile.name.trim().split(' ').firstOrNull()?.takeIf { it.isNotBlank() }
    androidx.compose.runtime.CompositionLocalProvider(
        com.skienlabs.tasks.ui.day.LocalGreetingName provides firstName,
        com.skienlabs.tasks.ui.teams.LocalTeams provides teams,
        com.skienlabs.tasks.ui.teams.LocalMyUid provides profile.uid,
        com.skienlabs.tasks.ui.teams.LocalStore provides store,
    ) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    if (tab == TAB_TASKS) {
                        Row(
                            Modifier.clip(RoundedCornerShape(12.dp)).clickable { app.visibleMonth.value = YearMonth.parse(date.take(7)); sheet = Sheet.Month }
                                .padding(horizontal = 6.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            DateTitle(date, date == today, Modifier.weight(1f, fill = false))
                            Icon(Icons.Filled.ArrowDropDown, "Open calendar")
                        }
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            AppLogo(28.dp)
                            Text("  Tasks", style = MaterialTheme.typography.titleLarge)
                        }
                    }
                },
                actions = {
                    if (tab == TAB_TASKS && date != today) {
                        IconButton(onClick = { go(today) }) { Icon(Icons.Outlined.Today, "Go to today") }
                    }
                    SyncBadge(sync)
                    com.skienlabs.tasks.ui.teams.NotificationsButton(store) { n ->
                        // My task: open it in its day; anything else about a team: open the team.
                        app.openNotice(n.taskId, n.teamId)
                    }
                    IconButton(onClick = { searching = true }) { Icon(Icons.Outlined.Search, "Search tasks") }
                    IconButton(onClick = { sheet = Sheet.Account }) { Avatar(profile, 32.dp) }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = LocalExtra.current.bar.takeOrElse { MaterialTheme.colorScheme.background },
                ),
            )
        },
        bottomBar = {
            val glass = LocalExtra.current.glass
            NavigationBar(
                containerColor = if (glass != null) Color.Transparent else LocalExtra.current.bar.takeOrElse { LocalExtra.current.surfaceHigh },
                modifier = if (glass != null) Modifier.glassPanel(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp), glass.panelStrong) else Modifier,
            ) {
                val items = listOf(
                    Triple("Tasks", Icons.Filled.CheckCircle, Icons.Outlined.CheckCircle),
                    Triple("Summary", Icons.Filled.Insights, Icons.Outlined.Insights),
                    Triple("Teams", Icons.Filled.Groups, Icons.Outlined.Groups),
                    Triple("Tags", Icons.Filled.Sell, Icons.Outlined.Sell),
                )
                items.forEachIndexed { i, (label, on, off) ->
                    NavigationBarItem(
                        selected = tab == i,
                        onClick = {
                            if (tab == i && i == TAB_TASKS) go(today) // tapping Tasks again jumps to today
                            tab = i
                        },
                        icon = {
                            val badge = if (i == TAB_TEAMS) teams.invites.size else 0
                            if (badge > 0) {
                                androidx.compose.material3.BadgedBox(badge = { androidx.compose.material3.Badge { Text("$badge") } }) {
                                    Icon(if (tab == i) on else off, "$label, $badge invite${if (badge == 1) "" else "s"}")
                                }
                            } else Icon(if (tab == i) on else off, null)
                        },
                        label = { Text(label) },
                    )
                }
            }
        },
        floatingActionButton = {
            if (tab == TAB_TASKS) {
                val (fabBg, fabFg) = com.skienlabs.tasks.ui.theme.fabColors()
                FloatingActionButton(containerColor = fabBg, contentColor = fabFg, onClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                    sheet = Sheet.TaskEdit(null)
                }) { Icon(Icons.Filled.Add, "New task") }
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
        containerColor = MaterialTheme.colorScheme.background,
        // Set outright: the Glass themes' page is see-through, which has no "content colour" of its own.
        contentColor = MaterialTheme.colorScheme.onBackground,
    ) { inner ->
        Box(Modifier.fillMaxSize().padding(inner)) {
            when (tab) {
                TAB_TASKS -> Column(Modifier.fillMaxSize()) {
                    AnimatedVisibility(profile.provider == "password" && !profile.emailVerified && !hideVerify) {
                        VerifyBanner(profile.email ?: "", onVerify = { sheet = Sheet.Account }, onHide = { scope.launch { app.prefs.setHideVerify(profile.uid) } })
                    }
                    WeekStrip(date, today, { state.summary[it] }, ::go)
                    if (state.tags.isNotEmpty()) {
                        TagFilterRow(state.tags, filter, ::setFilter) { tab = TAB_TAGS }
                    }
                    HorizontalPager(
                        state = pager,
                        // Rows use sideways swipes (complete / postpone), so days change via the week strip.
                        userScrollEnabled = false,
                        beyondViewportPageCount = 0,
                        key = { it },
                        modifier = Modifier.fillMaxSize(),
                    ) { page ->
                        val d = dateOf(page)
                        DayPage(
                            date = d, today = today, state = state, filter = filter,
                            failed = failed[d] == true,
                            onRetry = { scope.launch { load(d, prefetch = false) } },
                            actions = actions,
                            onAdd = { title, priority, tagIds, dueAt -> store.createTask(title, d, priority, "", tagIds, dueAt = dueAt).second },
                            onMoveAllToToday = { list -> store.moveTasks(list.map { it.id }, today) },
                            quickAddFocus = quickAddFocus,
                            bottomPadding = 0.dp,
                            onGoToday = { go(today) },
                        )
                    }
                }
                TAB_SUMMARY -> SummaryScreen(
                    { f, t, d ->
                        try {
                            // Changes made offline go first: asking for stats carries tasks over.
                            if (!store.drained()) throw com.skienlabs.tasks.data.ApiException(0, "You appear to be offline")
                            app.api.stats(f, t, d)
                        } catch (e: com.skienlabs.tasks.data.ApiException) {
                            // Offline: worked out from the copy on this phone.
                            if (e.status == 0) store.localStats(f, t, d) else throw e
                        }
                    },
                    { app.handleLoadError(it, quiet = true) }, today, state.tags,
                    // Offline, it follows the changes made here as they happen.
                    if (sync.online) statsVersion else statsVersion * 31 + state.tasks.hashCode(), 0.dp,
                ) { d ->
                    tab = TAB_TASKS
                    go(d)
                }
                TAB_TEAMS -> com.skienlabs.tasks.ui.teams.TeamsScreen(
                    store, today, profile.uid, com.skienlabs.tasks.BuildConfig.API_URL,
                    openTeam = openTeamRequest, joinToken = joinRequest,
                    onHandled = { app.openTeamRequest.value = null; app.joinRequest.value = null },
                ) { t ->
                    tab = TAB_TASKS
                    if (filter != null && filter !in t.tagIds) setFilter(null)
                    go(t.date)
                    sheet = Sheet.TaskView(t.id, t.date)
                }
                else -> TagsScreen(store, state.tags, state.tagsLoaded, 0.dp)
            }
        }
    }

    }

    // Search slides in over everything; a result opens its day and its details.
    androidx.compose.animation.AnimatedVisibility(
        visible = searching,
        enter = androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(180)) +
            androidx.compose.animation.slideInVertically(androidx.compose.animation.core.tween(260)) { it / 12 },
        exit = androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(150)),
    ) {
        com.skienlabs.tasks.ui.search.SearchScreen(
            today = today,
            tags = state.tags,
            savedTasks = { store.state.value.tasks.values },
            recent = recentSearches,
            search = { q -> app.api.search(q, today) },
            onRemember = { q -> scope.launch { app.prefs.addRecentSearch(profile.uid, q) } },
            onClearRecent = { scope.launch { app.prefs.clearRecentSearches(profile.uid) } },
            onOpen = { t ->
                searching = false
                tab = TAB_TASKS
                if (filter != null && filter !in t.tagIds) setFilter(null)
                go(t.date)
                sheet = Sheet.TaskView(t.id, t.date)
            },
            onClose = { searching = false },
        )
    }

    when (val s = sheet) {
        is Sheet.TaskEdit -> TaskSheet(
            store = store, task = s.task?.let { state.tasks[it.id] ?: it }, defaultDate = maxOf(date, today), defaultTagId = filter,
            today = today, tags = state.tags, onDismiss = { sheet = null }, onManageTags = { newTag = true },
        )
        is Sheet.TaskView -> {
            val t = state.tasks[s.id]
            when {
                t != null -> com.skienlabs.tasks.ui.day.TaskDetailsSheet(t, state.tags, today, actions) { sheet = null }
                // Opened from search: its day is loading; give it a moment before giving up.
                s.date != null && !state.hasDay(s.date) -> LaunchedEffect(s.id) { kotlinx.coroutines.delay(10_000); if (state.tasks[s.id] == null) sheet = null }
                else -> LaunchedEffect(s.id) { sheet = null } // deleted (maybe on another device)
            }
        }
        Sheet.Month -> MonthSheet(
            month = visibleMonth, selected = date, today = today, summary = state.summary,
            onMonth = { m -> app.visibleMonth.value = m; app.refreshSummary() },
            onPick = { d -> sheet = null; go(d) },
            onDismiss = { sheet = null },
        )
        Sheet.Account -> AccountSheet(app, profile, theme) { sheet = null }
        null -> Unit
    }
    if (newTag) TagEditor(store, null) { newTag = false }
}

/** "Offline · 3" or a spinning sync icon while changes made offline are sent. Hidden otherwise. */
@Composable
private fun SyncBadge(s: com.skienlabs.tasks.data.SyncStatus) {
    if (s.online && s.pending == 0) return
    val x = LocalExtra.current
    val color = if (s.online) MaterialTheme.colorScheme.primary else androidx.compose.ui.graphics.Color(if (x.dark) 0xFFFDD663 else 0xFFB06000)
    val spin by androidx.compose.animation.core.rememberInfiniteTransition(label = "sync").animateFloat(
        0f, -360f, androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween(1200, easing = androidx.compose.animation.core.LinearEasing)), label = "spin",
    )
    Row(
        Modifier.padding(end = 2.dp).clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.14f))
            .padding(horizontal = 10.dp, vertical = 5.dp)
            .semantics { contentDescription = if (s.online) "Syncing ${s.pending} changes" else "Offline, ${s.pending} changes waiting" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (s.online) Icon(androidx.compose.material.icons.Icons.Outlined.Sync, null, Modifier.size(16.dp).graphicsLayer { rotationZ = spin }, tint = color)
        else Icon(androidx.compose.material.icons.Icons.Outlined.CloudOff, null, Modifier.size(16.dp), tint = color)
        Text(
            if (s.online) " ${s.pending}" else if (s.pending > 0) " Offline · ${s.pending}" else " Offline",
            style = MaterialTheme.typography.labelMedium, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold, color = color,
        )
    }
}

/**
 * "Thursday, 22 October 2026" in the top bar. On today the weekday shimmers in the theme's
 * gradient. When it doesn't fit, it shortens to "Thu, 22 Oct 2026".
 */
@Composable
internal fun DateTitle(date: String, isToday: Boolean, modifier: Modifier = Modifier) {
    val x = LocalExtra.current
    var short by remember(date) { mutableStateOf(false) }
    val weekday = if (short) Dates.weekdayShort(date) else Dates.weekday(date)
    val rest = if (short) Dates.dayMonthYearShort(date) else Dates.dayMonthYear(date)
    // A slow sweep of light across the gradient, so today feels alive.
    val shift by androidx.compose.animation.core.rememberInfiniteTransition(label = "title").animateFloat(
        0f, 1f,
        androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween(6000, easing = androidx.compose.animation.core.LinearEasing), androidx.compose.animation.core.RepeatMode.Reverse),
        label = "shift",
    )
    val brush = androidx.compose.ui.graphics.Brush.linearGradient(
        x.gradient,
        start = androidx.compose.ui.geometry.Offset(-200f + 200f * shift, 0f),
        end = androidx.compose.ui.geometry.Offset(260f + 200f * shift, 0f),
    )
    val text = androidx.compose.ui.text.buildAnnotatedString {
        if (isToday) pushStyle(androidx.compose.ui.text.SpanStyle(brush = brush, fontWeight = androidx.compose.ui.text.font.FontWeight.Medium))
        else pushStyle(androidx.compose.ui.text.SpanStyle(fontWeight = androidx.compose.ui.text.font.FontWeight.Medium))
        append(weekday)
        pop()
        append(", ")
        append(rest)
    }
    Text(
        text,
        modifier.semantics { contentDescription = Dates.fullLabel(date) },
        style = MaterialTheme.typography.titleLarge.copy(fontSize = 19.sp),
        maxLines = 1,
        softWrap = false,
        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
        onTextLayout = { if (it.hasVisualOverflow && !short) short = true },
    )
}

@Composable
private fun VerifyBanner(email: String, onVerify: () -> Unit, onHide: () -> Unit) {
    val x = LocalExtra.current
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).clip(RoundedCornerShape(16.dp)).background(x.overdueBg)
            .padding(start = 14.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.MarkEmailUnread, null, Modifier.size(20.dp), tint = x.overdue)
        Text("  Verify $email", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
        TextButton(onClick = onVerify) { Text("Verify") }
        TextButton(onClick = onHide) { Text("Hide", color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

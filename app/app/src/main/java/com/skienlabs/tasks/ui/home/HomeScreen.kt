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
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.MarkEmailUnread
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material.icons.outlined.Today
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.dp
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
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.time.YearMonth
import kotlin.math.abs

private const val TAB_TASKS = 0
private const val TAB_SUMMARY = 1
private const val TAB_TAGS = 2

private val PAGE_COUNT = (Dates.between(Dates.MIN, Dates.MAX) + 1).toInt()
private fun pageOf(date: String) = Dates.between(Dates.MIN, date).toInt()
private fun dateOf(page: Int) = Dates.addDays(Dates.MIN, page.toLong())

/** Which sheet is open, if any. A task sheet holds the task (null task = new). */
private sealed interface Sheet {
    data class TaskEdit(val task: Task?) : Sheet
    data object Month : Sheet
    data object Account : Sheet
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(app: AppController, profile: Profile, theme: ThemePref) {
    val store = app.store
    val state by store.state.collectAsStateWithLifecycle()
    val today by app.today.collectAsStateWithLifecycle()
    val date by app.visibleDate.collectAsStateWithLifecycle()
    val visibleMonth by app.visibleMonth.collectAsStateWithLifecycle()
    val statsVersion by app.statsVersion.collectAsStateWithLifecycle()
    val savedFilter by remember(profile.uid) { app.prefs.tagFilter(profile.uid) }.collectAsStateWithLifecycle(null)
    val hideVerify by remember(profile.uid) { app.prefs.hideVerify(profile.uid) }.collectAsStateWithLifecycle(true)
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current

    var tab by rememberSaveable { mutableStateOf(TAB_TASKS) }
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

    BackHandler(enabled = tab != TAB_TASKS) { tab = TAB_TASKS }
    BackHandler(enabled = tab == TAB_TASKS && date != today && sheet == null) { go(today) }

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
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    if (tab == TAB_TASKS) {
                        Row(
                            Modifier.clip(RoundedCornerShape(12.dp)).clickable { app.visibleMonth.value = YearMonth.parse(date.take(7)); sheet = Sheet.Month }
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(Dates.monthYear(date), style = MaterialTheme.typography.titleLarge)
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
                    IconButton(onClick = { sheet = Sheet.Account }) { Avatar(profile, 32.dp) }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        bottomBar = {
            NavigationBar(containerColor = LocalExtra.current.surfaceHigh) {
                val items = listOf(
                    Triple("Tasks", Icons.Filled.CheckCircle, Icons.Outlined.CheckCircle),
                    Triple("Summary", Icons.Filled.Insights, Icons.Outlined.Insights),
                    Triple("Tags", Icons.Filled.Sell, Icons.Outlined.Sell),
                )
                items.forEachIndexed { i, (label, on, off) ->
                    NavigationBarItem(
                        selected = tab == i,
                        onClick = {
                            if (tab == i && i == TAB_TASKS) go(today) // tapping Tasks again jumps to today
                            tab = i
                        },
                        icon = { Icon(if (tab == i) on else off, null) },
                        label = { Text(label) },
                    )
                }
            }
        },
        floatingActionButton = {
            if (tab == TAB_TASKS) {
                FloatingActionButton(onClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                    sheet = Sheet.TaskEdit(null)
                }) { Icon(Icons.Filled.Add, "New task") }
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
        containerColor = MaterialTheme.colorScheme.background,
    ) { inner ->
        Box(Modifier.fillMaxSize().padding(inner)) {
            when (tab) {
                TAB_TASKS -> Column(Modifier.fillMaxSize()) {
                    AnimatedVisibility(profile.provider == "password" && !profile.emailVerified && !hideVerify) {
                        VerifyBanner(profile.email ?: "", onVerify = { sheet = Sheet.Account }, onHide = { scope.launch { app.prefs.setHideVerify(profile.uid) } })
                    }
                    val density = LocalDensity.current
                    Box(
                        // Swipe the week strip sideways to change week.
                        Modifier.pointerInput(Unit) {
                            var total = 0f
                            detectHorizontalDragGestures(
                                onDragStart = { total = 0f },
                                onDragEnd = {
                                    val min = with(density) { 56.dp.toPx() }
                                    if (abs(total) > min) go(Dates.addDays(app.visibleDate.value, if (total < 0) 7 else -7))
                                },
                            ) { _, dx -> total += dx }
                        },
                    ) {
                        WeekStrip(date, today, { state.summary[it] }, ::go)
                    }
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
                            onAdd = { title, priority, tagIds -> store.createTask(title, d, priority, "", tagIds).second },
                            onMoveAllToToday = { list -> store.moveTasks(list.map { it.id }, today) },
                            quickAddFocus = quickAddFocus,
                            bottomPadding = 0.dp,
                        )
                    }
                }
                TAB_SUMMARY -> SummaryScreen(app.api::stats, { app.handleLoadError(it, quiet = true) }, today, state.tags, statsVersion, 0.dp) { d ->
                    tab = TAB_TASKS
                    go(d)
                }
                else -> TagsScreen(store, state.tags, state.tagsLoaded, 0.dp)
            }
        }
    }

    when (val s = sheet) {
        is Sheet.TaskEdit -> TaskSheet(
            store = store, task = s.task?.let { state.tasks[it.id] ?: it }, defaultDate = date, defaultTagId = filter,
            today = today, tags = state.tags, onDismiss = { sheet = null }, onManageTags = { newTag = true },
        )
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

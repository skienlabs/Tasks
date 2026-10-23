package com.skienlabs.tasks

import android.content.Context
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.skienlabs.tasks.auth.Auth
import com.skienlabs.tasks.auth.AuthUser
import com.skienlabs.tasks.data.ApiException
import com.skienlabs.tasks.data.Cache
import com.skienlabs.tasks.data.Change
import com.skienlabs.tasks.data.Dates
import com.skienlabs.tasks.data.HttpTasksApi
import com.skienlabs.tasks.data.LiveSync
import com.skienlabs.tasks.data.Prefs
import com.skienlabs.tasks.data.Profile
import com.skienlabs.tasks.data.RoomCache
import com.skienlabs.tasks.data.Store
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit

sealed interface Session {
    data object Starting : Session
    data object NotConfigured : Session
    data object SignedOut : Session
    data class Loading(val user: AuthUser) : Session
    data class Failed(val user: AuthUser, val status: Int, val message: String) : Session
    data class Ready(val user: AuthUser, val profile: Profile) : Session
}

/** App-wide wiring: sign-in, profile, data store, live sync, and app lifecycle. Lives for the whole process. */
class AppController(context: Context) {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    val prefs = Prefs(context)
    val auth = Auth(context)
    val api = HttpTasksApi(BuildConfig.API_URL, auth)
    private val cache: Cache by lazy { RoomCache.get(context) }
    val images by lazy { com.skienlabs.tasks.ui.images.ImageStore(context, api, api.client) }
    val store by lazy {
        Store(api, cache, scope, files = com.skienlabs.tasks.data.DiskOutboxFiles(java.io.File(appContext.filesDir, "outbox-images")))
            .also { s -> s.onImagePrepared = { images.seed(it) } }
    }

    private val _session = MutableStateFlow<Session>(Session.Starting)
    val session: StateFlow<Session> = _session.asStateFlow()

    private val _today = MutableStateFlow(Dates.today())
    val today: StateFlow<String> = _today.asStateFlow()

    /** Day on screen and month shown in the calendar; set by the UI. Used to refresh the right data. */
    val visibleDate = MutableStateFlow(Dates.today())
    val visibleMonth = MutableStateFlow(java.time.YearMonth.now())

    /** Bumped when the summary page should reload (live change or resume). */
    private val _statsVersion = MutableStateFlow(0)
    val statsVersion: StateFlow<Int> = _statsVersion.asStateFlow()

    private var live: LiveSync? = null
    private var foreground = false
    private var midnightJob: Job? = null
    private var userJob: Job? = null

    /** Set when the app is opened from the widget's "+" button. */
    val newTaskRequest = MutableStateFlow(false)

    private val appContext = context.applicationContext

    fun start() {
        if (!BuildConfig.FIREBASE_CONFIGURED || BuildConfig.API_URL.isBlank()) {
            _session.value = Session.NotConfigured
            return
        }
        watchWidgets()
        watchNetwork()
        live = LiveSync(BuildConfig.API_URL, api, scope, ::onLiveChange) { refreshAll(quiet = true) }
        userJob = scope.launch { auth.user.collect { onUser(it) } }
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) = onForeground()
            override fun onStop(owner: LifecycleOwner) = onBackground()
        })
    }

    // ---- Session ------------------------------------------------------------------

    private var currentUid: String? = null

    private suspend fun onUser(user: AuthUser?) {
        if (user == null) {
            if (currentUid != null) {
                store.clear()
                images.clear()
            }
            currentUid = null
            live?.stop()
            _session.value = Session.SignedOut
            return
        }
        if (user.uid != currentUid) {
            if (currentUid != null) { // another account
                store.clear()
                images.clear()
            }
            currentUid = user.uid
            // Show the last known profile instantly (works offline), then refresh it.
            val cached = runCatching { withContext(Dispatchers.IO) { cacheProfile(user.uid) } }.getOrNull()
            store.start(user.uid, _today.value)
            if (currentUid != user.uid) return
            _session.value = if (cached != null && cached.uid == user.uid) Session.Ready(user, cached) else Session.Loading(user)
            if (foreground) live?.start()
        }
        loadProfile(user)
    }

    private suspend fun cacheProfile(uid: String): Profile? = cache.loadProfile(uid)

    fun loadProfile(user: AuthUser? = currentUser()) {
        user ?: return
        scope.launch {
            try {
                val p = api.me()
                if (currentUid != user.uid) return@launch
                _session.value = Session.Ready(user, p)
                runCatching { withContext(Dispatchers.IO) { cache.saveProfile(user.uid, p) } }
            } catch (e: ApiException) {
                if (currentUid != user.uid) return@launch
                // Keep showing a cached profile on network trouble; real problems get their own screen.
                val ready = _session.value as? Session.Ready
                if (ready != null && e.status == 0) return@launch
                // Never sign out automatically on an API error.
                _session.value = Session.Failed(user, e.status, e.message ?: "Couldn't load your account")
            }
        }
    }

    fun setProfile(p: Profile) {
        val user = currentUser() ?: return
        if (p.uid != user.uid) return
        _session.value = Session.Ready(user, p)
        scope.launch { runCatching { withContext(Dispatchers.IO) { cache.saveProfile(user.uid, p) } } }
    }

    private fun currentUser(): AuthUser? = when (val s = _session.value) {
        is Session.Loading -> s.user
        is Session.Failed -> s.user
        is Session.Ready -> s.user
        else -> auth.currentUser
    }

    fun signOut() {
        scope.launch { auth.signOut() }
    }

    // ---- Refreshing -------------------------------------------------------------

    /** Errors from loads: 401/403 change the session; others become a message unless quiet. */
    fun handleLoadError(e: Throwable, quiet: Boolean) {
        val api = e as? ApiException
        val user = currentUser()
        if (api != null && user != null && (api.status == 401 || api.status == 403)) {
            _session.value = Session.Failed(user, api.status, api.message ?: "")
        } else if (!quiet && api?.status != 0) { // offline: the badge says so, and changes wait
            store.toast(api?.message ?: "Something went wrong. Please try again.")
        }
    }

    /** Loads a day; returns false if it failed. Prefetches stay silent. */
    suspend fun refreshDay(date: String, prefetch: Boolean = false): Boolean = try {
        store.loadDay(date, _today.value)
        true
    } catch (e: Exception) {
        if (e is kotlinx.coroutines.CancellationException) throw e
        handleLoadError(e, quiet = prefetch)
        false
    }

    fun refreshSummary() {
        val grid = Dates.monthGrid(visibleMonth.value)
        val week = Dates.startOfWeek(visibleDate.value)
        // The server only accepts 1900-01-01..2999-12-31; the first/last grids reach past that.
        fun clamp(d: String) = d.coerceIn(Dates.MIN, Dates.MAX)
        scope.launch {
            runCatching { store.loadSummary(clamp(grid.first()), clamp(grid.last())) }.onFailure { handleLoadError(it, quiet = true) }
            if (week < grid.first() || Dates.addDays(week, 6) > grid.last()) {
                runCatching { store.loadSummary(clamp(week), clamp(Dates.addDays(week, 6))) }.onFailure { handleLoadError(it, quiet = true) }
            }
        }
    }

    fun refreshTags() {
        scope.launch { runCatching { store.loadTags() }.onFailure { handleLoadError(it, quiet = true) } }
    }

    fun refreshAll(quiet: Boolean) {
        if (_session.value !is Session.Ready) return
        val date = visibleDate.value
        val today = _today.value
        scope.launch { refreshDay(date, prefetch = quiet) }
        if (today != date) scope.launch { refreshDay(today, prefetch = true) }
        refreshSummary()
        refreshTags()
        currentUser()?.let { loadProfile(it) }
        _statsVersion.value++
        // Send what was changed offline, and keep the offline copy fresh (at most every 2 minutes).
        store.onNetworkBack()
        if (System.currentTimeMillis() - store.lastSyncedAt > 2 * 60_000) scope.launch { runCatching { store.syncAll(today) } }
    }

    /** The phone got a connection back: send waiting changes right away, then refresh. */
    private fun watchNetwork() {
        val cm = appContext.getSystemService(android.net.ConnectivityManager::class.java) ?: return
        runCatching {
            cm.registerDefaultNetworkCallback(object : android.net.ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: android.net.Network) {
                    scope.launch {
                        if (_session.value !is Session.Ready) return@launch
                        store.onNetworkBack()
                        runCatching { store.syncAll(_today.value) }
                    }
                }
            })
        }
    }

    private var pendingTags = false
    private var pendingProfile = false
    private var pendingTasks = false
    private val pendingDates = HashSet<String>()
    private var flushJob: Job? = null

    /** Applies a change made on another device. A burst of changes becomes one refresh. */
    private fun onLiveChange(c: Change) {
        if (_session.value !is Session.Ready) return
        when (c.type) {
            "tasks" -> pendingTasks = true
            "tags" -> {
                pendingTags = true
                if (c.tasks) pendingTasks = true
            }
            "profile" -> pendingProfile = true
        }
        pendingDates += c.dates
        flushJob?.cancel()
        flushJob = scope.launch {
            delay(150)
            val tags = pendingTags
            val profile = pendingProfile
            val tasks = pendingTasks
            val dates = pendingDates.toSet()
            pendingTags = false
            pendingProfile = false
            pendingTasks = false
            pendingDates.clear()
            if (tags) refreshTags()
            if (profile) currentUser()?.let { loadProfile(it) }
            if (tasks) {
                val visible = visibleDate.value
                val loaded = store.state.value.loadedDays
                val days = linkedSetOf(visible, _today.value)
                dates.filterTo(days) { it in loaded }
                days.forEach { d -> launch { refreshDay(d, prefetch = d != visible) } }
                refreshSummary()
                _statsVersion.value++
            }
        }
    }

    // ---- Home screen widgets -----------------------------------------------------

    /** Keeps widgets in step with the app: after changes settle (and are saved), redraw them. */
    @OptIn(kotlinx.coroutines.FlowPreview::class)
    private fun watchWidgets() {
        com.skienlabs.tasks.widget.Widgets.onWidgetChange = { scope.launch { refreshAll(quiet = true) } }
        scope.launch {
            kotlinx.coroutines.flow.combine(session, store.state, _today) { s, st, d ->
                Triple(s is Session.Ready, st.tasks.values.filter { it.date == d || (it.isPending && it.date < d) }.hashCode() * 31 + st.tags.hashCode(), d)
            }
                .distinctUntilChanged()
                .debounce(1500)
                .collect {
                    withContext(Dispatchers.IO) {
                        runCatching {
                            com.skienlabs.tasks.widget.WidgetRepo.markLocal(appContext)
                            com.skienlabs.tasks.widget.Widgets.updateAll(appContext)
                        }
                    }
                }
        }
    }

    // ---- Lifecycle ----------------------------------------------------------------

    private fun onForeground() {
        foreground = true
        val now = Dates.today()
        if (now != _today.value) rollOver(now)
        scheduleMidnight()
        if (_session.value is Session.Ready || _session.value is Session.Loading) live?.start()
        // refreshAll runs when the live stream connects ("ready"); this covers a slow/failed connect.
        scope.launch {
            delay(1500)
            if (foreground) refreshAll(quiet = true)
        }
    }

    private fun onBackground() {
        foreground = false
        live?.stop() // no open connection in the background: saves battery
        midnightJob?.cancel()
    }

    private fun rollOver(now: String) {
        val previous = _today.value
        _today.value = now
        // Follow the calendar when the day changes while looking at "today".
        if (visibleDate.value == previous) visibleDate.value = now
    }

    private fun scheduleMidnight() {
        midnightJob?.cancel()
        midnightJob = scope.launch {
            while (true) {
                val now = LocalDateTime.now()
                val next = now.toLocalDate().plusDays(1).atStartOfDay().plusSeconds(2)
                delay(ChronoUnit.MILLIS.between(now, next).coerceAtLeast(1000))
                rollOver(Dates.today())
                refreshAll(quiet = true)
            }
        }
    }
}

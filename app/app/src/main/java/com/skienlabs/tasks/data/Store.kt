package com.skienlabs.tasks.data

import androidx.compose.runtime.Immutable
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.util.UUID

/** What the screens render. Immutable: every change produces a new snapshot. */
@Immutable
data class StoreState(
    val tasks: Map<String, Task> = emptyMap(),
    val summary: Map<String, Counts> = emptyMap(),
    /** Days fetched from the server in this session. */
    val loadedDays: Set<String> = emptySet(),
    /** Days known from the local cache (shown instantly while refreshing). */
    val cachedDays: Set<String> = emptySet(),
    /** A full copy of the account arrived at least once: every day is known, even offline. */
    val knownAll: Boolean = false,
    val tags: List<Tag> = emptyList(),
    val tagsLoaded: Boolean = false,
) {
    private val tagById by lazy { tags.associateBy { it.id } }
    fun tag(id: String): Tag? = tagById[id]

    /** See [TaskOrder]: open first, then priority, company (tag) A–Z, title A–Z. */
    private val order by lazy { TaskOrder.comparator(tags) }

    fun day(date: String): List<Task> = tasks.values.filter { it.date == date }.sortedWith(order)
    fun overdue(today: String): List<Task> =
        tasks.values.filter { it.isPending && it.date < today }.sortedWith(order)
    fun hasDay(date: String) = knownAll || date in loadedDays || date in cachedDays
}

data class Toast(val id: Long, val message: String, val actionLabel: String? = null, val action: (() -> Unit)? = null)

/** For the offline badge: can the server be reached, and how many changes are waiting. */
@Immutable
data class SyncStatus(val online: Boolean = true, val pending: Int = 0, val syncing: Boolean = false)

/** A change made on this phone, saved until the server has it. */
@kotlinx.serialization.Serializable
data class OutboxOp(
    val key: Long,
    val kind: String,
    val taskId: String? = null,
    val tagId: String? = null,
    /** The attachment, for removeImage. */
    val ref: String? = null,
    val body: JsonObject? = null,
    val label: String = "Couldn't save",
    val dates: List<String> = emptyList(),
    val attempts: Int = 0,
    val createdAt: Long = 0,
)

/** Where images waiting to be uploaded are kept (too big for the database). */
interface OutboxFiles {
    fun write(id: String, full: ByteArray, thumb: ByteArray)
    fun read(id: String): Pair<ByteArray, ByteArray>?
    fun delete(id: String)
    fun clear()
}

/** Keeps them in memory (tests). */
class MemoryOutboxFiles : OutboxFiles {
    private val map = HashMap<String, Pair<ByteArray, ByteArray>>()
    override fun write(id: String, full: ByteArray, thumb: ByteArray) { map[id] = full to thumb }
    override fun read(id: String) = map[id]
    override fun delete(id: String) { map.remove(id) }
    override fun clear() = map.clear()
}

/** Files in the app's private storage (not the cache folder, which Android may empty). */
class DiskOutboxFiles(private val dir: java.io.File) : OutboxFiles {
    private fun f(id: String, part: String) = java.io.File(dir, "${id.filter { it.isLetterOrDigit() || it == '-' }}.$part")
    override fun write(id: String, full: ByteArray, thumb: ByteArray) {
        dir.mkdirs()
        f(id, "full").writeBytes(full)
        f(id, "thumb").writeBytes(thumb)
    }
    override fun read(id: String): Pair<ByteArray, ByteArray>? = runCatching { f(id, "full").readBytes() to f(id, "thumb").readBytes() }.getOrNull()
    override fun delete(id: String) {
        f(id, "full").delete()
        f(id, "thumb").delete()
    }
    override fun clear() { dir.listFiles()?.forEach { it.delete() } }
}

/** Partial task change; null means "leave as is". */
data class TaskPatch(
    val title: String? = null,
    val notes: String? = null,
    val priority: Int? = null,
    val date: String? = null,
    val status: String? = null,
    val postponed: Int? = null,
    val tagIds: List<String>? = null,
    val subtasks: List<Subtask>? = null,
    /** Only for Undo of a move/postpone: brings back the "from earlier" mark. */
    val carriedFrom: String? = null,
) {
    fun toJson(): JsonObject = buildJsonObject {
        title?.let { put("title", it) }
        notes?.let { put("notes", it) }
        priority?.let { put("priority", it) }
        date?.let { put("date", it) }
        status?.let { put("status", it) }
        postponed?.let { put("postponed", it) }
        tagIds?.let { ids -> putJsonArray("tagIds") { ids.forEach { add(JsonPrimitive(it)) } } }
        subtasks?.let { put("subtasks", subtasksJson(it)) }
        carriedFrom?.let { put("carriedFrom", it) }
    }
}

/**
 * Client-side store, offline first. Every change shows instantly, is saved on the phone, and
 * is queued for the server (the outbox). The queue is sent in order; without a connection it
 * waits and goes out when the phone is back online. If the server refuses a change, it rolls
 * back to the last state the server confirmed.
 *
 * The whole account is kept in the local database (see [Cache]), so the app opens and works
 * with no network; a full fresh copy comes from /api/sync whenever it's online.
 *
 * Threading: all public functions must be called on the main thread, and [scope] must run on it
 * (Dispatchers.Main.immediate). That keeps every map below single-threaded, like the web app.
 *
 * Race rules (same as the web app):
 * - Changes go to the server strictly in the order they were made (one queue).
 * - Waiting changes are sent before any fetch that may move tasks (the server's carry-over),
 *   so a task completed offline yesterday isn't carried to today first.
 * - A fetch never overwrites or deletes a task changed locally after the fetch started, and an
 *   older fetch for a day is ignored when a newer one exists.
 * - Everything async checks [epoch], which changes on sign-out, so one account's late responses
 *   never land in another account.
 */
class Store(
    private val api: TasksApi,
    private val cache: Cache,
    private val scope: CoroutineScope,
    private val io: CoroutineDispatcher = Dispatchers.IO,
    private val now: () -> Long = System::currentTimeMillis,
    /** This device's today (tests pin it). */
    private val todayFn: () -> String = Dates::today,
    private val files: OutboxFiles = MemoryOutboxFiles(),
) {
    private val _state = MutableStateFlow(StoreState())
    val state: StateFlow<StoreState> = _state.asStateFlow()

    private val _toasts = MutableSharedFlow<Toast>(extraBufferCapacity = 16)
    val toasts: SharedFlow<Toast> = _toasts

    private val _sync = MutableStateFlow(SyncStatus())
    val sync: StateFlow<SyncStatus> = _sync.asStateFlow()

    private var uid: String? = null
    private var epoch = 0
    private var seq = 0L
    private val confirmed = HashMap<String, Task>()
    private val touched = HashMap<String, Long>()
    private val latest = HashMap<String, Long>()
    private val dayRequest = HashMap<String, Int>()
    private val dateTouched = HashMap<String, Long>()
    private val inflightDates = HashMap<String, Int>()
    private val misses = HashMap<String, Int>()
    private var tagsTouched = 0L
    private var lastSync = 0L

    /** A queued change: what's saved, plus this session's bookkeeping. */
    private class Pending(var op: OutboxOp, val mine: Long, val saved: Deferred<Boolean>, val restored: Boolean) {
        val done = kotlinx.coroutines.CompletableDeferred<Boolean>()
    }
    private val outbox = ArrayDeque<Pending>()
    private var outboxKey = 0L
    private var flushJob: Job? = null
    private var retryJob: Job? = null
    private var retryMs = 2000L
    private var retries = 0
    private var online = true
    private var toldOffline = false
    private var resyncAfterFlush = false

    // Background persistence of changed rows to the local cache.
    private val dirtyTasks = HashSet<String>()
    private val dirtySummary = HashSet<String>()
    private var tagsDirty = false
    private var metaDirty = false
    private var persistJob: Job? = null

    val currentUid: String? get() = uid

    /** Changes made here that the server hasn't received yet. */
    val pendingChanges: Int get() = outbox.size

    /** When the last full copy arrived (0 = never). */
    val lastSyncedAt: Long get() = lastSync

    private fun publishSync() {
        _sync.value = SyncStatus(online, outbox.size, flushJob?.isActive == true)
    }

    // ---- Session ----------------------------------------------------------------

    /** Starts a session for [newUid]: the saved copy first (works offline), then a fresh one. */
    suspend fun start(newUid: String, today: String) {
        if (uid == newUid) return
        reset()
        uid = newUid
        val ep = epoch
        val snap = runCatching { withContext(io) { cache.loadAll(newUid) } }.getOrDefault(CacheSnapshot())
        val meta = runCatching {
            withContext(io) { listOf("knownAll", "lastSync", "misses").associateWith { cache.loadMeta(newUid, it) } }
        }.getOrDefault(emptyMap())
        val ops = runCatching { withContext(io) { cache.loadOps(newUid) } }.getOrDefault(emptyList())
            .mapNotNull { runCatching { AppJson.decodeFromString(OutboxOp.serializer(), it) }.getOrNull() }
            .sortedBy { it.key }
        if (ep != epoch) return
        snap.tasks.forEach { confirmed[it.id] = it }
        meta["misses"]?.let { m ->
            runCatching { AppJson.decodeFromString(kotlinx.serialization.builtins.ListSerializer(MissCount.serializer()), m) }
                .getOrNull()?.forEach { misses[it.date] = it.missed }
        }
        lastSync = meta["lastSync"]?.toLongOrNull() ?: 0L
        _state.value = StoreState(
            tasks = snap.tasks.associateBy { it.id },
            summary = snap.summary,
            cachedDays = snap.summary.keys,
            knownAll = meta["knownAll"] == "1",
            tags = snap.tags.sortedWith(compareBy({ it.position }, { it.createdAt })),
            tagsLoaded = snap.tags.isNotEmpty(),
        )
        // Changes made offline (maybe before the app was closed) wait again, in order.
        for (op in ops) {
            val mine = ++seq
            op.taskId?.let { touched[it] = mine; latest[it] = mine }
            if (op.tagId != null) tagsTouched = mine
            markDates(op.dates, mine, +1)
            outbox.addLast(Pending(op, mine, kotlinx.coroutines.CompletableDeferred(true), restored = true))
            outboxKey = maxOf(outboxKey, op.key)
        }
        publishSync()
        scope.launch { runCatching { syncAll(today) } }
    }

    /** Signs out: forgets everything in memory and wipes the local copy (and unsent changes). */
    fun clear() {
        // Saves already under way finish first, so none can bring the copy back after the wipe.
        val writes: List<Job> = outbox.map { it.saved } + listOfNotNull(persistJob, flushJob)
        reset()
        scope.launch {
            writes.forEach { runCatching { it.join() } }
            runCatching { withContext(io) { cache.clear(); files.clear() } }
        }
    }

    private fun reset() {
        epoch++
        uid = null
        flushJob?.cancel()
        flushJob = null
        retryJob?.cancel()
        retryJob = null
        outbox.forEach { it.done.complete(false) }
        outbox.clear()
        listOf(confirmed, touched, latest, dayRequest, dateTouched, inflightDates, misses).forEach { it.clear() }
        dirtyTasks.clear()
        dirtySummary.clear()
        tagsDirty = false
        metaDirty = false
        tagsTouched = 0
        lastSync = 0
        toldOffline = false
        persistJob?.cancel()
        persistJob = null
        _state.value = StoreState()
        publishSync()
    }

    // ---- Local bookkeeping ------------------------------------------------------

    private class Draft(val tasks: MutableMap<String, Task>, val summary: MutableMap<String, Counts>)

    private inline fun edit(block: Draft.() -> Unit) {
        val s = _state.value
        val d = Draft(s.tasks.toMutableMap(), s.summary.toMutableMap())
        d.block()
        _state.value = s.copy(tasks = d.tasks, summary = d.summary)
    }

    private fun Draft.bump(task: Task, sign: Int) {
        summary[task.date] = (summary[task.date] ?: Counts(missed = misses[task.date] ?: 0)).bump(task.status, sign)
        dirtySummary += task.date
    }

    private fun Draft.put(task: Task) {
        tasks[task.id]?.let { bump(it, -1) }
        tasks[task.id] = task
        bump(task, +1)
        dirtyTasks += task.id
    }

    private fun Draft.drop(id: String) {
        tasks.remove(id)?.let { bump(it, -1) }
        dirtyTasks += id
    }

    private fun Draft.recount(date: String) {
        var c = Counts()
        for (t in tasks.values) if (t.date == date) c = c.bump(t.status, +1)
        // Missed tasks have left this day, so only the server knows them: keep its number.
        summary[date] = c.copy(missed = summary[date]?.missed ?: misses[date] ?: 0)
        dirtySummary += date
    }

    /** Every day counted again from the tasks (after a full copy arrived). */
    private fun Draft.recountAll() {
        dirtySummary += summary.keys
        summary.clear()
        for ((d, n) in misses) summary[d] = Counts(missed = n)
        for (t in tasks.values) summary[t.date] = (summary[t.date] ?: Counts()).bump(t.status, +1)
        dirtySummary += summary.keys
    }

    private fun schedulePersist() {
        if (persistJob?.isActive == true) return
        val ep = epoch
        persistJob = scope.launch {
            delay(400) // batch bursts of changes into one write
            val owner = uid ?: return@launch
            if (ep != epoch) return@launch
            val s = _state.value
            val ids = dirtyTasks.toList().also { dirtyTasks.clear() }
            val upserts = ids.mapNotNull { s.tasks[it] }
            val deletes = ids.filter { it !in s.tasks }
            val days = dirtySummary.toList().also { dirtySummary.clear() }.associateWith { d -> s.summary[d] ?: Counts() }
            val tags = if (tagsDirty) s.tags.also { tagsDirty = false } else null
            val meta = if (metaDirty) {
                metaDirty = false
                mapOf(
                    "knownAll" to if (s.knownAll) "1" else "0",
                    "lastSync" to lastSync.toString(),
                    "misses" to AppJson.encodeToString(kotlinx.serialization.builtins.ListSerializer(MissCount.serializer()), misses.map { (d, n) -> MissCount(d, n) }),
                )
            } else null
            runCatching {
                withContext(io) {
                    cache.saveTasks(owner, upserts, deletes)
                    cache.saveSummary(owner, days)
                    if (tags != null) cache.saveTags(owner, tags)
                    meta?.forEach { (k, v) -> cache.saveMeta(owner, k, v) }
                }
            }
        }
    }

    private fun cleanTagIds(ids: List<String>): List<String> {
        val unique = ids.distinct()
        val s = _state.value
        val known = if (s.tagsLoaded) unique.filter { s.tag(it) != null } else unique
        return known.take(MAX_TAGS_PER_TASK).sorted()
    }

    fun toast(message: String, actionLabel: String? = null, action: (() -> Unit)? = null) {
        _toasts.tryEmit(Toast(++seq, message, actionLabel, action))
    }

    private fun markDates(dates: Collection<String>, mine: Long, delta: Int) {
        for (d in dates) {
            if (delta > 0) dateTouched[d] = mine
            val n = (inflightDates[d] ?: 0) + delta
            if (n > 0) inflightDates[d] = n else inflightDates.remove(d)
        }
    }

    private fun setOnline(v: Boolean) {
        if (online == v) return
        online = v
        if (v) toldOffline = false else resyncAfterFlush = true
        publishSync()
    }

    private fun offline() = ApiException(0, "You appear to be offline")

    // ---- Sending changes (the outbox) ---------------------------------------------

    /** No connection, a server hiccup, or a sign-in that can't be checked now: try again later. */
    private fun transient(e: Throwable) = e !is ApiException || e.status == 0 || e.status == 401 || e.status == 408 || e.status == 429 || e.status >= 500

    /** Saves a change on the phone and starts sending. Completes when the server has answered. */
    private fun enqueue(op: OutboxOp, mine: Long): Deferred<Boolean> {
        val owner = uid
        val key = maxOf(now() * 1000, outboxKey + 1)
        outboxKey = key
        val o = op.copy(key = key, createdAt = now())
        val json = AppJson.encodeToString(OutboxOp.serializer(), o)
        val saved = scope.async {
            if (owner == null) false else runCatching { withContext(io) { cache.saveOp(owner, key, json) }; true }.getOrDefault(false)
        }
        val p = Pending(o, mine, saved, restored = false)
        outbox.addLast(p)
        publishSync()
        retries = 0
        flush()
        return p.done
    }

    /** Sends waiting changes in order until none are left or the server can't be reached. */
    fun flush(): Job? {
        if (flushJob?.isActive == true) return flushJob
        if (outbox.isEmpty()) return null
        val ep = epoch
        val owner = uid
        retryJob?.cancel()
        flushJob = scope.launch {
            try {
                while (outbox.isNotEmpty() && ep == epoch) {
                    val p = outbox.first()
                    p.saved.await()
                    val result = runCatching { send(p) }
                    if (ep != epoch) return@launch
                    val e = result.exceptionOrNull()
                    if (e is CancellationException) throw e
                    if (e != null && transient(e)) {
                        p.op = p.op.copy(attempts = p.op.attempts + 1)
                        val noNetwork = e !is ApiException || e.status == 0
                        // A server that keeps failing on one change mustn't block the rest forever.
                        if (!noNetwork && !(e is ApiException && e.status == 401) && p.op.attempts >= 6) {
                            outbox.removeFirst()
                            if (owner != null) runCatching { withContext(io) { cache.deleteOp(owner, p.op.key) } }
                            reject(p, e)
                            continue
                        }
                        if (noNetwork) {
                            setOnline(false)
                            if (!toldOffline) {
                                toldOffline = true
                                toast("You're offline. Changes are saved on this phone and will sync when you're back online.")
                            }
                        }
                        val json = AppJson.encodeToString(OutboxOp.serializer(), p.op)
                        if (owner != null) runCatching { withContext(io) { cache.saveOp(owner, p.op.key, json) } }
                        scheduleRetry()
                        break
                    }
                    outbox.removeFirst()
                    if (owner != null) runCatching { withContext(io) { cache.deleteOp(owner, p.op.key) } }
                    if (e != null) reject(p, e) else {
                        setOnline(true)
                        retryMs = 2000
                        retries = 0
                        accept(p, result.getOrNull())
                    }
                }
            } finally {
                if (ep == epoch) {
                    flushJob = null
                    publishSync()
                    if (outbox.isEmpty() && resyncAfterFlush) {
                        resyncAfterFlush = false
                        scope.launch { runCatching { syncAll(todayFn()) } }
                    }
                }
            }
        }
        publishSync()
        return flushJob
    }

    /**
     * Tries again a few times on its own (2 s, 4 s, ... up to a minute apart). After that it waits
     * for a sign the network is back: the phone reconnecting, the app opening, a new change.
     */
    private fun scheduleRetry() {
        retryJob?.cancel()
        if (retries >= MAX_TIMED_RETRIES) return
        retries++
        val wait = retryMs
        retryMs = (retryMs * 2).coerceAtMost(60_000)
        retryJob = scope.launch {
            delay(wait)
            flush()
        }
    }

    /**
     * Waits until every change so far is saved on the phone, and (briefly) sent: for callers that
     * may be stopped right after, like a widget tap.
     */
    suspend fun settle(sendWithinMs: Long = 6000) {
        outbox.toList().forEach { it.saved.await() }
        persistJob?.join()
        kotlinx.coroutines.withTimeoutOrNull(sendWithinMs) { flushJob?.join() }
    }

    /** The phone is back online (or the app came back): send now instead of waiting. */
    fun onNetworkBack() {
        retryMs = 2000
        retries = 0
        flush()
    }

    private companion object {
        const val MAX_TIMED_RETRIES = 8
    }

    /** What the server answered: a task, a tag, or nothing (deleted). */
    private sealed interface Sent {
        data class TaskResult(val task: Task?) : Sent
        data class TagResult(val tag: Tag?) : Sent
        /** Removing an image whose task is already gone on the server. */
        data object Unchanged : Sent
    }

    private suspend fun send(p: Pending): Sent {
        val op = p.op
        val id = op.taskId
        return when (op.kind) {
            "createTask", "restoreTask" -> {
                var body = op.body ?: JsonObject(emptyMap())
                // A task may reach the server after its day has passed (made offline). createdAt (when it
                // was really made) marks it as an existing task: the server only refuses brand-new ones on past days.
                if (op.kind == "createTask" && "createdAt" !in body) {
                    body = JsonObject(body + ("createdAt" to JsonPrimitive(minOf(op.createdAt, now()))))
                }
                Sent.TaskResult(api.createTask(body))
            }
            "updateTask" -> Sent.TaskResult(api.updateTask(id!!, op.body ?: JsonObject(emptyMap())))
            "postpone" -> {
                val b = op.body
                Sent.TaskResult(api.postpone(id!!, (b?.get("today") as? JsonPrimitive)?.content ?: todayFn(), (b?.get("from") as? JsonPrimitive)?.content))
            }
            "deleteTask" -> try {
                api.deleteTask(id!!)
                Sent.TaskResult(null)
            } catch (e: ApiException) {
                if (e.status == 404) Sent.TaskResult(null) else throw e // already gone
            }
            "addImage" -> {
                val imgId = op.ref!!
                val bytes = files.read(imgId) ?: throw ApiException(400, "The image file is missing")
                val b = op.body
                val w = (b?.get("width") as? JsonPrimitive)?.content?.toIntOrNull() ?: 1
                val h = (b?.get("height") as? JsonPrimitive)?.content?.toIntOrNull() ?: 1
                val task = api.addAttachment(id!!, PreparedImage(imgId, bytes.first, bytes.second, w, h).body())
                files.delete(imgId)
                Sent.TaskResult(task)
            }
            "removeImage" -> try {
                val t = api.deleteAttachment(op.ref!!)
                if (t == null) Sent.TaskResult(null) else Sent.TaskResult(t)
            } catch (e: ApiException) {
                if (e.status == 404) Sent.Unchanged else throw e
            }
            "createTag" -> Sent.TagResult(api.createTag(op.body ?: JsonObject(emptyMap())))
            "updateTag" -> Sent.TagResult(api.updateTag(op.tagId!!, op.body ?: JsonObject(emptyMap())))
            "deleteTag" -> try {
                api.deleteTag(op.tagId!!)
                Sent.TagResult(null)
            } catch (e: ApiException) {
                if (e.status == 404) Sent.TagResult(null) else throw e
            }
            else -> throw ApiException(400, "Unknown change")
        }
    }

    private fun accept(p: Pending, sent: Sent?) {
        val op = p.op
        val id = op.taskId
        if (id != null) {
            val server = when (sent) {
                is Sent.TaskResult -> sent.task
                else -> _state.value.tasks[id] ?: confirmed[id]
            }
            if (server != null) confirmed[id] = server else confirmed.remove(id)
            if (latest[id] == p.mine) {
                edit { if (server != null) put(server) }
                latest.remove(id)
            }
        } else if (op.tagId != null && sent is Sent.TagResult && sent.tag != null && tagsTouched <= p.mine) {
            // The server's copy (position, logo) wins unless the tag changed here again meanwhile.
            val s = _state.value
            if (s.tag(op.tagId) != null) {
                _state.value = s.copy(tags = (s.tags.filter { it.id != op.tagId } + sent.tag).sortedWith(compareBy({ it.position }, { it.createdAt })))
                tagsDirty = true
            }
        }
        markDates(op.dates, p.mine, -1)
        p.done.complete(true)
        schedulePersist()
        publishSync()
    }

    private fun reject(p: Pending, e: Throwable) {
        val op = p.op
        val id = op.taskId
        if (id != null && latest[id] == p.mine) {
            // Back to what the server last confirmed (never to an unconfirmed optimistic state).
            val base = confirmed[id]
            edit { if (base != null) put(base) else drop(id) }
            latest.remove(id)
        }
        if (op.kind == "addImage") op.ref?.let { files.delete(it) }
        if (op.kind == "createTag" && op.tagId != null) {
            // The server refused a tag made offline: drop it, and take it off waiting tasks.
            val tagId = op.tagId
            for (o in outbox) {
                val ids = o.op.body?.get("tagIds") as? kotlinx.serialization.json.JsonArray ?: continue
                if (ids.any { (it as? JsonPrimitive)?.content == tagId }) {
                    val kept = kotlinx.serialization.json.JsonArray(ids.filter { (it as? JsonPrimitive)?.content != tagId })
                    o.op = o.op.copy(body = JsonObject(o.op.body!! + ("tagIds" to kept)))
                    val owner = uid
                    val json = AppJson.encodeToString(OutboxOp.serializer(), o.op)
                    if (owner != null) scope.launch { runCatching { withContext(io) { cache.saveOp(owner, o.op.key, json) } } }
                }
            }
            val s = _state.value
            _state.value = s.copy(tags = s.tags.filter { it.id != tagId })
            edit { for (t in tasks.values.toList()) if (tagId in t.tagIds) put(t.copy(tagIds = t.tagIds - tagId)) }
            tagsDirty = true
        } else if (op.tagId != null) {
            scope.launch { runCatching { loadTags() } }
        }
        markDates(op.dates, p.mine, -1)
        toast("${op.label}: ${message(e)}")
        p.done.complete(false)
        // Fetch again so the screen matches the server (after a restart "confirmed" is the saved copy).
        _state.value = _state.value.let { s -> s.copy(loadedDays = s.loadedDays - op.dates.toSet()) }
        resyncAfterFlush = true
        schedulePersist()
        publishSync()
    }

    /**
     * Sends waiting changes first. True when nothing is left waiting: safe to make a request that
     * may carry tasks over (day, sync, stats).
     */
    suspend fun drained(): Boolean {
        if (outbox.isEmpty()) return true
        (flush() ?: flushJob)?.join()
        return outbox.isEmpty()
    }

    // ---- Loading ------------------------------------------------------------------

    /** Fetches one day (and, for today, everything still pending from earlier days). */
    suspend fun loadDay(date: String, today: String) {
        val ep = epoch
        if (!drained()) throw offline()
        if (ep != epoch) return
        val startSeq = seq
        val req = (dayRequest[date] ?: 0) + 1
        dayRequest[date] = req
        val res = try {
            api.day(date, today)
        } catch (e: ApiException) {
            if (e.status == 0) setOnline(false)
            throw e
        }
        if (ep != epoch || dayRequest[date] != req) return // signed out, or a newer fetch exists
        setOnline(true)

        fun changedSince(id: String) = (touched[id] ?: 0) > startSeq || latest.containsKey(id)
        val fresh = res.tasks + res.overdue
        val freshIds = fresh.mapTo(HashSet()) { it.id }
        fresh.forEach { confirmed[it.id] = it }
        edit {
            val days = hashSetOf(date)
            for ((id, t) in tasks.entries.toList()) {
                if (id in freshIds || changedSince(id)) continue
                val onDay = t.date == date
                val wasOverdue = date == today && t.isPending && t.date < today
                if (onDay || wasOverdue) { // deleted or moved elsewhere on another device
                    days += t.date
                    tasks.remove(id)
                    confirmed.remove(id)
                    dirtyTasks += id
                }
            }
            for (t in fresh) if (!changedSince(t.id)) {
                tasks[t.id]?.let { days += it.date }
                days += t.date
                tasks[t.id] = t
                dirtyTasks += t.id
            }
            days.forEach { recount(it) }
        }
        _state.value = _state.value.let { it.copy(loadedDays = it.loadedDays + date, cachedDays = it.cachedDays + date) }
        schedulePersist()
    }

    /** Per-day counts for the calendar dots. */
    suspend fun loadSummary(from: String, to: String) {
        val ep = epoch
        val startSeq = seq
        val res = api.summary(from, to)
        if (ep != epoch) return
        val got = res.days.associateBy { it.date }
        val s = _state.value
        val next = s.summary.toMutableMap()
        var d = from
        while (d <= to) {
            // Skip days with local changes the server may not have seen yet.
            if ((dateTouched[d] ?: 0) <= startSeq && (inflightDates[d] ?: 0) == 0) {
                val c = got[d]?.counts() ?: Counts()
                next[d] = c
                if (c.missed > 0) misses[d] = c.missed else misses.remove(d)
                dirtySummary += d
            }
            d = Dates.addDays(d, 1)
        }
        _state.value = s.copy(summary = next)
        metaDirty = true
        schedulePersist()
    }

    suspend fun loadTags() {
        val ep = epoch
        val startTags = tagsTouched
        val res = api.tags()
        if (ep != epoch) return
        // Tag changes still waiting to be sent win over this (older) copy.
        if (tagsTouched != startTags || outbox.any { it.op.tagId != null }) return
        _state.value = _state.value.copy(tags = res.tags.sortedWith(compareBy({ it.position }, { it.createdAt })), tagsLoaded = true)
        tagsDirty = true
        schedulePersist()
    }

    /**
     * Fetches a full copy of the account (every task, tags, missed days) for offline use, after
     * sending any waiting changes. Returns false without a connection.
     */
    suspend fun syncAll(today: String): Boolean {
        val ep = epoch
        if (uid == null) return false
        if (!drained()) return false
        if (ep != epoch) return false
        val startSeq = seq
        val startTags = tagsTouched
        val res = try {
            api.sync(today)
        } catch (e: ApiException) {
            if (e.status == 0) setOnline(false)
            return false
        }
        if (ep != epoch) return false
        setOnline(true)
        fun changedSince(id: String) = (touched[id] ?: 0) > startSeq || latest.containsKey(id)
        val freshIds = res.tasks.mapTo(HashSet()) { it.id }
        misses.clear()
        res.misses.forEach { misses[it.date] = it.missed }
        edit {
            for (id in tasks.keys.toList()) if (id !in freshIds && !changedSince(id)) {
                tasks.remove(id) // gone on the server
                confirmed.remove(id)
                dirtyTasks += id
            }
            for (t in res.tasks) {
                confirmed[t.id] = t
                if (changedSince(t.id)) continue
                tasks[t.id] = t
                dirtyTasks += t.id
            }
            recountAll()
        }
        var s = _state.value.copy(knownAll = true)
        if (tagsTouched == startTags && outbox.none { it.op.tagId != null }) {
            s = s.copy(tags = res.tags.sortedWith(compareBy({ it.position }, { it.createdAt })), tagsLoaded = true)
            tagsDirty = true
        }
        _state.value = s
        lastSync = now()
        metaDirty = true
        schedulePersist()
        return true
    }

    /** The month summary from the copy on this phone (same as /api/stats), for offline use. */
    fun localStats(from: String, to: String, today: String): Stats {
        val days = HashMap<String, DayCounts>()
        val byTag = HashMap<String?, Counts>()
        val byPriority = HashMap<Int, Counts>()
        var overdue = 0
        var postponed = 0
        for (t in _state.value.tasks.values) {
            if (t.date < from || t.date > to) continue
            val d = days[t.date] ?: DayCounts(t.date)
            days[t.date] = when (t.status) {
                Status.PENDING -> d.copy(pending = d.pending + 1)
                Status.DONE -> d.copy(done = d.done + 1)
                else -> d.copy(cancelled = d.cancelled + 1)
            }
            val keys: List<String?> = t.tagIds.ifEmpty { listOf(null) }
            for (k in keys) byTag[k] = (byTag[k] ?: Counts()).bump(t.status, +1)
            byPriority[t.priority] = (byPriority[t.priority] ?: Counts()).bump(t.status, +1)
            if (t.carriedFrom != null || (t.isPending && t.date < today)) overdue++
            if (t.postponed > 0) postponed++
        }
        for ((d, n) in misses) if (d in from..to) days[d] = (days[d] ?: DayCounts(d)).copy(missed = n)
        return Stats(
            days = days.values.sortedBy { it.date },
            byTag = byTag.map { (k, c) -> TagCounts(k, c.pending, c.done, c.cancelled) },
            byPriority = byPriority.toSortedMap().map { (k, c) -> PriorityCounts(k, c.pending, c.done, c.cancelled) },
            overdue = overdue,
            postponed = postponed,
        )
    }

    // ---- Mutations --------------------------------------------------------------

    private fun message(e: Throwable) = (e as? ApiException)?.message ?: "Something went wrong. Please try again."

    /**
     * Shows [next] (or removes the task when null) right away and queues [op] for the server.
     * Completes with true once the server has it (offline: when it's back), false if refused.
     */
    private fun mutate(id: String, next: Task?, errorLabel: String, op: OutboxOp): Deferred<Boolean> {
        val mine = ++seq
        val prev = _state.value.tasks[id]
        val dates = listOfNotNull(prev?.date, next?.date).distinct()
        touched[id] = mine
        latest[id] = mine
        markDates(dates, mine, +1)
        edit { if (next != null) put(next) else drop(id) }
        schedulePersist()
        return enqueue(op.copy(taskId = id, label = errorLabel, dates = dates), mine)
    }

    private fun op(kind: String, body: JsonObject? = null, ref: String? = null) = OutboxOp(key = 0, kind = kind, body = body, ref = ref)

    private fun normalizeTitle(s: String) = s.replace(Regex("\\s+"), " ").trim()

    /** Adds a task; [Pair.second] completes with true once the server has it, false if refused. */
    fun createTask(
        title: String, date: String, priority: Int = 4, notes: String = "", tagIds: List<String> = emptyList(),
        subtasks: List<Subtask> = emptyList(),
    ): Pair<Task, Deferred<Boolean>> {
        val t = now()
        val steps = Steps.normalize(subtasks)
        val status = Steps.statusAfter(Status.PENDING, steps)
        // New tasks go on today or later (the server refuses earlier days).
        val today = todayFn()
        val day = if (date < today) today else date
        val task = Task(
            id = UUID.randomUUID().toString(), title = normalizeTitle(title), notes = notes.trim(), priority = priority,
            date = day, status = status, originalDate = day, postponed = 0, createdAt = t, updatedAt = t,
            completedAt = if (status == Status.DONE) t else null, tagIds = cleanTagIds(tagIds), subtasks = steps,
        )
        return task to mutate(task.id, task, "Couldn't add task", op("createTask", JsonObject(taskBody(task) + ("today" to JsonPrimitive(today)))))
    }

    /** Applies a partial change; returns the task as it was before (null if unknown). */
    fun updateTask(id: String, patch: TaskPatch): Task? {
        val old = _state.value.tasks[id] ?: return null
        var p = if (patch.tagIds != null) patch.copy(tagIds = cleanTagIds(patch.tagIds)) else patch
        if (p.subtasks != null) p = p.copy(subtasks = Steps.normalize(p.subtasks))
        val t = now()
        var next = old.copy(
            title = p.title?.let(::normalizeTitle) ?: old.title,
            notes = p.notes?.trim() ?: old.notes,
            priority = p.priority ?: old.priority,
            date = p.date ?: old.date,
            postponed = p.postponed ?: old.postponed,
            tagIds = p.tagIds ?: old.tagIds,
            subtasks = p.subtasks ?: old.subtasks,
            // Same rule as the server: moving a task on purpose clears its "from earlier" mark.
            carriedFrom = when {
                p.carriedFrom != null -> p.carriedFrom.takeIf { it < (p.date ?: old.date) }
                p.date != null && p.date != old.date -> null
                else -> old.carriedFrom
            },
            updatedAt = t,
        )
        // Same rule as the server: changing the steps decides done/pending unless a status is given.
        val status = p.status ?: if (p.subtasks != null) Steps.statusAfter(old.status, p.subtasks) else old.status
        if (status != old.status) {
            next = next.copy(status = status, completedAt = if (status == Status.DONE) t else null)
        }
        mutate(id, next, "Couldn't save", op("updateTask", p.toJson()))
        return old
    }

    private fun setStatus(id: String, status: String, message: String) {
        val old = updateTask(id, TaskPatch(status = status)) ?: return
        toast(message, "Undo") { updateTask(id, TaskPatch(status = old.status)) }
    }

    /** A task with open steps isn't completed directly; the message offers to tick them all. */
    fun completeTask(id: String) {
        val t = _state.value.tasks[id] ?: return
        val p = Steps.progress(t.subtasks)
        if (p.total > 0 && !p.complete) {
            toast("${p.open} step${if (p.open == 1) "" else "s"} still open", "Complete all") {
                val cur = _state.value.tasks[id] ?: return@toast
                val before = cur.subtasks
                updateTask(id, TaskPatch(subtasks = Steps.setAll(before, true)))
                toast("All steps done, task completed", "Undo") { updateTask(id, TaskPatch(subtasks = before)) }
            }
            return
        }
        setStatus(id, Status.DONE, "Task completed")
    }

    /** Ticks one step; ticking the last one completes the task (with Undo). */
    fun toggleStep(id: String, stepId: String) {
        val t = _state.value.tasks[id] ?: return
        val before = t.subtasks
        val after = Steps.toggle(before, stepId)
        updateTask(id, TaskPatch(subtasks = after))
        if (t.status != Status.DONE && Steps.statusAfter(t.status, after) == Status.DONE) {
            toast("All steps done, task completed", "Undo") { updateTask(id, TaskPatch(subtasks = before)) }
        }
    }

    // ---- Images ---------------------------------------------------------------------

    /** Uploads an image after earlier changes to the task; offline it waits on the phone. */
    fun addAttachment(taskId: String, img: PreparedImage): Deferred<Boolean>? {
        val old = _state.value.tasks[taskId] ?: return null
        onImagePrepared?.invoke(img)
        files.write(img.id, img.full, img.thumb)
        val local = Attachment(img.id, "jpeg", img.width, img.height, img.full.size.toLong(), now(), uploading = true)
        val next = old.copy(attachments = old.attachments + local)
        val body = buildJsonObject { put("width", img.width); put("height", img.height) }
        return mutate(taskId, next, "Couldn't add image", op("addImage", body, ref = img.id))
    }

    fun removeAttachment(taskId: String, attachmentId: String): Deferred<Boolean>? {
        val old = _state.value.tasks[taskId] ?: return null
        val next = old.copy(attachments = old.attachments.filter { it.id != attachmentId })
        return mutate(taskId, next, "Couldn't remove image", op("removeImage", ref = attachmentId))
    }

    /** Lets the image cache keep the local copy of an image being uploaded. */
    var onImagePrepared: ((PreparedImage) -> Unit)? = null
    fun cancelTask(id: String) = setStatus(id, Status.CANCELLED, "Task cancelled")
    fun restoreTask(id: String) = setStatus(id, Status.PENDING, "Task restored")

    fun postponeTask(id: String, today: String) {
        val old = _state.value.tasks[id] ?: return
        if (!old.isPending) return
        val target = Dates.postponeTarget(old.date, today)
        val next = old.copy(date = target, postponed = old.postponed + 1, carriedFrom = null, updatedAt = now())
        // `from` makes a repeat harmless: the server only moves it if it's still on that day.
        mutate(id, next, "Couldn't postpone", op("postpone", buildJsonObject { put("today", today); put("from", old.date) }))
        val label = Dates.shortLabel(target, today)
        toast(if (label == "Tomorrow") "Postponed to tomorrow" else "Postponed to $label", "Undo") {
            updateTask(id, TaskPatch(date = old.date, postponed = old.postponed, carriedFrom = old.carriedFrom))
        }
    }

    fun moveTasks(ids: List<String>, date: String) {
        val olds = ids.mapNotNull { _state.value.tasks[it] }.filter { it.date != date }
        if (olds.isEmpty()) return
        olds.forEach { updateTask(it.id, TaskPatch(date = date)) }
        toast("${olds.size} task${if (olds.size == 1) "" else "s"} moved", "Undo") {
            olds.forEach { updateTask(it.id, TaskPatch(date = it.date, carriedFrom = it.carriedFrom)) }
        }
    }

    fun deleteTask(id: String) {
        val old = _state.value.tasks[id] ?: return
        mutate(id, null, "Couldn't delete", op("deleteTask"))
        toast("Task deleted", "Undo") {
            val restored = old.copy(tagIds = cleanTagIds(old.tagIds), attachments = old.attachments.filter { !it.uploading })
            mutate(id, restored, "Couldn't restore", op("restoreTask", taskBody(restored, includeHistory = true)))
        }
    }

    // ---- Tags -----------------------------------------------------------------------

    private fun sortTags(list: List<Tag>) = list.sortedWith(compareBy({ it.position }, { it.createdAt }))

    /**
     * Saves a tag. Online (and nothing waiting) it waits for the server, so a name clash shows in
     * the form. Offline the name is checked here and the change is queued.
     */
    suspend fun saveTag(id: String?, name: String, color: String, logo: String?, logoChanged: Boolean): Tag {
        val ep = epoch
        val tagId = id ?: UUID.randomUUID().toString()
        val body = buildJsonObject {
            if (id == null) put("id", tagId)
            put("name", name)
            put("color", color)
            if (id == null || logoChanged) {
                if (logo == null) put("logo", kotlinx.serialization.json.JsonNull) else put("logo", logo)
            }
        }
        if (outbox.isEmpty()) {
            try {
                val tag = if (id == null) api.createTag(body) else api.updateTag(id, body)
                if (ep == epoch) {
                    setOnline(true)
                    val s = _state.value
                    _state.value = s.copy(tags = sortTags(s.tags.filter { it.id != tag.id } + tag), tagsLoaded = true)
                    tagsTouched = ++seq
                    tagsDirty = true
                    schedulePersist()
                }
                return tag
            } catch (e: ApiException) {
                if (e.status != 0) throw e
                setOnline(false) // save it offline below
            }
        }
        val s = _state.value
        if (s.tags.any { it.id != tagId && it.name.trim().equals(name.trim(), ignoreCase = true) }) {
            throw ApiException(409, "A tag with that name already exists")
        }
        val old = s.tag(tagId)
        val t = now()
        val local = Tag(
            id = tagId, name = name.trim(), color = color,
            logo = if (id == null || logoChanged) logo else old?.logo,
            position = old?.position ?: ((s.tags.maxOfOrNull { it.position } ?: -1) + 1),
            createdAt = old?.createdAt ?: t, updatedAt = t,
        )
        _state.value = s.copy(tags = sortTags(s.tags.filter { it.id != tagId } + local), tagsLoaded = true)
        val mine = ++seq
        tagsTouched = mine
        tagsDirty = true
        schedulePersist()
        enqueue(OutboxOp(0, if (id == null) "createTag" else "updateTag", tagId = tagId, body = body, label = "Couldn't save tag"), mine)
        return local
    }

    /** Deletes a tag (and takes it off its tasks); offline it's queued. */
    suspend fun removeTag(id: String) {
        val mine = ++seq
        tagsTouched = mine
        for ((k, t) in confirmed.entries.toList()) if (id in t.tagIds) confirmed[k] = t.copy(tagIds = t.tagIds - id)
        val s = _state.value
        val tasks = s.tasks.mapValues { (_, t) -> if (id in t.tagIds) t.copy(tagIds = t.tagIds - id).also { dirtyTasks += t.id } else t }
        _state.value = s.copy(tags = s.tags.filter { it.id != id }, tasks = tasks)
        tagsDirty = true
        schedulePersist()
        enqueue(OutboxOp(0, "deleteTag", tagId = id, label = "Couldn't delete tag"), mine)
    }
}

/** An image shrunk on the phone, ready to upload (JPEG bytes). */
class PreparedImage(val id: String, val full: ByteArray, val thumb: ByteArray, val width: Int, val height: Int) {
    fun body(): JsonObject = buildJsonObject {
        put("id", id)
        put("image", "data:image/jpeg;base64," + java.util.Base64.getEncoder().encodeToString(full))
        put("thumb", "data:image/jpeg;base64," + java.util.Base64.getEncoder().encodeToString(thumb))
        put("width", width)
        put("height", height)
    }
}

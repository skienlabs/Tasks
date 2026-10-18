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
    val tags: List<Tag> = emptyList(),
    val tagsLoaded: Boolean = false,
) {
    private val tagById by lazy { tags.associateBy { it.id } }
    fun tag(id: String): Tag? = tagById[id]

    fun day(date: String): List<Task> = tasks.values.filter { it.date == date }.sortedWith(DAY_ORDER)
    fun overdue(today: String): List<Task> =
        tasks.values.filter { it.isPending && it.date < today }.sortedWith(compareBy<Task> { it.date }.then(PRIORITY_ORDER))
    fun hasDay(date: String) = date in loadedDays || date in cachedDays

    companion object {
        private val PRIORITY_ORDER = compareBy<Task>({ it.priority }, { it.createdAt })
        private val DAY_ORDER = compareBy<Task> {
            when (it.status) { Status.PENDING -> 0; Status.DONE -> 1; else -> 2 }
        }.then(PRIORITY_ORDER)
    }
}

data class Toast(val id: Long, val message: String, val actionLabel: String? = null, val action: (() -> Unit)? = null)

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
 * Client-side store. Every change shows instantly and is then sent to the server; on failure it
 * rolls back to the last state the server confirmed.
 *
 * Threading: all public functions must be called on the main thread, and [scope] must run on it
 * (Dispatchers.Main.immediate). That keeps every map below single-threaded, like the web app.
 *
 * Race rules (same as the web app):
 * - Writes for the same task run strictly in order (one queue per task).
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
) {
    private val _state = MutableStateFlow(StoreState())
    val state: StateFlow<StoreState> = _state.asStateFlow()

    private val _toasts = MutableSharedFlow<Toast>(extraBufferCapacity = 16)
    val toasts: SharedFlow<Toast> = _toasts

    private var uid: String? = null
    private var epoch = 0
    private var seq = 0L
    private val confirmed = HashMap<String, Task>()
    private val touched = HashMap<String, Long>()
    private val latest = HashMap<String, Long>()
    private val queues = HashMap<String, Job>()
    private val dayRequest = HashMap<String, Int>()
    private val dateTouched = HashMap<String, Long>()
    private val inflightDates = HashMap<String, Int>()

    // Background persistence of changed rows to the local cache.
    private val dirtyTasks = HashSet<String>()
    private val dirtySummary = HashSet<String>()
    private var tagsDirty = false
    private var persistJob: Job? = null

    val currentUid: String? get() = uid

    // ---- Session ----------------------------------------------------------------

    /** Starts a session for [newUid], showing cached data first. */
    suspend fun start(newUid: String, today: String) {
        if (uid == newUid) return
        reset()
        uid = newUid
        val ep = epoch
        val snap = runCatching {
            withContext(io) { cache.load(newUid, Dates.addDays(today, -62), Dates.addDays(today, 62), today) }
        }.getOrDefault(CacheSnapshot())
        if (ep != epoch) return
        snap.tasks.forEach { confirmed[it.id] = it }
        _state.value = StoreState(
            tasks = snap.tasks.associateBy { it.id },
            summary = snap.summary,
            cachedDays = snap.summary.keys,
            tags = snap.tags.sortedWith(compareBy({ it.position }, { it.createdAt })),
            tagsLoaded = false,
        )
    }

    /** Signs out: forgets everything in memory and wipes the local cache. */
    fun clear() {
        reset()
        scope.launch { runCatching { withContext(io) { cache.clear() } } }
    }

    private fun reset() {
        epoch++
        uid = null
        queues.values.forEach { it.cancel() }
        listOf(confirmed, touched, latest, queues, dayRequest, dateTouched, inflightDates).forEach { it.clear() }
        dirtyTasks.clear()
        dirtySummary.clear()
        tagsDirty = false
        persistJob?.cancel()
        persistJob = null
        _state.value = StoreState()
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
        summary[task.date] = (summary[task.date] ?: Counts()).bump(task.status, sign)
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
        summary[date] = c
        dirtySummary += date
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
            val days = dirtySummary.toList().also { dirtySummary.clear() }.mapNotNull { d -> s.summary[d]?.let { d to it } }.toMap()
            val tags = if (tagsDirty) s.tags.also { tagsDirty = false } else null
            runCatching {
                withContext(io) {
                    cache.saveTasks(owner, upserts, deletes)
                    cache.saveSummary(owner, days)
                    if (tags != null) cache.saveTags(owner, tags)
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

    // ---- Loading ------------------------------------------------------------------

    /** Fetches one day (and, for today, everything still pending from earlier days). */
    suspend fun loadDay(date: String, today: String) {
        val ep = epoch
        val startSeq = seq
        val req = (dayRequest[date] ?: 0) + 1
        dayRequest[date] = req
        val res = api.day(date, today)
        if (ep != epoch || dayRequest[date] != req) return // signed out, or a newer fetch exists

        fun changedSince(id: String) = (touched[id] ?: 0) > startSeq || latest.containsKey(id)
        val fresh = res.tasks + res.overdue
        val freshIds = fresh.mapTo(HashSet()) { it.id }
        fresh.forEach { confirmed[it.id] = it }
        edit {
            for ((id, t) in tasks.entries.toList()) {
                if (id in freshIds || changedSince(id)) continue
                val onDay = t.date == date
                val wasOverdue = date == today && t.isPending && t.date < today
                if (onDay || wasOverdue) { // deleted or moved elsewhere on another device
                    tasks.remove(id)
                    confirmed.remove(id)
                    dirtyTasks += id
                }
            }
            for (t in fresh) if (!changedSince(t.id)) {
                tasks[t.id] = t
                dirtyTasks += t.id
            }
            recount(date)
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
                next[d] = got[d]?.counts() ?: Counts()
                dirtySummary += d
            }
            d = Dates.addDays(d, 1)
        }
        _state.value = s.copy(summary = next)
        schedulePersist()
    }

    suspend fun loadTags() {
        val ep = epoch
        val res = api.tags()
        if (ep != epoch) return
        _state.value = _state.value.copy(tags = res.tags.sortedWith(compareBy({ it.position }, { it.createdAt })), tagsLoaded = true)
        tagsDirty = true
        schedulePersist()
    }

    // ---- Mutations --------------------------------------------------------------

    private fun markDates(dates: Collection<String>, mine: Long, delta: Int) {
        for (d in dates) {
            if (delta > 0) dateTouched[d] = mine
            val n = (inflightDates[d] ?: 0) + delta
            if (n > 0) inflightDates[d] = n else inflightDates.remove(d)
        }
    }

    private fun message(e: Throwable) = (e as? ApiException)?.message ?: "Something went wrong. Please try again."

    /**
     * Shows [next] (or removes the task when null) right away, then runs [request] after any
     * earlier write for the same task. Completes with true when the server accepted it.
     */
    private fun mutate(id: String, next: Task?, errorLabel: String, request: suspend () -> Task?): Deferred<Boolean> {
        val ep = epoch
        val mine = ++seq
        val prev = _state.value.tasks[id]
        val dates = setOfNotNull(prev?.date, next?.date)
        touched[id] = mine
        latest[id] = mine
        markDates(dates, mine, +1)
        edit { if (next != null) put(next) else drop(id) }
        schedulePersist()

        val before = queues[id]
        // LAZY so the job is registered in [queues] before any of its code runs.
        lateinit var self: Deferred<Boolean>
        self = scope.async(start = CoroutineStart.LAZY) {
            try {
                before?.join()
                if (ep != epoch) return@async false // account changed before this write ran
                val server = request()
                if (ep != epoch) return@async false
                if (server != null) confirmed[id] = server else confirmed.remove(id)
                if (latest[id] == mine) {
                    if (server != null) edit { put(server) }
                    latest.remove(id)
                    schedulePersist()
                }
                true
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (ep != epoch) return@async false
                if (latest[id] == mine) {
                    // Back to what the server last confirmed (never to an unconfirmed optimistic state).
                    val base = confirmed[id]
                    edit { if (base != null) put(base) else drop(id) }
                    latest.remove(id)
                    schedulePersist()
                }
                toast("$errorLabel: ${message(e)}")
                false
            } finally {
                if (ep == epoch) {
                    markDates(dates, mine, -1)
                    if (queues[id] === self) queues.remove(id)
                }
            }
        }
        queues[id] = self
        self.start()
        return self
    }

    private fun normalizeTitle(s: String) = s.replace(Regex("\\s+"), " ").trim()

    /** Adds a task; [Pair.second] completes with true once the server saved it. */
    fun createTask(
        title: String, date: String, priority: Int = 4, notes: String = "", tagIds: List<String> = emptyList(),
        subtasks: List<Subtask> = emptyList(),
    ): Pair<Task, Deferred<Boolean>> {
        val t = now()
        val steps = Steps.normalize(subtasks)
        val status = Steps.statusAfter(Status.PENDING, steps)
        val task = Task(
            id = UUID.randomUUID().toString(), title = normalizeTitle(title), notes = notes.trim(), priority = priority,
            date = date, status = status, originalDate = date, postponed = 0, createdAt = t, updatedAt = t,
            completedAt = if (status == Status.DONE) t else null, tagIds = cleanTagIds(tagIds), subtasks = steps,
        )
        return task to mutate(task.id, task, "Couldn't add task") { api.createTask(taskBody(task)) }
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
        mutate(id, next, "Couldn't save") { api.updateTask(id, p.toJson()) }
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

    /** Uploads an image after any pending write to the task (so it also works right after creating it). */
    fun addAttachment(taskId: String, img: PreparedImage): Deferred<Boolean>? {
        val old = _state.value.tasks[taskId] ?: return null
        onImagePrepared?.invoke(img)
        val local = Attachment(img.id, "jpeg", img.width, img.height, img.full.size.toLong(), now(), uploading = true)
        val next = old.copy(attachments = old.attachments + local)
        return mutate(taskId, next, "Couldn't add image") { api.addAttachment(taskId, img.body()) }
    }

    fun removeAttachment(taskId: String, attachmentId: String): Deferred<Boolean>? {
        val old = _state.value.tasks[taskId] ?: return null
        val next = old.copy(attachments = old.attachments.filter { it.id != attachmentId })
        return mutate(taskId, next, "Couldn't remove image") { api.deleteAttachment(attachmentId) }
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
        mutate(id, next, "Couldn't postpone") { api.postpone(id, today) }
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
        mutate(id, null, "Couldn't delete") {
            api.deleteTask(id)
            null
        }
        toast("Task deleted", "Undo") {
            val restored = old.copy(tagIds = cleanTagIds(old.tagIds), attachments = old.attachments.filter { !it.uploading })
            mutate(id, restored, "Couldn't restore") { api.createTask(taskBody(restored, includeHistory = true)) }
        }
    }

    // ---- Tags (wait for the server so name clashes show in the form) --------------

    suspend fun saveTag(id: String?, name: String, color: String, logo: String?, logoChanged: Boolean): Tag {
        val ep = epoch
        val body = buildJsonObject {
            if (id == null) put("id", UUID.randomUUID().toString())
            put("name", name)
            put("color", color)
            if (id == null || logoChanged) {
                if (logo == null) put("logo", kotlinx.serialization.json.JsonNull) else put("logo", logo)
            }
        }
        val tag = if (id == null) api.createTag(body) else api.updateTag(id, body)
        if (ep == epoch) {
            val s = _state.value
            val tags = (s.tags.filter { it.id != tag.id } + tag).sortedWith(compareBy({ it.position }, { it.createdAt }))
            _state.value = s.copy(tags = tags)
            tagsDirty = true
            schedulePersist()
        }
        return tag
    }

    suspend fun removeTag(id: String) {
        val ep = epoch
        api.deleteTag(id)
        if (ep != epoch) return
        for ((k, t) in confirmed.entries.toList()) if (id in t.tagIds) confirmed[k] = t.copy(tagIds = t.tagIds - id)
        val s = _state.value
        val tasks = s.tasks.mapValues { (_, t) -> if (id in t.tagIds) t.copy(tagIds = t.tagIds - id).also { dirtyTasks += t.id } else t }
        _state.value = s.copy(tags = s.tags.filter { it.id != id }, tasks = tasks)
        tagsDirty = true
        schedulePersist()
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

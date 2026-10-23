package com.skienlabs.tasks

import com.skienlabs.tasks.data.ApiException
import com.skienlabs.tasks.data.Cache
import com.skienlabs.tasks.data.CacheSnapshot
import com.skienlabs.tasks.data.SyncStatus
import com.skienlabs.tasks.data.DayResponse
import com.skienlabs.tasks.data.DayCounts
import com.skienlabs.tasks.data.Counts
import com.skienlabs.tasks.data.Dates
import com.skienlabs.tasks.data.NoCache
import com.skienlabs.tasks.data.Profile
import com.skienlabs.tasks.data.Stats
import com.skienlabs.tasks.data.Status
import com.skienlabs.tasks.data.Steps
import com.skienlabs.tasks.data.Subtask
import com.skienlabs.tasks.data.Attachment
import com.skienlabs.tasks.data.PreparedImage
import com.skienlabs.tasks.data.Store
import com.skienlabs.tasks.data.SummaryResponse
import com.skienlabs.tasks.data.Tag
import com.skienlabs.tasks.data.TagsResponse
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.data.TaskPatch
import com.skienlabs.tasks.data.TasksApi
import com.skienlabs.tasks.data.Toast
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.intOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** In-memory server with switches to delay or fail requests. */
class FakeApi : TasksApi {
    val tasks = LinkedHashMap<String, Task>()
    val tags = LinkedHashMap<String, Tag>()
    var failWrites = false
    var dayGate: CompletableDeferred<Unit>? = null // holds day responses until completed
    val calls = mutableListOf<String>()
    val createBodies = mutableListOf<JsonObject>()
    private var clock = 1000L

    /** Offline: every request fails like a dropped connection. */
    var offline = false
    /** The server refuses writes (a 400), e.g. a rule the phone didn't know about. */
    var refuseWrites = false

    private fun fail() {
        if (failWrites || offline) throw ApiException(0, "You appear to be offline")
        if (refuseWrites) throw ApiException(400, "Not allowed")
    }

    override suspend fun sync(today: String): com.skienlabs.tasks.data.SyncResponse {
        calls += "sync"
        if (offline) throw ApiException(0, "You appear to be offline")
        tasks.replaceAll { _, t -> if (t.isPending && t.date < today) t.copy(carriedFrom = t.carriedFrom ?: t.date, date = today) else t }
        return com.skienlabs.tasks.data.SyncResponse(
            tasks.values.toList(), tags.values.toList(),
            summaryDays.filter { it.missed > 0 }.map { com.skienlabs.tasks.data.MissCount(it.date, it.missed) }, clock,
        )
    }

    override suspend fun me() = Profile("u", name = "U", onboarded = true)
    override suspend fun updateMe(name: String?, onboarded: Boolean?) = me()
    override suspend fun day(date: String, today: String): DayResponse {
        calls += "day:$date"
        if (offline) throw ApiException(0, "You appear to be offline")
        // Like the server: unfinished tasks from earlier days move to today, remembering where they came from.
        tasks.replaceAll { _, t -> if (t.isPending && t.date < today) t.copy(carriedFrom = t.carriedFrom ?: t.date, date = today) else t }
        val snapshot = DayResponse(
            tasks.values.filter { it.date == date },
            if (date == today) tasks.values.filter { it.isPending && it.date < today } else emptyList(),
        )
        dayGate?.await()
        return snapshot
    }
    var summaryDays: List<DayCounts> = emptyList()
    override suspend fun summary(from: String, to: String) = SummaryResponse(summaryDays.filter { it.date in from..to })
    override suspend fun stats(from: String, to: String, today: String) = Stats()
    override suspend fun createTask(body: JsonObject): Task {
        calls += "create"; fail()
        createBodies += body
        val id = body["id"]!!.jsonPrimitive.content
        tasks[id]?.let { return it }
        val t = Task(
            id = id, title = body["title"]!!.jsonPrimitive.content, date = body["date"]!!.jsonPrimitive.content,
            priority = body["priority"]?.jsonPrimitive?.intOrNull ?: 4,
            status = body["status"]?.jsonPrimitive?.content ?: Status.PENDING,
            tagIds = body["tagIds"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
            createdAt = body["createdAt"]?.jsonPrimitive?.content?.toLong() ?: clock++, updatedAt = clock++,
            subtasks = body["subtasks"]?.let { com.skienlabs.tasks.data.AppJson.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(Subtask.serializer()), it) } ?: emptyList(),
        )
        tasks[id] = t
        return t
    }
    override suspend fun updateTask(id: String, patch: JsonObject): Task {
        calls += "patch"; fail()
        val cur = tasks[id] ?: throw ApiException(404, "Task not found")
        var n = cur
        patch["title"]?.let { n = n.copy(title = it.jsonPrimitive.content) }
        patch["date"]?.let { d -> if (d.jsonPrimitive.content != cur.date) n = n.copy(date = d.jsonPrimitive.content, carriedFrom = null) }
        patch["carriedFrom"]?.let { n = n.copy(carriedFrom = it.jsonPrimitive.content.takeIf { c -> c < n.date }) }
        patch["status"]?.let { n = n.copy(status = it.jsonPrimitive.content) }
        patch["priority"]?.let { n = n.copy(priority = it.jsonPrimitive.intOrNull!!) }
        patch["tagIds"]?.let { a -> n = n.copy(tagIds = a.jsonArray.map { it.jsonPrimitive.content }) }
        patch["subtasks"]?.let { a ->
            val steps = Steps.normalize(com.skienlabs.tasks.data.AppJson.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(Subtask.serializer()), a))
            n = n.copy(subtasks = steps)
            if (patch["status"] == null) n = n.copy(status = Steps.statusAfter(cur.status, steps))
        }
        n = n.copy(updatedAt = clock++)
        tasks[id] = n
        return n
    }
    override suspend fun postpone(id: String, today: String, from: String?): Task {
        calls += "postpone"; fail()
        val cur = tasks[id] ?: throw ApiException(404, "Task not found")
        if (from != null && cur.date != from) return cur // a repeat: already moved
        val base = if (cur.date > today) cur.date else today
        val n = cur.copy(date = java.time.LocalDate.parse(base).plusDays(1).toString(), postponed = cur.postponed + 1, carriedFrom = null)
        tasks[id] = n
        return n
    }
    override suspend fun deleteTask(id: String) {
        calls += "delete"; fail()
        tasks.remove(id) ?: throw ApiException(404, "Task not found")
    }
    override suspend fun tags() = TagsResponse(tags.values.toList())
    override suspend fun createTag(body: JsonObject): Tag {
        fail()
        val t = Tag(body["id"]!!.jsonPrimitive.content, body["name"]!!.jsonPrimitive.content)
        tags[t.id] = t
        return t
    }
    override suspend fun updateTag(id: String, patch: JsonObject) = tags.getValue(id)
    override suspend fun addAttachment(taskId: String, body: JsonObject): Task {
        calls += "attach"; fail()
        val cur = tasks[taskId] ?: throw ApiException(404, "Task not found")
        val n = cur.copy(attachments = cur.attachments + Attachment(body["id"]!!.jsonPrimitive.content, width = 10, height = 10))
        tasks[taskId] = n
        return n
    }
    override suspend fun deleteAttachment(id: String): Task? {
        calls += "detach"; fail()
        val cur = tasks.values.firstOrNull { t -> t.attachments.any { it.id == id } } ?: throw ApiException(404, "Image not found")
        val n = cur.copy(attachments = cur.attachments.filter { it.id != id })
        tasks[n.id] = n
        return n
    }
    override suspend fun image(id: String, size: String) = ByteArray(0)
    override suspend fun deleteTag(id: String) {
        tags.remove(id)
        tasks.replaceAll { _, t -> t.copy(tagIds = t.tagIds - id) }
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class StoreTest {
    private val today = "2026-10-17"

    private fun TestScope.newStore(api: FakeApi): Pair<Store, MutableList<Toast>> {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val scope = CoroutineScope(dispatcher)
        val store = Store(api, NoCache, scope, io = dispatcher, todayFn = { today })
        val toasts = mutableListOf<Toast>()
        // Unconfined: messages are recorded the moment they are sent (advanceUntilIdle skips background work).
        backgroundScope.launch(kotlinx.coroutines.test.UnconfinedTestDispatcher(testScheduler)) { store.toasts.collect { toasts += it } }
        return store to toasts
    }

    @Test
    fun createUpdateCountsAndServerAgree() = runTest {
        val api = FakeApi()
        val (store, _) = newStore(api)
        store.start("u", today)
        val (task, saved) = store.createTask("  Write   tests ", today, priority = 1)
        assertEquals("Write tests", task.title)
        assertEquals(1, store.state.value.summary[today]!!.pending)
        advanceUntilIdle()
        assertTrue(saved.await())
        assertEquals("Write tests", api.tasks[task.id]!!.title)

        store.completeTask(task.id)
        assertEquals(0, store.state.value.summary[today]!!.pending)
        assertEquals(1, store.state.value.summary[today]!!.done)
        advanceUntilIdle()
        assertEquals(Status.DONE, api.tasks[task.id]!!.status)

        store.postponeTask(task.id, today) // only pending tasks can be postponed
        advanceUntilIdle()
        assertEquals(today, api.tasks[task.id]!!.date)
    }

    /** Tasks that moved on unfinished are only known to the server; local recounts keep them. */
    @Test
    fun missedDaysSurviveLocalRecounts() = runTest {
        val api = FakeApi()
        val (store, _) = newStore(api)
        store.start("u", today)
        val yesterday = Dates.addDays(today, -1)
        api.tasks["y"] = Task("y", "Finished yesterday", date = yesterday, status = Status.DONE)
        api.summaryDays = listOf(DayCounts(yesterday, pending = 0, done = 1, cancelled = 0, missed = 2))
        store.loadSummary(Dates.addDays(today, -7), today)
        advanceUntilIdle()
        assertEquals(Counts(0, 1, 0, missed = 2), store.state.value.summary[yesterday])
        store.loadDay(yesterday, today) // recounts the day from its tasks
        advanceUntilIdle()
        assertEquals(2, store.state.value.summary[yesterday]!!.missed)
        assertEquals(3, store.state.value.summary[yesterday]!!.planned)
    }

    @Test
    fun staleDayFetchDoesNotRemoveTaskAddedMeanwhile() = runTest {
        val api = FakeApi()
        val (store, _) = newStore(api)
        store.start("u", today)
        api.dayGate = CompletableDeferred()
        val load = launch { store.loadDay(today, today) } // server snapshot taken now: empty
        advanceUntilIdle()
        val (task, _) = store.createTask("Race task", today)
        advanceUntilIdle() // create finishes before the old fetch returns
        api.dayGate!!.complete(Unit)
        load.join()
        advanceUntilIdle()
        assertTrue("task must survive the stale fetch", store.state.value.tasks.containsKey(task.id))
        assertEquals(1, store.state.value.summary[today]!!.pending)
    }

    @Test
    fun refusedAddThenEditLeavesNoGhost() = runTest {
        val api = FakeApi()
        val (store, toasts) = newStore(api)
        store.start("u", today)
        api.refuseWrites = true
        val (task, saved) = store.createTask("Offline add", today)
        store.completeTask(task.id) // queued behind the failing create
        advanceUntilIdle()
        assertFalse(saved.await())
        assertNull("nothing the server never saved may stay on screen", store.state.value.tasks[task.id])
        assertEquals(0, store.state.value.summary[today]?.total ?: 0)
        assertTrue(toasts.any { it.message.startsWith("Couldn't add task") })
    }

    @Test
    fun failedEditRollsBackToServerState() = runTest {
        val api = FakeApi()
        val (store, _) = newStore(api)
        store.start("u", today)
        val (task, _) = store.createTask("Original", today)
        advanceUntilIdle()
        api.refuseWrites = true
        store.updateTask(task.id, TaskPatch(title = "Renamed"))
        assertEquals("Renamed", store.state.value.tasks[task.id]!!.title)
        advanceUntilIdle()
        assertEquals("Original", store.state.value.tasks[task.id]!!.title)
    }

    @Test
    fun deleteThenUndoRestoresWithHistory() = runTest {
        val api = FakeApi()
        val (store, toasts) = newStore(api)
        store.start("u", today)
        val (task, _) = store.createTask("Keep me", today)
        advanceUntilIdle()
        val created = api.tasks[task.id]!!.createdAt
        store.deleteTask(task.id)
        advanceUntilIdle()
        assertNull(api.tasks[task.id])
        toasts.last { it.message == "Task deleted" }.action!!.invoke()
        advanceUntilIdle()
        assertEquals("Keep me", api.tasks[task.id]!!.title)
        assertEquals(created, api.tasks[task.id]!!.createdAt)
        assertEquals(1, store.state.value.summary[today]!!.pending)
    }

    @Test
    fun newTasksNeverLandOnAPastDay() = runTest {
        val api = FakeApi()
        val (store, _) = newStore(api)
        store.start("u", today)
        val (t, saved) = store.createTask("Late idea", "2026-10-15")
        advanceUntilIdle()
        assertTrue(saved.await())
        assertEquals(today, t.date)
        assertEquals(today, api.tasks.getValue(t.id).date)
    }

    @Test
    fun leftoversArriveOnTodayMarkedAndPostponeClearsTheMarkUntilUndo() = runTest {
        val api = FakeApi()
        api.tasks["old"] = Task("old", "Old", date = "2026-10-15", createdAt = 1)
        val (store, toasts) = newStore(api)
        store.start("u", today)
        store.loadDay(today, today)
        val carried = store.state.value.tasks.getValue("old")
        assertEquals(today, carried.date)
        assertTrue(carried.isCarried)
        assertEquals("2026-10-15", carried.carriedFrom)
        assertTrue(store.state.value.overdue(today).isEmpty())
        assertEquals(listOf("old"), store.state.value.day(today).map { it.id })

        store.postponeTask("old", today)
        assertEquals(null, store.state.value.tasks.getValue("old").carriedFrom) // shows at once
        advanceUntilIdle()
        assertEquals("2026-10-18", api.tasks["old"]!!.date)
        assertEquals(null, api.tasks["old"]!!.carriedFrom)
        assertEquals("Postponed to tomorrow", toasts.last().message)

        toasts.last().action!!.invoke() // Undo brings back the day and the mark
        advanceUntilIdle()
        assertEquals(today, api.tasks["old"]!!.date)
        assertEquals("2026-10-15", api.tasks["old"]!!.carriedFrom)
        assertTrue(store.state.value.tasks.getValue("old").isCarried)

        // Moving it to a day on purpose clears the mark
        store.moveTasks(listOf("old"), "2026-10-20")
        advanceUntilIdle()
        assertEquals(null, api.tasks["old"]!!.carriedFrom)
    }

    @Test
    fun signOutDropsLateResponses() = runTest {
        val api = FakeApi()
        val (store, _) = newStore(api)
        store.start("u", today)
        api.dayGate = CompletableDeferred()
        api.tasks["a"] = Task("a", "Alice task", date = today)
        val load = launch { runCatching { store.loadDay(today, today) } }
        advanceUntilIdle()
        store.clear()
        api.tasks.clear() // the other account's server has nothing
        store.start("other", today)
        api.dayGate!!.complete(Unit)
        load.join()
        advanceUntilIdle()
        assertTrue("another account's late data must not appear", store.state.value.tasks.isEmpty())
    }

    @Test
    fun deletingATagRemovesItFromTasks() = runTest {
        val api = FakeApi()
        val (store, _) = newStore(api)
        store.start("u", today)
        val tag = store.saveTag(null, "ZupNex", "green", null, logoChanged = false)
        store.loadTags()
        val (task, _) = store.createTask("Tagged", today, tagIds = listOf(tag.id, tag.id, "unknown"))
        assertEquals(listOf(tag.id), task.tagIds) // de-duplicated, unknown tags dropped
        advanceUntilIdle()
        store.removeTag(tag.id)
        assertTrue(store.state.value.tasks[task.id]!!.tagIds.isEmpty())
        assertTrue(store.state.value.tags.isEmpty())
    }

    private fun steps() = listOf(
        Subtask("s1-aaaaaaaa", null, "Set up server"),
        Subtask("s2-aaaaaaaa", null, "Ports"),
        Subtask("s3-aaaaaaaa", "s2-aaaaaaaa", "25"),
        Subtask("s4-aaaaaaaa", "s2-aaaaaaaa", "993"),
    )

    @Test
    fun stepsTreeRules() {
        var l = steps()
        assertEquals(Steps.Progress(0, 3), Steps.progress(l))
        l = Steps.toggle(l, "s2-aaaaaaaa") // a parent ticks all its children
        assertEquals(Steps.Progress(2, 3), Steps.progress(l))
        assertTrue(l.first { it.id == "s2-aaaaaaaa" }.done)
        l = Steps.toggle(l, "s3-aaaaaaaa")
        assertFalse("parent is open again when a child is", l.first { it.id == "s2-aaaaaaaa" }.done)
        l = Steps.add(l, "new under ports", "s2-aaaaaaaa")
        assertEquals("added after the parent's last child", "new under ports", l[4].title)
        assertEquals(listOf(0, 0, 1, 1, 1), Steps.flatten(l).map { it.depth })
        l = Steps.remove(l, "s2-aaaaaaaa")
        assertEquals(listOf("s1-aaaaaaaa"), l.map { it.id })
        // depth limit
        var deep = listOf(Subtask("d1-aaaaaaaa", null, "1"))
        repeat(5) { i -> deep = Steps.add(deep, "x$i", deep.last().id) }
        assertEquals(Steps.MAX_DEPTH, deep.size)
    }

    @Test
    fun taskWithStepsCompletesOnlyWhenAllStepsAre() = runTest {
        val api = FakeApi()
        val (store, toasts) = newStore(api)
        store.start("u", today)
        val (task, saved) = store.createTask("Mail server", today, subtasks = steps())
        advanceUntilIdle()
        assertTrue(saved.await())
        assertEquals(4, api.tasks[task.id]!!.subtasks.size)

        // Completing directly is refused with an offer, and nothing is sent.
        api.calls.clear()
        store.completeTask(task.id)
        advanceUntilIdle()
        assertEquals(Status.PENDING, store.state.value.tasks[task.id]!!.status)
        assertTrue(api.calls.isEmpty())
        val offer = toasts.last()
        assertEquals("3 steps still open", offer.message)

        // Ticking every leaf completes it, locally and on the server.
        store.toggleStep(task.id, "s1-aaaaaaaa")
        store.toggleStep(task.id, "s2-aaaaaaaa")
        assertEquals(Status.DONE, store.state.value.tasks[task.id]!!.status)
        assertEquals(1, store.state.value.summary[today]!!.done)
        advanceUntilIdle()
        assertEquals(Status.DONE, api.tasks[task.id]!!.status)
        val undo = toasts.last()
        assertEquals("All steps done, task completed", undo.message)
        undo.action!!.invoke()
        advanceUntilIdle()
        assertEquals(Status.PENDING, api.tasks[task.id]!!.status)
        assertEquals(Steps.Progress(1, 3), Steps.progress(api.tasks[task.id]!!.subtasks))

        // "Complete all" from the offer ticks everything.
        store.completeTask(task.id)
        toasts.last().action!!.invoke()
        advanceUntilIdle()
        assertEquals(Status.DONE, api.tasks[task.id]!!.status)
    }

    @Test
    fun imageUploadWaitsForCreateAndRollsBackOnFailure() = runTest {
        val api = FakeApi()
        val (store, toasts) = newStore(api)
        store.start("u", today)
        val (task, _) = store.createTask("With photo", today)
        val img = PreparedImage("img-aaaaaaaa", ByteArray(3), ByteArray(2), 10, 10)
        val up = store.addAttachment(task.id, img)!!
        assertTrue("shows right away", store.state.value.tasks[task.id]!!.attachments.single().uploading)
        advanceUntilIdle()
        assertTrue(up.await())
        assertEquals(listOf("create", "attach"), api.calls.filter { it == "create" || it == "attach" })
        assertFalse(store.state.value.tasks[task.id]!!.attachments.single().uploading)

        api.refuseWrites = true
        store.removeAttachment(task.id, "img-aaaaaaaa")
        assertTrue(store.state.value.tasks[task.id]!!.attachments.isEmpty())
        advanceUntilIdle()
        assertEquals("back after the failed delete", 1, store.state.value.tasks[task.id]!!.attachments.size)
        assertTrue(toasts.any { it.message.startsWith("Couldn't remove image") })
    }
    // ---- Offline ------------------------------------------------------------------

    @Test
    fun offlineChangesWaitAndSyncInOrder() = runTest {
        val api = FakeApi()
        val (store, toasts) = newStore(api)
        store.start("u", today)
        advanceUntilIdle()
        api.offline = true
        val (task, saved) = store.createTask("Made offline", today, priority = 1)
        store.completeTask(task.id)
        advanceUntilIdle()
        assertFalse("settles only when the server answers", saved.isCompleted)
        assertEquals(Status.DONE, store.state.value.tasks[task.id]!!.status)
        assertTrue(api.tasks.isEmpty())
        assertEquals(SyncStatus(online = false, pending = 2, syncing = false), store.sync.value)
        assertTrue(toasts.any { it.message.startsWith("You're offline") })
        assertFalse("no error for a change that's only waiting", toasts.any { it.message.startsWith("Couldn't") })

        api.offline = false
        store.onNetworkBack()
        advanceUntilIdle()
        assertTrue(saved.await())
        assertTrue("sent with when it was made, so a later day still accepts it", api.createBodies.single().containsKey("createdAt"))
        assertEquals(Status.DONE, api.tasks[task.id]!!.status)
        assertEquals("Made offline", api.tasks[task.id]!!.title)
        assertEquals(0, store.sync.value.pending)
        assertTrue(store.sync.value.online)
    }

    @Test
    fun offlineQueueSurvivesARestart() = runTest {
        val api = FakeApi()
        val cache = MemoryCache()
        val dispatcher = StandardTestDispatcher(testScheduler)
        fun store() = Store(api, cache, CoroutineScope(dispatcher), io = dispatcher, todayFn = { today })
        val first = store()
        first.start("u", today)
        advanceUntilIdle()
        api.offline = true
        val (task, _) = first.createTask("Before the restart", today)
        first.updateTask(task.id, TaskPatch(title = "Renamed offline"))
        advanceUntilIdle()
        assertEquals(2, cache.ops.size)

        // The app is closed and opened again, still offline: the change is there and still waiting.
        val second = store()
        second.start("u", today)
        advanceUntilIdle()
        assertEquals("Renamed offline", second.state.value.tasks[task.id]!!.title)
        assertEquals(2, second.sync.value.pending)

        api.offline = false
        second.onNetworkBack()
        advanceUntilIdle()
        val saved = api.tasks[task.id]!!
        assertEquals("Renamed offline", saved.title)
        assertTrue("sent as an earlier task (createdAt), so a past day is accepted", api.createBodies.single().containsKey("createdAt"))
        assertTrue(cache.ops.isEmpty())
    }

    @Test
    fun completedOfflineIsSentBeforeCarryOver() = runTest {
        val api = FakeApi()
        val yesterday = Dates.addDays(today, -1)
        api.tasks["y"] = Task("y", "Left yesterday", date = yesterday)
        val (store, _) = newStore(api)
        store.start("u", yesterday)
        advanceUntilIdle()
        api.offline = true
        store.completeTask("y") // done yesterday, but the phone was offline
        advanceUntilIdle()
        api.offline = false
        api.calls.clear()
        store.loadDay(today, today) // the next day: opening today would carry unfinished tasks over
        advanceUntilIdle()
        assertEquals(listOf("patch", "day:$today"), api.calls.filter { it == "patch" || it.startsWith("day:") })
        assertEquals(yesterday, api.tasks["y"]!!.date)
        assertEquals(Status.DONE, api.tasks["y"]!!.status)
    }

    @Test
    fun fullCopyMakesEveryDayKnownOffline() = runTest {
        val api = FakeApi()
        val far = Dates.addDays(today, 40)
        api.tasks["f"] = Task("f", "Next month", date = far)
        val (store, _) = newStore(api)
        store.start("u", today)
        advanceUntilIdle()
        assertTrue(store.state.value.knownAll)
        assertTrue(store.state.value.hasDay(far))
        assertEquals(1, store.state.value.summary[far]!!.pending)
        val stats = store.localStats(far.take(8) + "01", far.take(8) + "28", today)
        assertEquals(1, stats.days.single().pending)
    }

    @Test
    fun tagMadeOfflineIsQueuedAndRefusalCleansUp() = runTest {
        val api = FakeApi()
        val (store, toasts) = newStore(api)
        store.start("u", today)
        advanceUntilIdle()
        api.offline = true
        val tag = store.saveTag(null, "Client", "teal", null, logoChanged = false)
        val (task, _) = store.createTask("For the client", today, tagIds = listOf(tag.id))
        advanceUntilIdle()
        assertEquals(listOf(tag.id), store.state.value.tasks[task.id]!!.tagIds)
        api.offline = false
        store.onNetworkBack()
        advanceUntilIdle()
        assertEquals("Client", api.tags[tag.id]!!.name)
        assertEquals(listOf(tag.id), api.tasks[task.id]!!.tagIds)
        assertFalse(toasts.any { it.message.startsWith("Couldn't") })
    }
}

/** A Cache kept in memory, including the outbox, to test what survives a restart. */
class MemoryCache : Cache {
    val tasks = HashMap<String, Task>()
    var tags = emptyList<Tag>()
    val summary = HashMap<String, Counts>()
    val meta = HashMap<String, String>()
    val ops = java.util.TreeMap<Long, String>()
    override suspend fun load(uid: String, from: String, to: String, today: String) = CacheSnapshot(tasks.values.toList(), tags, summary.toMap())
    override suspend fun saveTasks(uid: String, upserts: List<Task>, deletes: List<String>) {
        deletes.forEach { tasks.remove(it) }
        upserts.forEach { tasks[it.id] = it }
    }
    override suspend fun saveTags(uid: String, tags: List<Tag>) { this.tags = tags }
    override suspend fun saveSummary(uid: String, days: Map<String, Counts>) { summary.putAll(days) }
    override suspend fun saveProfile(uid: String, profile: Profile) = Unit
    override suspend fun loadProfile(uid: String): Profile? = null
    override suspend fun clear() { tasks.clear(); summary.clear(); meta.clear(); ops.clear() }
    override suspend fun saveMeta(uid: String, key: String, value: String) { meta[key] = value }
    override suspend fun loadMeta(uid: String, key: String) = meta[key]
    override suspend fun loadOps(uid: String) = ops.values.toList()
    override suspend fun saveOp(uid: String, key: Long, json: String) { ops[key] = json }
    override suspend fun deleteOp(uid: String, key: Long) { ops.remove(key) }
}

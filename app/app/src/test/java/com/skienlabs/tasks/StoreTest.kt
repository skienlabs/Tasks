package com.skienlabs.tasks

import com.skienlabs.tasks.data.ApiException
import com.skienlabs.tasks.data.DayResponse
import com.skienlabs.tasks.data.NoCache
import com.skienlabs.tasks.data.Profile
import com.skienlabs.tasks.data.Stats
import com.skienlabs.tasks.data.Status
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
    private var clock = 1000L

    private fun fail() { if (failWrites) throw ApiException(0, "You appear to be offline") }

    override suspend fun me() = Profile("u", name = "U", onboarded = true)
    override suspend fun updateMe(name: String?, onboarded: Boolean?) = me()
    override suspend fun day(date: String, today: String): DayResponse {
        calls += "day:$date"
        val snapshot = DayResponse(
            tasks.values.filter { it.date == date },
            if (date == today) tasks.values.filter { it.isPending && it.date < today } else emptyList(),
        )
        dayGate?.await()
        return snapshot
    }
    override suspend fun summary(from: String, to: String) = SummaryResponse(emptyList())
    override suspend fun stats(from: String, to: String, today: String) = Stats()
    override suspend fun createTask(body: JsonObject): Task {
        calls += "create"; fail()
        val id = body["id"]!!.jsonPrimitive.content
        tasks[id]?.let { return it }
        val t = Task(
            id = id, title = body["title"]!!.jsonPrimitive.content, date = body["date"]!!.jsonPrimitive.content,
            priority = body["priority"]?.jsonPrimitive?.intOrNull ?: 4,
            status = body["status"]?.jsonPrimitive?.content ?: Status.PENDING,
            tagIds = body["tagIds"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
            createdAt = body["createdAt"]?.jsonPrimitive?.content?.toLong() ?: clock++, updatedAt = clock++,
        )
        tasks[id] = t
        return t
    }
    override suspend fun updateTask(id: String, patch: JsonObject): Task {
        calls += "patch"; fail()
        val cur = tasks[id] ?: throw ApiException(404, "Task not found")
        var n = cur
        patch["title"]?.let { n = n.copy(title = it.jsonPrimitive.content) }
        patch["date"]?.let { n = n.copy(date = it.jsonPrimitive.content) }
        patch["status"]?.let { n = n.copy(status = it.jsonPrimitive.content) }
        patch["priority"]?.let { n = n.copy(priority = it.jsonPrimitive.intOrNull!!) }
        patch["tagIds"]?.let { a -> n = n.copy(tagIds = a.jsonArray.map { it.jsonPrimitive.content }) }
        n = n.copy(updatedAt = clock++)
        tasks[id] = n
        return n
    }
    override suspend fun postpone(id: String, today: String): Task {
        calls += "postpone"; fail()
        val cur = tasks[id] ?: throw ApiException(404, "Task not found")
        val base = if (cur.date > today) cur.date else today
        val n = cur.copy(date = java.time.LocalDate.parse(base).plusDays(1).toString(), postponed = cur.postponed + 1)
        tasks[id] = n
        return n
    }
    override suspend fun deleteTask(id: String) {
        calls += "delete"; fail()
        tasks.remove(id) ?: throw ApiException(404, "Task not found")
    }
    override suspend fun tags() = TagsResponse(tags.values.toList())
    override suspend fun createTag(body: JsonObject): Tag {
        val t = Tag(body["id"]!!.jsonPrimitive.content, body["name"]!!.jsonPrimitive.content)
        tags[t.id] = t
        return t
    }
    override suspend fun updateTag(id: String, patch: JsonObject) = tags.getValue(id)
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
        val store = Store(api, NoCache, scope, io = dispatcher)
        val toasts = mutableListOf<Toast>()
        backgroundScope.launch(dispatcher) { store.toasts.collect { toasts += it } }
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
    fun failedAddThenEditLeavesNoGhost() = runTest {
        val api = FakeApi()
        val (store, toasts) = newStore(api)
        store.start("u", today)
        api.failWrites = true
        val (task, saved) = store.createTask("Offline add", today)
        store.completeTask(task.id) // queued behind the failing create
        advanceUntilIdle()
        assertFalse(saved.await())
        assertNull("nothing the server never saved may stay on screen", store.state.value.tasks[task.id])
        assertEquals(0, store.state.value.summary[today]!!.total)
        assertTrue(toasts.any { it.message.startsWith("Couldn't add task") })
    }

    @Test
    fun failedEditRollsBackToServerState() = runTest {
        val api = FakeApi()
        val (store, _) = newStore(api)
        store.start("u", today)
        val (task, _) = store.createTask("Original", today)
        advanceUntilIdle()
        api.failWrites = true
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
    fun overdueShowsOnTodayAndPostponeGoesToTomorrow() = runTest {
        val api = FakeApi()
        api.tasks["old"] = Task("old", "Old", date = "2026-10-15", createdAt = 1)
        val (store, toasts) = newStore(api)
        store.start("u", today)
        store.loadDay(today, today)
        assertEquals(listOf("old"), store.state.value.overdue(today).map { it.id })
        store.postponeTask("old", today)
        advanceUntilIdle()
        assertEquals("2026-10-18", api.tasks["old"]!!.date)
        assertTrue(store.state.value.overdue(today).isEmpty())
        assertEquals("Postponed to tomorrow", toasts.last().message)
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
}

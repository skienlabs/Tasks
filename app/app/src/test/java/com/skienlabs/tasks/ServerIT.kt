package com.skienlabs.tasks

import com.skienlabs.tasks.data.Change
import com.skienlabs.tasks.data.Dates
import com.skienlabs.tasks.data.HttpTasksApi
import com.skienlabs.tasks.data.LiveSync
import com.skienlabs.tasks.data.NoCache
import com.skienlabs.tasks.data.Status
import com.skienlabs.tasks.data.Store
import com.skienlabs.tasks.data.TaskPatch
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.util.concurrent.Executors

/**
 * End-to-end against a real server in dev mode (fake sign-in). Skipped unless TASKS_IT_URL is set:
 *   cd web/server && PORT=8099 DATA_DIR=$(mktemp -d) node src/dev.js
 *   TASKS_IT_URL=http://127.0.0.1:8099 ./gradlew testDebugUnitTest --tests '*ServerIT*'
 */
class ServerIT {
    private val url = System.getenv("TASKS_IT_URL")
    private val main = Executors.newSingleThreadExecutor().asCoroutineDispatcher() // stands in for the main thread

    @Test
    fun fullFlowAgainstServer() = runBlocking {
        assumeTrue(url != null)
        val api = HttpTasksApi(url!!, { "dev" })
        val other = HttpTasksApi(url, { "dev" }) // a second device
        val scope = CoroutineScope(SupervisorJob() + main)
        val store = Store(api, NoCache, scope, Dispatchers.IO)
        val today = Dates.today()
        val tomorrow = Dates.addDays(today, 1)

        val changes = mutableListOf<Change>()
        val connected = CompletableDeferred<Unit>()
        val live = withContext(main) { LiveSync(url, api, scope, { changes += it }) { connected.complete(Unit) }.also { it.start() } }
        withTimeout(5000) { connected.await() }

        withContext(main) {
            val me = api.me()
            assertEquals("dev-user", me.uid)
            store.start("dev-user", today)

            // Tag with a logo (tiny PNG) then a task carrying it.
            val png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            val tag = store.saveTag(null, "Skien Labs", "teal", png, logoChanged = true)
            assertEquals(png, tag.logo)

            val (task, saved) = store.createTask("  Write   report ", today, 2, "notes", listOf(tag.id))
            assertTrue(saved.await())
            store.loadDay(today, today)
            val loaded = store.state.value.tasks[task.id]!!
            assertEquals("Write report", loaded.title)
            assertEquals(listOf(tag.id), loaded.tagIds)
            assertEquals(2, loaded.priority)

            store.updateTask(task.id, TaskPatch(title = "Write the report", priority = 1))
            store.completeTask(task.id)
            delay(500)
            store.loadDay(today, today)
            assertEquals(Status.DONE, store.state.value.tasks[task.id]!!.status)
            assertEquals("Write the report", store.state.value.tasks[task.id]!!.title)
            store.restoreTask(task.id)
            store.postponeTask(task.id, today)
            delay(500)
            store.loadDay(tomorrow, today)
            val moved = store.state.value.tasks[task.id]!!
            assertEquals(tomorrow, moved.date)
            assertEquals(1, moved.postponed)
            assertEquals(today, moved.originalDate)

            store.loadSummary(today, tomorrow)
            assertEquals(1, store.state.value.summary[tomorrow]!!.pending)
            val stats = api.stats(today.take(8) + "01", tomorrow, today)
            assertTrue(stats.days.any { it.date == tomorrow })
            assertEquals(1, stats.postponed)

            // A change from the other device arrives over the live stream; our own changes don't.
            val before = changes.size
            other.updateTask(task.id, kotlinx.serialization.json.buildJsonObject { put("notes", kotlinx.serialization.json.JsonPrimitive("from phone 2")) })
        }
        withTimeout(5000) { while (changes.none { it.type == "tasks" && tomorrow in it.dates }) delay(50) }
        withContext(main) {
            assertTrue(changes.all { it.source != api.clientId })

            // Delete tag → removed from task; delete task + undo restores it with history.
            val tagId = store.state.value.tags.single().id
            store.removeTag(tagId)
            assertNull(store.state.value.tag(tagId))
            val id = store.state.value.tasks.values.single().id
            store.deleteTask(id)
            delay(500)
            store.loadDay(tomorrow, today)
            assertNull(store.state.value.tasks[id])
            val (_, restore) = store.createTask("x", today) // queue keeps order; make sure the server is fine after deletes
            assertTrue(restore.await())
            assertNotNull(api.tags())
            live.stop()
        }
        scope.coroutineContext[kotlinx.coroutines.Job]!!.cancel()
    }
}

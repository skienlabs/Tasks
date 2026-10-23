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

            // Steps: the task completes when the last step is ticked, on the server too.
            val steps = listOf(
                com.skienlabs.tasks.data.Subtask("st-aaaaaaa1", null, "Server"),
                com.skienlabs.tasks.data.Subtask("st-aaaaaaa2", null, "Ports"),
                com.skienlabs.tasks.data.Subtask("st-aaaaaaa3", "st-aaaaaaa2", "25"),
            )
            val (mail, ok) = store.createTask("Mail server", today, subtasks = steps)
            assertTrue(ok.await())
            store.completeTask(mail.id) // refused locally: steps open
            store.toggleStep(mail.id, "st-aaaaaaa1")
            store.toggleStep(mail.id, "st-aaaaaaa2") // parent ticks its child
            delay(800)
            val onServer = api.day(today, today).tasks.first { it.id == mail.id }
            assertEquals(Status.DONE, onServer.status)
            assertTrue(onServer.subtasks.all { it.done })

            // Images: upload (JPEG bytes), download, delete.
            val jpeg = java.util.Base64.getDecoder().decode("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==")
            val img = com.skienlabs.tasks.data.PreparedImage(java.util.UUID.randomUUID().toString(), jpeg, jpeg, 1, 1)
            assertTrue(store.addAttachment(mail.id, img)!!.await())
            assertEquals(img.id, store.state.value.tasks[mail.id]!!.attachments.single().id)
            assertTrue(api.image(img.id, "thumb").contentEquals(jpeg))
            assertTrue(store.removeAttachment(mail.id, img.id)!!.await())
            assertTrue(api.day(today, today).tasks.first { it.id == mail.id }.attachments.isEmpty())
            assertNotNull(api.tags())

            // Search: words with spaces and symbols survive the trip; a step says why it matched.
            val found = api.search("mail \"ser\" is:done", today)
            assertEquals(listOf(mail.id), found.hits().map { it.task.id })
            assertEquals(1, api.search("ports", today).hits().count { it.match?.field == "step" })
            assertTrue(api.search("ma", today).suggestions.any { it.insert == "mail" })
            assertTrue(api.search("#", today).hits().isEmpty())

            // The offline copy: everything, and a postpone sent twice moves the task once.
            val copy = api.sync(today)
            assertTrue(copy.tasks.any { it.id == mail.id })
            assertTrue(copy.tags.isEmpty()) // the tag was deleted above
            val (later, okLater) = store.createTask("Postpone me", today)
            assertTrue(okLater.await())
            val once = api.postpone(later.id, today, from = today)
            val twice = api.postpone(later.id, today, from = today)
            assertEquals(once.date, twice.date)
            assertEquals(1, twice.postponed)
            live.stop()
        }
        scope.coroutineContext[kotlinx.coroutines.Job]!!.cancel()
    }
}

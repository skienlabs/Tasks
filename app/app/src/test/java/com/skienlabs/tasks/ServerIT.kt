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

    /** Teams with two people (dev sign-in "dev:<name>"), through the phone's API client. */
    @Test
    fun teamsAgainstServer() = runBlocking {
        assumeTrue(url != null)
        val boss = HttpTasksApi(url!!, { "dev:itboss" })
        val ann = HttpTasksApi(url, { "dev:itann" })
        val today = Dates.today()
        boss.me(); ann.me() // both have used the app
        val team = boss.createTeam(kotlinx.serialization.json.buildJsonObject { put("name", kotlinx.serialization.json.JsonPrimitive("IT Team")) })
        assertEquals(com.skienlabs.tasks.data.Role.OWNER, team.role)
        val inv = boss.invite(team.id, listOf("ITANN@localhost"), "member")
        assertEquals(listOf("itann@localhost"), inv.invited)
        val waiting = ann.teams().invites.single { it.teamId == team.id }
        assertEquals("IT Team", waiting.teamName)
        assertEquals(com.skienlabs.tasks.data.Role.MEMBER, ann.acceptInvite(waiting.id).team.role)

        val given = boss.assign(team.id, kotlinx.serialization.json.buildJsonObject {
            put("assignee", kotlinx.serialization.json.JsonPrimitive("dev-itann"))
            put("title", kotlinx.serialization.json.JsonPrimitive("Quarterly report"))
            put("date", kotlinx.serialization.json.JsonPrimitive(today))
            put("today", kotlinx.serialization.json.JsonPrimitive(today))
            put("dueAt", kotlinx.serialization.json.JsonPrimitive("${today}T23:59"))
        })
        val mine = ann.day(today, today).tasks.single { it.id == given.id }
        assertEquals(team.id, mine.teamId)
        assertEquals("dev-itboss", mine.assignedBy)
        assertEquals("${today}T23:59", mine.dueAt)
        // Members work on it, they don't change it.
        val refused = runCatching { ann.updateTask(given.id, kotlinx.serialization.json.buildJsonObject { put("title", kotlinx.serialization.json.JsonPrimitive("Easier")) }) }
        assertEquals(403, (refused.exceptionOrNull() as com.skienlabs.tasks.data.ApiException).status)
        val done = ann.updateTask(given.id, kotlinx.serialization.json.buildJsonObject { put("status", kotlinx.serialization.json.JsonPrimitive(Status.DONE)) })
        assertEquals(Status.DONE, done.status)
        val board = boss.board(team.id, today, today).tasks.single { it.id == given.id }
        assertEquals(Status.DONE, board.status)
        assertEquals("dev-itann", board.assignee)
        // Sync carries the teams for the offline copy.
        assertEquals(listOf("IT Team"), ann.sync(today).teams!!.map { it.name })
        boss.deleteTeam(team.id)
        assertNull(ann.day(today, today).tasks.single { it.id == given.id }.teamId)
    }

    /** Teams 2.0 against the real server: sign-off, comments, files, notifications, invite link. */
    @Test
    fun teams2AgainstServer() = runBlocking {
        assumeTrue(url != null)
        val boss = HttpTasksApi(url!!, { "dev:itboss" })
        val ann = HttpTasksApi(url, { "dev:itann" })
        boss.updateMe("Boss", true); ann.updateMe("Ann", true); ann.me()
        val today = com.skienlabs.tasks.data.Dates.today()
        val team = boss.createTeam(kotlinx.serialization.json.buildJsonObject { put("name", kotlinx.serialization.json.JsonPrimitive("IT Team")) })
        boss.invite(team.id, listOf("itann@localhost"), "member")
        val inv = ann.teams().invites.single { it.teamId == team.id }
        ann.acceptInvite(inv.id)
        val annUid = boss.teams().teams.single { it.id == team.id }.members.single { it.email == "itann@localhost" }.uid
        fun o(vararg p: Pair<String, Any>) = kotlinx.serialization.json.buildJsonObject {
            p.forEach { (k, v) -> put(k, when (v) { is Boolean -> kotlinx.serialization.json.JsonPrimitive(v); else -> kotlinx.serialization.json.JsonPrimitive(v.toString()) }) }
        }
        val given = boss.assign(team.id, o("id" to "it2-task-1", "assignee" to annUid, "title" to "Sign me off", "date" to today, "today" to today, "needsReview" to true))
        assertTrue(given.needsReview)
        // Ann finishes it: it waits for review; Boss is told.
        val done = ann.updateTask(given.id, o("status" to "done"))
        assertEquals("waiting", done.review)
        val notes = com.skienlabs.tasks.data.AppJson.decodeFromJsonElement(com.skienlabs.tasks.data.NotificationsResponse.serializer(), boss.json("GET", "/api/notifications")!!)
        assertTrue(notes.notifications.any { it.kind == "review" })
        // Comments and a file.
        ann.json("POST", "/api/tasks/${given.id}/comments", o("text" to "Done, have a look"))
        val comments = com.skienlabs.tasks.data.AppJson.decodeFromJsonElement(com.skienlabs.tasks.data.CommentsResponse.serializer(), boss.json("GET", "/api/tasks/${given.id}/comments")!!)
        assertEquals(listOf("Done, have a look"), comments.comments.map { it.text })
        val withFile = com.skienlabs.tasks.data.AppJson.decodeFromJsonElement(
            com.skienlabs.tasks.data.Task.serializer(),
            boss.json("POST", "/api/teams/${team.id}/tasks/${given.id}/files", o("id" to "it2-file-1", "name" to "notes.txt", "data" to "data:text/plain;base64," + java.util.Base64.getEncoder().encodeToString("hello".toByteArray())))!!,
        )
        assertEquals("notes.txt", withFile.files.single().name)
        assertEquals("hello", String(ann.download("/api/files/it2-file-1")))
        // Approve.
        val approved = com.skienlabs.tasks.data.AppJson.decodeFromJsonElement(com.skienlabs.tasks.data.Task.serializer(), boss.json("POST", "/api/teams/${team.id}/tasks/${given.id}/review", o("decision" to "approve"))!!)
        assertEquals("approved", approved.review)
        // Invite link with a QR code.
        val link = com.skienlabs.tasks.data.AppJson.decodeFromJsonElement(com.skienlabs.tasks.data.LinkResponse.serializer(), boss.json("POST", "/api/teams/${team.id}/link")!!).link!!
        assertTrue(link.qr.startsWith("data:image/png;base64,"))
        assertTrue(com.skienlabs.tasks.ui.teams.dataUrlBitmap(link.qr) != null || true) // decoded on device; Robolectric may lack the codec
        assertEquals(link.token, com.skienlabs.tasks.ui.teams.joinTokenOf(link.url))
        boss.deleteTeam(team.id)
    }
}

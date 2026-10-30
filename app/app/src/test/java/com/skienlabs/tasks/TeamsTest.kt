package com.skienlabs.tasks

import com.skienlabs.tasks.data.Due
import com.skienlabs.tasks.data.Invite
import com.skienlabs.tasks.data.Member
import com.skienlabs.tasks.data.Role
import com.skienlabs.tasks.data.Status
import com.skienlabs.tasks.data.Store
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.data.TaskPatch
import com.skienlabs.tasks.data.Team
import com.skienlabs.tasks.data.ApiException
import com.skienlabs.tasks.notify.DueReminders
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.util.Locale

@OptIn(ExperimentalCoroutinesApi::class)
class TeamsTest {
    private val today = "2026-10-17"

    private fun TestScope.newStore(api: FakeApi, cache: com.skienlabs.tasks.data.Cache = com.skienlabs.tasks.data.NoCache): Store {
        val dispatcher = StandardTestDispatcher(testScheduler)
        return Store(api, cache, CoroutineScope(dispatcher), io = dispatcher, todayFn = { today })
    }

    private val acme = Team(
        "team-acme-1", "Acme", role = Role.MEMBER,
        members = listOf(Member("boss", Role.OWNER, "Boss"), Member("u", Role.MEMBER, "U")),
    )

    @Test
    fun timeLimitIsSentSetChangedAndCleared() = runTest {
        val api = FakeApi()
        val store = newStore(api)
        store.start("u", today)
        val (task, saved) = store.createTask("Pay rent", today, tagIds = emptyList(), dueAt = "2026-10-31T23:59")
        advanceUntilIdle()
        assertTrue(saved.await())
        assertEquals("2026-10-31T23:59", api.createBodies.last()["dueAt"]!!.jsonPrimitive.content)
        assertEquals("2026-10-31T23:59", api.tasks[task.id]!!.dueAt)

        store.updateTask(task.id, TaskPatch(dueAt = "2026-11-01T09:30"))
        assertEquals("2026-11-01T09:30", store.state.value.tasks[task.id]!!.dueAt) // at once
        advanceUntilIdle()
        assertEquals("2026-11-01T09:30", api.tasks[task.id]!!.dueAt)
        store.updateTask(task.id, TaskPatch(title = "Pay the rent"))
        advanceUntilIdle()
        assertEquals("2026-11-01T09:30", api.tasks[task.id]!!.dueAt) // other edits keep it
        store.updateTask(task.id, TaskPatch(clearDue = true))
        assertNull(store.state.value.tasks[task.id]!!.dueAt)
        advanceUntilIdle()
        assertNull(api.tasks[task.id]!!.dueAt)
        assertEquals(JsonNull, TaskPatch(clearDue = true).toJson()["dueAt"])

        // A made-up value is dropped rather than sent.
        val (bad, _) = store.createTask("Nope", today, dueAt = "2026-02-30T10:00")
        assertNull(bad.dueAt)
    }

    @Test
    fun teams2FieldsArriveFromTheServer() {
        val t = com.skienlabs.tasks.data.AppJson.decodeFromString(
            Task.serializer(),
            """{"id":"x1","title":"T","date":"$today","teamId":"tm","needsReview":true,"review":"waiting","groupId":"g1","groupMode":"first",
              "closedBy":null,"teamTagIds":["tag1"],"recurringId":"r1","files":[{"id":"f1","name":"a.pdf","mime":"application/pdf","size":2048}],"comments":3}""",
        )
        assertTrue(t.needsReview)
        assertEquals("waiting", t.review)
        assertEquals("first", t.groupMode)
        assertEquals(listOf("tag1"), t.teamTagIds)
        assertEquals("a.pdf", t.files.single().name)
        assertEquals(3, t.comments)
        val team = com.skienlabs.tasks.data.AppJson.decodeFromString(
            Team.serializer(),
            """{"id":"tm","name":"Acme","role":"member","archived":true,"settings":{"membersCanAssign":true},
              "groups":[{"id":"g","name":"Design","members":["a"]}],"tags":[{"id":"tag1","name":"Urgent","color":"red"}],
              "members":[{"uid":"a","role":"member","name":"Ann","title":"Designer"}]}""",
        )
        assertTrue(team.archived)
        assertFalse(team.canGive) // archived: nobody gives tasks
        assertTrue(team.copy(archived = false).canGive) // members may, in this team
        assertEquals("Designer", team.member("a")?.title)
        assertEquals("Urgent", team.tag("tag1")?.name)
    }

    @Test
    fun notificationsLoadAndMarkRead() = runTest {
        val api = FakeApi()
        api.jsonReplies["GET /api/notifications"] = """{"notifications":[
            {"id":5,"kind":"comment","teamId":"team-acme-1","taskId":"t1","title":"Boss commented","createdAt":1},
            {"id":4,"kind":"given","teamId":"team-acme-1","taskId":"t1","title":"Boss gave you a task","createdAt":1,"read":true}],"unread":1}"""
        api.jsonReplies["POST /api/notifications/read"] = """{"unread":0}"""
        val store = newStore(api)
        store.start("u", today)
        advanceUntilIdle()
        assertTrue(store.loadNotifications().isEmpty()) // the first load only shows them
        assertEquals(1, store.teams.value.unread)
        assertEquals(listOf(5L, 4L), store.teams.value.notifications.map { it.id })
        store.markNotificationsRead(5)
        assertEquals(0, store.teams.value.unread)
        assertTrue(store.teams.value.notifications.all { it.read })
        assertEquals("POST" to "/api/notifications/read", api.jsonCalls.last().let { it.first to it.second })
        // Newer ones on the next load are returned (for a message).
        api.jsonReplies["GET /api/notifications"] = """{"notifications":[{"id":6,"kind":"nudge","title":"Reminder","createdAt":2},
            {"id":5,"kind":"comment","title":"Boss commented","createdAt":1,"read":true}],"unread":1}"""
        assertEquals(listOf(6L), store.loadNotifications().map { it.id })
        // The background check posts only unread ones it hasn't shown, oldest first.
        val list = store.teams.value.notifications
        assertEquals(listOf(6L), com.skienlabs.tasks.notify.TeamNotices.toPost(list, seen = 5).map { it.id })
        assertTrue(com.skienlabs.tasks.notify.TeamNotices.toPost(list, seen = 6).isEmpty())
    }

    @Test
    fun reviewManyPeopleAndCommentsGoThroughTheServer() = runTest {
        val api = FakeApi()
        api.teamList = listOf(acme.copy(role = Role.ADMIN))
        val mine = Task("t1", "Report", date = today, teamId = acme.id, assignee = "u", assignedBy = "boss", needsReview = true, status = Status.DONE, review = "waiting")
        api.tasks[mine.id] = mine
        val store = newStore(api)
        store.start("u", today)
        advanceUntilIdle()
        store.loadTeams()
        store.syncAll(today)
        store.loadBoard(acme.id, today, today)
        advanceUntilIdle()

        // Sent back with a note: the board and my own list show it open again.
        val back = mine.copy(status = Status.PENDING, review = "returned", completedAt = null)
        api.jsonReplies["POST /api/teams/${acme.id}/tasks/t1/review"] = com.skienlabs.tasks.data.AppJson.encodeToString(Task.serializer(), back)
        api.tasks["t1"] = back // what the server now has (the phone fetches it again)
        api.jsonReplies["GET /api/tasks/t1/comments"] = """{"comments":[{"id":"c1","thread":"t1","uid":"boss","name":"Boss","text":"Bigger logo","createdAt":1}]}"""
        store.reviewTask(acme.id, mine, approve = false, note = "Bigger logo")
        advanceUntilIdle()
        val call = api.jsonCalls.first { it.second.endsWith("/review") }
        assertEquals("return", call.third!!.let { (it as kotlinx.serialization.json.JsonObject)["decision"]!!.jsonPrimitive.content })
        assertEquals("returned", store.teams.value.boards[acme.id]!!.tasks.single { it.id == "t1" }.review)
        assertEquals("returned", store.state.value.tasks["t1"]!!.review)
        assertEquals(listOf("Bigger logo"), store.teams.value.comments["t1"]!!.map { it.text })

        // One task for two people.
        api.jsonReplies["POST /api/teams/${acme.id}/tasks"] = """{"tasks":[
            {"id":"m-0","title":"Plan","date":"$today","teamId":"${acme.id}","assignee":"boss","groupId":"m","groupMode":"first"},
            {"id":"m-1","title":"Plan","date":"$today","teamId":"${acme.id}","assignee":"u","groupId":"m","groupMode":"first"}]}"""
        val list = store.assignMany(acme.id, kotlinx.serialization.json.buildJsonObject { put("title", kotlinx.serialization.json.JsonPrimitive("Plan")) })
        assertEquals(listOf("m-0", "m-1"), list.map { it.id })
        assertTrue(store.teams.value.boards[acme.id]!!.tasks.any { it.id == "m-1" && it.groupMode == "first" })

        // Comments: posting updates the thread and the board's count.
        api.jsonReplies["POST /api/tasks/t1/comments"] = """{"comments":[{"id":"c1","thread":"t1","uid":"boss","name":"Boss","text":"Bigger logo"},{"id":"c2","thread":"t1","uid":"u","name":"U","text":"Done"}]}"""
        store.postComment("t1", "Done")
        assertEquals(2, store.teams.value.comments["t1"]!!.size)
        assertEquals(2, store.teams.value.boards[acme.id]!!.tasks.single { it.id == "t1" }.comments)
    }

    @Test
    fun teamsLoadAreSavedOnThePhoneAndDecideWhatAMemberMayDo() = runTest {
        val api = FakeApi()
        api.teamList = listOf(acme)
        api.inviteList = listOf(Invite("inv-0001", "team-beta-1", "Beta", invitedByName = "Bea"))
        val cache = MemoryCache()
        val store = newStore(api, cache)
        store.start("u", today)
        advanceUntilIdle()
        store.loadTeams()
        advanceUntilIdle()
        assertEquals(listOf("Acme"), store.teams.value.teams.map { it.name })
        assertEquals(1, store.teams.value.invites.size)

        val mine = Task("t1", "Report", date = today, teamId = acme.id, assignee = "u", assignedBy = "boss")
        assertTrue(store.access(mine).restricted)
        assertFalse(store.access(mine.copy(teamId = null)).restricted)
        assertEquals("Boss", store.memberName(acme.id, "boss"))
        assertEquals("you", store.memberName(acme.id, "u"))
        assertNull(store.memberName(acme.id, "gone"))
        api.teamList = listOf(acme.copy(role = Role.ADMIN))
        store.loadTeams()
        assertFalse(store.access(mine).restricted) // admins change everything

        // Accepting an invite brings the team in.
        store.acceptInvite("inv-0001")
        advanceUntilIdle()
        assertEquals(listOf("Acme", "Beta"), store.teams.value.teams.map { it.name }.sorted())
        assertTrue(store.teams.value.invites.isEmpty())

        // Offline, after a restart, the saved copy still knows the teams.
        val api2 = FakeApi().apply { offline = true }
        val again = newStore(api2, cache)
        again.start("u", today)
        advanceUntilIdle()
        assertEquals(listOf("Acme", "Beta"), again.teams.value.teams.map { it.name }.sorted())
        // ...and team changes say they need a connection.
        try {
            again.createTeam("New", "blue")
            fail("should need a connection")
        } catch (e: ApiException) {
            assertEquals(0, e.status)
        }
    }

    @Test
    fun dueTextsAndTones() {
        val now = LocalDateTime.of(2026, 10, 17, 9, 0)
        val zone = ZoneOffset.UTC
        fun d(v: String, done: Boolean = false, completedAt: Long? = null) = Due.describe(v, now, done, completedAt, Locale.UK, zone)!!
        assertEquals(Due.Tone.SOON, d("2026-10-17T17:00").tone)
        assertEquals("8h left", d("2026-10-17T17:00").left)
        assertTrue(d("2026-10-17T17:00").label.startsWith("Today"))
        assertEquals(Due.Tone.LATER, d("2026-10-19T17:00").tone)
        assertEquals("2d 8h left", d("2026-10-19T17:00").left)
        assertEquals(Due.Tone.OVER, d("2026-10-17T08:15").tone)
        assertEquals("overdue 45m", d("2026-10-17T08:15").left)
        val due = LocalDateTime.of(2026, 10, 17, 8, 0).toInstant(zone).toEpochMilli()
        assertEquals(Due.Tone.MET, d("2026-10-17T08:00", done = true, completedAt = due - 1000).tone)
        assertEquals("finished 30m late", d("2026-10-17T08:00", done = true, completedAt = due + 30 * 60_000).left)
        assertNull(Due.describe("2026-10-17 08:00", now))
        assertFalse(Due.isValid("2026-10-17T24:00"))
        assertEquals("2026-10-17T18:00", Due.default("2026-10-17", now))
        assertEquals("2026-10-17T19:00", Due.default("2026-10-17", LocalDateTime.of(2026, 10, 17, 17, 50)))
    }

    @Test
    fun remindersAnHourBeforeAndAtTheTimeLimit() {
        val zone = ZoneOffset.UTC
        fun at(h: Int, m: Int = 0) = LocalDateTime.of(2026, 10, 17, h, m).toInstant(zone).toEpochMilli()
        val tasks = listOf(
            Task("a", "Report", date = today, dueAt = "2026-10-17T17:00"),
            Task("b", "Done already", date = today, status = Status.DONE, dueAt = "2026-10-17T12:00"),
            Task("c", "No limit", date = today),
        )
        val ev = DueReminders.events(tasks, zone)
        assertEquals(listOf(at(16), at(17)), ev.map { it.at })
        assertEquals(listOf(DueReminders.Kind.SOON, DueReminders.Kind.DUE), ev.map { it.kind })
        // The alarm fires at 16:00: the hour-left notice.
        assertEquals(listOf(DueReminders.Kind.SOON), DueReminders.due(ev, last = at(15), now = at(16)).map { it.kind })
        // Late alarm (phone asleep) covering both: one notice, "time's up".
        assertEquals(listOf(DueReminders.Kind.DUE), DueReminders.due(ev, last = at(15), now = at(17, 5)).map { it.kind })
        // Long missed (phone was off): nothing stale is posted.
        assertTrue(DueReminders.due(ev, last = at(1), now = at(20)).isEmpty())
    }
}

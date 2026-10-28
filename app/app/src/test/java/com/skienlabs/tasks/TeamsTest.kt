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

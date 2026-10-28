package com.skienlabs.tasks

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import com.skienlabs.tasks.data.Dates
import com.skienlabs.tasks.data.Due
import com.skienlabs.tasks.data.Invite
import com.skienlabs.tasks.data.Member
import com.skienlabs.tasks.data.NoCache
import com.skienlabs.tasks.data.Role
import com.skienlabs.tasks.data.Status
import com.skienlabs.tasks.data.Store
import com.skienlabs.tasks.data.StoreState
import com.skienlabs.tasks.data.Tag
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.data.Team
import com.skienlabs.tasks.data.TeamInvite
import com.skienlabs.tasks.data.TeamsState
import com.skienlabs.tasks.ui.day.DayPage
import com.skienlabs.tasks.ui.day.RowActions
import com.skienlabs.tasks.ui.teams.LocalMyUid
import com.skienlabs.tasks.ui.teams.LocalTeams
import com.skienlabs.tasks.ui.teams.TeamsScreen
import com.skienlabs.tasks.ui.theme.AppTheme
import com.skienlabs.tasks.ui.theme.TasksTheme
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.time.LocalDateTime

/** Teams, time limits and the "pick a tag" rule, rendered and tapped through. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w412dp-h915dp-xxhdpi", application = android.app.Application::class)
class TeamsShotsTest {
    @get:Rule val rule = createComposeRule()

    private val today = Dates.today()
    private val now = LocalDateTime.now()
    private val skien = Tag("t1", "Skien Labs", "blue", createdAt = 1)
    private val members = listOf(
        Member("boss", Role.OWNER, "Sufail", "sufail@skien.com"),
        Member("ann", Role.ADMIN, "Ann Mathew", "ann@skien.com"),
        Member("raj", Role.MEMBER, "Raj Kumar", "raj@gmail.com"),
    )
    private fun team(role: String) = Team(
        "team-skien-1", "Skien Software Lab", "teal", role = role, members = members,
        invites = if (role == Role.MEMBER) emptyList() else listOf(TeamInvite("inv-1", "neha@gmail.com", Role.MEMBER, "boss", "Sufail", 1)),
    )
    private val boardTasks = listOf(
        Task("b1", "Prepare the Q4 client report", date = today, priority = 1, assignee = "raj", assignedBy = "boss", teamId = "team-skien-1",
            dueAt = Due.format(now.plusHours(5)), notes = "Use the new template"),
        Task("b2", "Fix the invoice export", date = Dates.addDays(today, -1), assignee = "ann", assignedBy = "boss", teamId = "team-skien-1",
            dueAt = Due.format(now.minusHours(3))),
        Task("b3", "Onboard Neha", date = today, status = Status.DONE, completedAt = System.currentTimeMillis() - 3_600_000,
            assignee = "raj", assignedBy = "ann", teamId = "team-skien-1"),
    )

    private fun storeWith(role: String, invites: List<Invite> = emptyList(), tasks: List<Task> = emptyList()): Store {
        val api = FakeApi().apply {
            teamList = listOf(team(role))
            inviteList = invites
            tasks.forEach { this.tasks[it.id] = it }
        }
        val store = Store(api, NoCache, CoroutineScope(Dispatchers.Unconfined), Dispatchers.Unconfined, todayFn = { today })
        runBlocking {
            store.start(if (role == Role.MEMBER) "raj" else "boss", today)
            store.loadTeams()
        }
        return store
    }

    private fun shot(name: String, theme: AppTheme = AppTheme.MIDNIGHT, capture: Boolean = true, content: @Composable () -> Unit) {
        rule.setContent {
            TasksTheme(theme) {
                androidx.compose.material3.Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background, contentColor = MaterialTheme.colorScheme.onBackground) {
                    content()
                }
            }
        }
        rule.waitForIdle()
        if (capture) rule.onRoot().captureRoboImage("build/screens/$name.png")
    }

    @Test fun teams_list_with_invite() {
        val store = storeWith(Role.OWNER, listOf(Invite("inv-9", "team-beta-1", "Beta Builders", "orange", Role.MEMBER, "raj@gmail.com", "x", "Bea", 4, 1)))
        shot("teams_list") { TeamsScreen(store, today, "boss", "https://tasks.example.com") {} }
        rule.onNodeWithText("Invites for you").assertExists()
        rule.onNodeWithText("Join team").assertExists()
    }

    @Test fun team_overview_admin() {
        val store = storeWith(Role.OWNER, tasks = boardTasks)
        shot("team_overview", capture = false) { TeamsScreen(store, today, "boss", "https://tasks.example.com") {} }
        rule.onNodeWithText("Skien Software Lab").performClick()
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("build/screens/team_overview.png")
        rule.onNodeWithText("Recently completed").assertExists()
        rule.onNodeWithText("Tasks").performClick()
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("build/screens/team_tasks.png")
        rule.onNodeWithText("Prepare the Q4 client report").assertExists()
        rule.onNodeWithText("People").performClick()
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("build/screens/team_people.png")
        rule.onNodeWithText("neha@gmail.com").assertExists()
    }

    @Test fun team_give_task_sheet() {
        val store = storeWith(Role.OWNER, tasks = boardTasks)
        shot("team_give", capture = false) { TeamsScreen(store, today, "boss", "https://tasks.example.com") {} }
        rule.onNodeWithText("Skien Software Lab").performClick()
        rule.waitForIdle()
        rule.onNodeWithText("Give a task", useUnmergedTree = true).performClick()
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("build/screens/team_give_task.png")
        rule.onNodeWithText("Time limit").assertExists()
    }

    @Test fun team_member_view() {
        val store = storeWith(Role.MEMBER, tasks = boardTasks.filter { it.assignee == "raj" })
        shot("team_member", capture = false) { TeamsScreen(store, today, "raj", "https://tasks.example.com") {} }
        rule.onNodeWithText("Skien Software Lab").performClick()
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("build/screens/team_member.png")
        rule.onNodeWithText("My tasks").assertExists()
    }

    private val actions = RowActions({}, {}, {}, {}, {}, {}, { _, _ -> }, { _, _ -> }, {})

    /** A member's day: team task with its countdown and badge; its menu has no Delete. */
    @Test fun today_with_team_task() {
        val mine = boardTasks.filter { it.assignee == "raj" }.map { it.copy(date = today) } +
            Task("p1", "Pay electricity bill", date = today, tagIds = listOf("t1"), dueAt = Due.format(now.plusDays(2)))
        val s = StoreState(tasks = mine.associateBy { it.id }, tags = listOf(skien), tagsLoaded = true, loadedDays = setOf(today))
        shot("today_team_task") {
            CompositionLocalProvider(LocalTeams provides TeamsState(listOf(team(Role.MEMBER)), loaded = true), LocalMyUid provides "raj") {
                Column {
                    DayPage(
                        today, today, s, null, failed = false, onRetry = {}, actions = actions,
                        onAdd = { _, _, _, _ -> CompletableDeferred(true) }, onMoveAllToToday = {},
                        quickAddFocus = remember { FocusRequester() }, bottomPadding = 0.dp,
                    )
                }
            }
        }
        rule.onNodeWithText("Skien Software Lab · from Sufail", substring = true).assertExists()
        rule.onNodeWithContentDescription("More actions for \"Prepare the Q4 client report\"").performClick()
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("build/screens/today_team_menu.png")
        rule.onNodeWithText("Delete").assertDoesNotExist()
        rule.onNodeWithText("Cancel task").assertDoesNotExist()
    }

    /** Adding without a tag asks for one (or "No tag"); then it goes through. */
    @Test fun quickAddNeedsATagOrNoTag() {
        val added = mutableListOf<Pair<String, List<String>>>()
        val s = StoreState(tags = listOf(skien), tagsLoaded = true, loadedDays = setOf(today))
        shot("quick_add_tag", capture = false) {
            DayPage(
                today, today, s, null, failed = false, onRetry = {}, actions = actions,
                onAdd = { t, _, ids, _ -> added += t to ids; CompletableDeferred(true) }, onMoveAllToToday = {},
                quickAddFocus = remember { FocusRequester() }, bottomPadding = 0.dp,
            )
        }
        rule.onNodeWithText("Add a task").performTextInput("Buy milk")
        rule.onNodeWithText("Buy milk").performImeAction()
        rule.waitForIdle()
        assertTrue(added.isEmpty())
        rule.onNodeWithText("Pick a tag for this task, or choose \"No tag\".").assertExists()
        rule.onRoot().captureRoboImage("build/screens/quick_add_tag_required.png")
        rule.onNodeWithText("No tag").performClick()
        rule.waitForIdle()
        rule.onNodeWithText("Buy milk").performImeAction()
        rule.waitForIdle()
        assertEquals(listOf("Buy milk" to emptyList<String>()), added)
    }
}


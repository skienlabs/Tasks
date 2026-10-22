package com.skienlabs.tasks

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.background
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import com.github.takahirom.roborazzi.captureRoboImage
import com.skienlabs.tasks.auth.Auth
import com.skienlabs.tasks.data.Counts
import com.skienlabs.tasks.data.DayCounts
import com.skienlabs.tasks.data.Dates
import com.skienlabs.tasks.data.PriorityCounts
import com.skienlabs.tasks.data.Profile
import com.skienlabs.tasks.data.Stats
import com.skienlabs.tasks.data.Status
import com.skienlabs.tasks.data.StoreState
import com.skienlabs.tasks.data.Tag
import com.skienlabs.tasks.data.TagCounts
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.ui.account.Avatar
import com.skienlabs.tasks.ui.auth.SignInScreen
import com.skienlabs.tasks.ui.day.DayPage
import com.skienlabs.tasks.ui.day.RowActions
import com.skienlabs.tasks.ui.day.TagFilterRow
import com.skienlabs.tasks.ui.day.WeekStrip
import com.skienlabs.tasks.ui.home.MonthSheet
import com.skienlabs.tasks.ui.summary.SummaryScreen
import com.skienlabs.tasks.ui.theme.LocalExtra
import com.skienlabs.tasks.ui.theme.TasksTheme
import com.skienlabs.tasks.ui.theme.glassPanel
import androidx.compose.material.icons.outlined.Search
import androidx.compose.ui.test.performTextInput
import kotlinx.coroutines.CompletableDeferred
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.time.YearMonth

/** Renders the main screens to PNGs (build/outputs/roborazzi) for visual review. OnePlus 12-sized. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w412dp-h915dp-xxhdpi", application = android.app.Application::class)
class ScreensTest {
    @get:Rule val rule = createComposeRule()

    private val today = Dates.today()
    private val skien = Tag("t1", "Skien Labs", "blue", createdAt = 1)
    private val zup = Tag("t2", "ZupNex", "purple", createdAt = 2)
    private fun task(id: String, title: String, date: String = today, p: Int = 4, status: String = Status.PENDING, tags: List<String> = emptyList(), notes: String = "", postponed: Int = 0) =
        Task(id, title, notes, p, date, status, date, postponed, createdAt = id.hashCode().toLong(), tagIds = tags)

    private val state = StoreState(
        tasks = listOf(
            task("a", "Send invoice for September", today, 1, tags = listOf("t1")).copy(carriedFrom = Dates.addDays(today, -1)),
            task("a2", "Renew SSL certificates", today, 2).copy(carriedFrom = Dates.addDays(today, -3)),
            task("b", "Review pull request #42", p = 1, tags = listOf("t1"), notes = "Check the auth changes first"),
            task("c", "Prepare sprint demo", p = 2, tags = listOf("t2"), postponed = 1).copy(
                subtasks = listOf(
                    com.skienlabs.tasks.data.Subtask("s1-aaaaaaaa", null, "Slides", true),
                    com.skienlabs.tasks.data.Subtask("s2-aaaaaaaa", null, "Demo data", false),
                    com.skienlabs.tasks.data.Subtask("s3-aaaaaaaa", "s2-aaaaaaaa", "Seed users", true),
                    com.skienlabs.tasks.data.Subtask("s4-aaaaaaaa", "s2-aaaaaaaa", "Reset script", false),
                ),
                attachments = listOf(com.skienlabs.tasks.data.Attachment("img-aaaaaaa1"), com.skienlabs.tasks.data.Attachment("img-aaaaaaa2")),
            ),
            task("d", "Call the bank", p = 3),
            task("e", "Reply to client email", p = 4, tags = listOf("t2")),
            task("f", "Morning stand-up notes", status = Status.DONE, tags = listOf("t1")),
            task("g", "Book flight tickets", status = Status.DONE),
            task("h", "Old report", status = Status.CANCELLED),
        ).associateBy { it.id },
        summary = (-3..3).associate { Dates.addDays(today, it.toLong()) to Counts(pending = (it + 4) % 3, done = (it + 5) % 4) } +
            (today to Counts(4, 2, 1)),
        loadedDays = setOf(today),
        tags = listOf(skien, zup),
        tagsLoaded = true,
    )
    private val actions = RowActions({}, {}, {}, {}, {}, {}, { _, _ -> }, { _, _ -> }, {})

    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    private fun Home(s: StoreState, date: String, filter: String? = null, actions: RowActions = this.actions) {
        val profile = Profile("u", "skienlabs@gmail.com", "Skien", onboarded = true)
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        androidx.compose.foundation.layout.Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            com.skienlabs.tasks.ui.home.DateTitle(date, date == today, Modifier.weight(1f, fill = false))
                            Icon(Icons.Filled.ArrowDropDown, null)
                        }
                    },
                    actions = {
                        Icon(Icons.Outlined.Search, null, Modifier.padding(horizontal = 12.dp))
                        Box(Modifier.padding(end = 12.dp)) { Avatar(profile, 32.dp) }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                )
            },
            bottomBar = {
                val glass = LocalExtra.current.glass
                NavigationBar(
                    containerColor = if (glass != null) androidx.compose.ui.graphics.Color.Transparent else LocalExtra.current.surfaceHigh,
                    modifier = if (glass != null) Modifier.glassPanel(androidx.compose.foundation.shape.RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp), glass.panelStrong) else Modifier,
                ) {
                    NavigationBarItem(true, {}, { Icon(Icons.Filled.CheckCircle, null) }, label = { Text("Tasks") })
                    NavigationBarItem(false, {}, { Icon(Icons.Outlined.Insights, null) }, label = { Text("Summary") })
                    NavigationBarItem(false, {}, { Icon(Icons.Outlined.Sell, null) }, label = { Text("Tags") })
                }
            },
            floatingActionButton = { FloatingActionButton({}) { Icon(Icons.Filled.Add, null) } },
            containerColor = MaterialTheme.colorScheme.background,
            contentColor = MaterialTheme.colorScheme.onBackground,
        ) { inner ->
            Column(Modifier.fillMaxSize().padding(inner)) {
                WeekStrip(date, today, { s.summary[it] }, {})
                TagFilterRow(s.tags, filter, {}, {})
                DayPage(
                    date, today, s, filter, failed = false, onRetry = {}, actions = actions,
                    onAdd = { _, _, _ -> CompletableDeferred(true) }, onMoveAllToToday = {},
                    quickAddFocus = remember { FocusRequester() }, bottomPadding = 0.dp,
                )
            }
        }
    }

    private fun shot(name: String, dark: Boolean, content: @Composable () -> Unit) =
        shot(name, if (dark) com.skienlabs.tasks.ui.theme.AppTheme.MIDNIGHT else com.skienlabs.tasks.ui.theme.AppTheme.LIGHT, content)

    private fun shot(name: String, theme: com.skienlabs.tasks.ui.theme.AppTheme, content: @Composable () -> Unit) {
        rule.setContent {
            TasksTheme(theme) {
                androidx.compose.material3.Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background, contentColor = MaterialTheme.colorScheme.onBackground) {
                    androidx.compose.runtime.CompositionLocalProvider(com.skienlabs.tasks.ui.day.LocalGreetingName provides "Sufail") { content() }
                }
            }
        }
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("build/screens/$name.png")
    }

    @Test fun today_dark() = shot("today_dark", true) { Home(state, today) }
    @Test fun today_light() = shot("today_light", false) { Home(state, today) }
    @Test fun today_dim() = shot("today_dim", com.skienlabs.tasks.ui.theme.AppTheme.DIM) { Home(state, today) }
    @Test fun today_abyss() = shot("today_abyss", com.skienlabs.tasks.ui.theme.AppTheme.ABYSS) { Home(state, today) }
    @Test fun today_gray() = shot("today_gray", com.skienlabs.tasks.ui.theme.AppTheme.GRAY) { Home(state, today) }
    @Test fun today_glass() = shot("today_glass", com.skienlabs.tasks.ui.theme.AppTheme.GLASS) { Home(state, today) }
    @Test fun today_glass_light() = shot("today_glass_light", com.skienlabs.tasks.ui.theme.AppTheme.GLASS_LIGHT) { Home(state, today) }
    @Test fun summary_glass() = shot("summary_glass", com.skienlabs.tasks.ui.theme.AppTheme.GLASS) {
        SummaryScreen({ _, _, _ -> stats }, {}, today, state.tags, 0, 0.dp) {}
    }

    /** A past day whose unfinished tasks moved on: it says so, and its bar shows them in red. */
    private val yesterday = Dates.addDays(today, -1)
    private val pastState = state.copy(
        tasks = state.tasks + listOf(
            task("y1", "Weekly invoice run", yesterday, 2, Status.DONE, listOf("t1")),
            task("y2", "Pay electricity bill", yesterday, 3, Status.DONE),
        ).associateBy { it.id },
        summary = state.summary + (yesterday to Counts(0, 2, 0, missed = 3)),
        loadedDays = state.loadedDays + yesterday,
    )
    @Test fun past_day_moved_on() = shot("past_day_moved_on", true) { Home(pastState, yesterday) }

    private val searchTasks = pastState.tasks.values
    private fun searchShot(name: String, theme: com.skienlabs.tasks.ui.theme.AppTheme) = shot(name, theme) {
        com.skienlabs.tasks.ui.search.SearchScreen(
            today = today, tags = state.tags, savedTasks = { searchTasks },
            recent = listOf("invoice #skienlabs", "p:high"),
            search = { query ->
                com.skienlabs.tasks.data.LocalSearch.search(query, searchTasks, state.tags, today)!!.copy(
                    suggestions = if (query == "inv") listOf(com.skienlabs.tasks.data.SearchSuggestion("word", "invoice")) else emptyList(),
                )
            },
            onRemember = {}, onClearRecent = {}, onOpen = {}, onClose = {},
        )
    }
    @Test fun search_empty() = searchShot("search_empty", com.skienlabs.tasks.ui.theme.AppTheme.MIDNIGHT)
    @Test fun search_results() {
        searchShot("search_results_tmp", com.skienlabs.tasks.ui.theme.AppTheme.MIDNIGHT)
        rule.onNode(androidx.compose.ui.test.hasSetTextAction()).performTextInput("inv")
        rule.mainClock.advanceTimeBy(400)
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("build/screens/search_results.png")
    }
    @Test fun search_glass() {
        searchShot("search_glass_tmp", com.skienlabs.tasks.ui.theme.AppTheme.GLASS)
        rule.onNode(androidx.compose.ui.test.hasSetTextAction()).performTextInput("is:open")
        rule.mainClock.advanceTimeBy(400)
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("build/screens/search_glass.png")
    }

    private fun accountShot(name: String, theme: com.skienlabs.tasks.ui.theme.AppTheme) = shot(name, theme) {
        val profile = Profile("u", "skienlabs@gmail.com", "Sufail Ahmed", provider = "google.com", createdAt = 1_760_000_000_000, onboarded = true)
        Column(
            Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceContainerLow).padding(16.dp),
            verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(18.dp),
        ) {
            com.skienlabs.tasks.ui.account.ProfileHero(profile, Counts(pending = 7, done = 12))
            com.skienlabs.tasks.ui.account.Section("Profile") {
                com.skienlabs.tasks.ui.account.SettingRow(Icons.Outlined.Sell, "Change password", "We'll email you a reset link") {}
            }
            com.skienlabs.tasks.ui.account.Section("Appearance", card = false) {
                com.skienlabs.tasks.ui.account.ThemeDropdown(com.skienlabs.tasks.data.ThemePref.GLASS, startOpen = true) {}
            }
        }
    }
    @Test fun account_dark() = accountShot("account_dark", com.skienlabs.tasks.ui.theme.AppTheme.MIDNIGHT)
    @Test fun account_light() = accountShot("account_light", com.skienlabs.tasks.ui.theme.AppTheme.LIGHT)
    @Test fun account_glass() = accountShot("account_glass", com.skienlabs.tasks.ui.theme.AppTheme.GLASS)
    @Test fun theme_swatches() = shot("theme_swatches", com.skienlabs.tasks.ui.theme.AppTheme.ABYSS) {
        Column(Modifier.padding(20.dp)) {
            com.skienlabs.tasks.ui.account.ThemeSwatches(com.skienlabs.tasks.data.ThemePref.ABYSS) {}
            Box(Modifier.size(20.dp))
            com.skienlabs.tasks.ui.account.ThemeSwatches(com.skienlabs.tasks.data.ThemePref.SYSTEM) {}
        }
    }
    @Test fun filtered_dark() = shot("filtered_dark", true) { Home(state, today, "t2") }
    @Test fun empty_light() = shot("empty_light", false) { Home(state.copy(loadedDays = state.loadedDays + Dates.addDays(today, 2)), Dates.addDays(today, 2)) }
    @Test fun loading_dark() = shot("loading_dark", true) { Home(StoreState(tags = state.tags, tagsLoaded = true), Dates.addDays(today, 5)) }

    private val stats: Stats by lazy {
        val m = YearMonth.parse(today.take(7))
        Stats(
            days = (1..m.lengthOfMonth()).mapNotNull { d ->
                val date = m.atDay(d).toString()
                if (d % 6 == 0 || date > today) null else DayCounts(date, pending = d % 3, done = 2 + d % 4, cancelled = if (d % 7 == 0) 1 else 0)
            },
            byTag = listOf(TagCounts("t1", 6, 30, 1), TagCounts("t2", 3, 14, 0), TagCounts(null, 2, 8, 2)),
            byPriority = (1..4).map { PriorityCounts(it, it, 10 + it * 2, if (it == 4) 2 else 0) },
            overdue = 3, postponed = 5,
        )
    }

    @Test fun summary_dark() = shot("summary_dark", true) {
        SummaryScreen({ _, _, _ -> stats }, {}, today, state.tags, 0, 0.dp) {}
    }
    @Test fun summary_light() = shot("summary_light", false) {
        SummaryScreen({ _, _, _ -> stats }, {}, today, state.tags, 0, 0.dp) {}
    }
    @Test fun month_dark() = shot("month_dark", true) {
        MonthSheet(YearMonth.parse(today.take(7)), today, today, state.summary, {}, {}, {})
    }
    @Test fun signin_dark() = shot("signin_dark", true) { SignInScreen(Auth(ApplicationProvider.getApplicationContext())) }
    @Test fun signin_light() = shot("signin_light", false) { SignInScreen(Auth(ApplicationProvider.getApplicationContext())) }

    private val tree = listOf(
        com.skienlabs.tasks.data.Subtask("s1-aaaaaaaa", null, "Set up server", true),
        com.skienlabs.tasks.data.Subtask("s2-aaaaaaaa", null, "Open ports", false),
        com.skienlabs.tasks.data.Subtask("s3-aaaaaaaa", "s2-aaaaaaaa", "25 and 587", true),
        com.skienlabs.tasks.data.Subtask("s4-aaaaaaaa", "s2-aaaaaaaa", "993 (IMAP)", false),
        com.skienlabs.tasks.data.Subtask("s5-aaaaaaaa", null, "DNS records", false),
        com.skienlabs.tasks.data.Subtask("s6-aaaaaaaa", "s5-aaaaaaaa", "MX record", false),
        com.skienlabs.tasks.data.Subtask("s7-aaaaaaaa", "s6-aaaaaaaa", "Check TTL", false),
    )

    @Test fun steps_dark() = shot("steps_dark", true) {
        Column(Modifier.padding(16.dp), verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(20.dp)) {
            Text("On the task row", style = MaterialTheme.typography.titleMedium)
            com.skienlabs.tasks.ui.day.StepsProgress(tree, true) {}
            com.skienlabs.tasks.ui.day.StepsInline(tree, true) {}
            Text("In the task sheet", style = MaterialTheme.typography.titleMedium)
            com.skienlabs.tasks.ui.day.StepsEditor(tree) {}
            com.skienlabs.tasks.ui.task.ImagesEditor(emptyList(), emptyList(), false, {}, {}, {}, {}, {})
        }
    }

    @Test fun task_details() = shot("task_details", true) {
        val t = state.tasks.getValue("c").copy(notes = "Walk through the new onboarding, then the release notes.")
        com.skienlabs.tasks.ui.day.TaskDetails(t, state.tags, today, actions) {}
    }

    @Test fun theme_dropdown() = shot("theme_dropdown", com.skienlabs.tasks.ui.theme.AppTheme.DIM) {
        Column(Modifier.padding(20.dp)) {
            com.skienlabs.tasks.ui.account.ThemeDropdown(com.skienlabs.tasks.data.ThemePref.DIM) {}
            Box(Modifier.size(16.dp))
            com.skienlabs.tasks.ui.account.ThemeDropdown(com.skienlabs.tasks.data.ThemePref.ABYSS, startOpen = true) {}
        }
    }

    /** Like the web app: a tap shows the details; only ⋮ → Edit opens the form. */
    @Test fun tapShowsDetailsNotEditor() {
        val seen = mutableListOf<String>()
        val a = RowActions({ seen += "edit:${it.id}" }, {}, {}, {}, {}, {}, { _, _ -> }, { _, _ -> }, {}, view = { seen += "view:${it.id}" })
        rule.setContent { TasksTheme(true) { Home(state, today, actions = a) } }
        rule.onNodeWithText("Send invoice for September").performClick()
        rule.waitForIdle()
        org.junit.Assert.assertEquals(listOf("view:a"), seen)
        rule.onNodeWithContentDescription("More actions for \"Send invoice for September\"").performClick()
        rule.onNodeWithText("Edit").performClick()
        rule.waitForIdle()
        org.junit.Assert.assertEquals(listOf("view:a", "edit:a"), seen)
    }

    @Test fun intro_first() = shot("intro_first", true) { com.skienlabs.tasks.ui.intro.IntroScreen {} }

    @Test fun intro_scenes() = shot("intro_scenes", true) {
        Box(Modifier.fillMaxSize().background(com.skienlabs.tasks.ui.intro.Ink)) {
            Column(Modifier.padding(8.dp)) {
                for (row in 0..1) {
                    androidx.compose.foundation.layout.Row {
                        for (col in 0..1) {
                            val i = 1 + row * 2 + col
                            Box(Modifier.size(196.dp, 200.dp).graphicsLayer { scaleX = 0.6f; scaleY = 0.6f }, contentAlignment = androidx.compose.ui.Alignment.Center) {
                                Box(Modifier.requiredSize(320.dp, 300.dp)) { com.skienlabs.tasks.ui.intro.SceneView(i, true, i) }
                            }
                        }
                    }
                }
            }
        }
    }

    @Test fun logo_crop() = shot("logo_crop", true) {
        val bmp = remember {
            android.graphics.Bitmap.createBitmap(600, 300, android.graphics.Bitmap.Config.ARGB_8888).apply {
                val c = android.graphics.Canvas(this)
                c.drawColor(android.graphics.Color.rgb(26, 115, 232))
                val p = android.graphics.Paint().apply { color = android.graphics.Color.rgb(251, 188, 4) }
                c.drawCircle(300f, 150f, 110f, p)
            }
        }
        com.skienlabs.tasks.ui.tags.LogoCropDialog(bmp, {}, {}, {})
    }
}

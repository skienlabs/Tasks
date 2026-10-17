package com.skienlabs.tasks

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.util.Base64
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Sell
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import com.github.takahirom.roborazzi.ExperimentalRoborazziApi
import com.github.takahirom.roborazzi.captureRoboImage
import com.github.takahirom.roborazzi.captureScreenRoboImage
import com.skienlabs.tasks.data.Attachment
import com.skienlabs.tasks.data.Counts
import com.skienlabs.tasks.data.Dates
import com.skienlabs.tasks.data.NoCache
import com.skienlabs.tasks.data.Profile
import com.skienlabs.tasks.data.Status
import com.skienlabs.tasks.data.Store
import com.skienlabs.tasks.data.StoreState
import com.skienlabs.tasks.data.Subtask
import com.skienlabs.tasks.data.Tag
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.data.TasksApi
import com.skienlabs.tasks.ui.account.Avatar
import com.skienlabs.tasks.ui.day.DayPage
import com.skienlabs.tasks.ui.day.RowActions
import com.skienlabs.tasks.ui.day.TagFilterRow
import com.skienlabs.tasks.ui.day.WeekStrip
import com.skienlabs.tasks.ui.images.ImageStore
import com.skienlabs.tasks.ui.images.LocalImages
import com.skienlabs.tasks.ui.tags.TagsScreen
import com.skienlabs.tasks.ui.task.TaskSheet
import com.skienlabs.tasks.ui.theme.LocalExtra
import com.skienlabs.tasks.ui.theme.TasksTheme
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.ByteArrayOutputStream

/**
 * Play Store screenshots: the real screens with sample data and real images, rendered to
 * build/store/raw/. ../store/render.py frames them into the store images.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w412dp-h915dp-xxhdpi", application = android.app.Application::class)
class StoreShotsTest {
    @get:Rule val rule = createComposeRule()

    private val today = Dates.today()

    // ---- Sample pictures (drawn, so nothing copyrighted ends up in the store listing) ----
    private fun jpeg(b: Bitmap): ByteArray = ByteArrayOutputStream().also { b.compress(Bitmap.CompressFormat.JPEG, 88, it) }.toByteArray()
    private fun png(b: Bitmap): String =
        "data:image/png;base64," + Base64.encodeToString(ByteArrayOutputStream().also { b.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray(), Base64.NO_WRAP)

    /** Dusk over hills. */
    private fun landscape(): Bitmap = Bitmap.createBitmap(800, 800, Bitmap.Config.ARGB_8888).apply {
        val c = Canvas(this)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.shader = LinearGradient(0f, 0f, 0f, 800f, intArrayOf(0xFF2B1B5A.toInt(), 0xFFE0607E.toInt(), 0xFFFFB86B.toInt()), floatArrayOf(0f, 0.55f, 1f), Shader.TileMode.CLAMP)
        c.drawRect(0f, 0f, 800f, 800f, p)
        p.shader = null; p.color = 0xFFFFE3A3.toInt(); c.drawCircle(540f, 470f, 90f, p)
        fun hill(color: Int, y: Float, amp: Float, ph: Float) {
            val path = Path().apply {
                moveTo(0f, 800f); lineTo(0f, y)
                var x = 0f
                while (x <= 800f) { lineTo(x, y - amp * kotlin.math.sin((x / 800f) * 6.28f + ph)); x += 20f }
                lineTo(800f, 800f); close()
            }
            p.color = color; c.drawPath(path, p)
        }
        hill(0xFF7A3E7A.toInt(), 560f, 40f, 0.5f)
        hill(0xFF4A2763.toInt(), 620f, 55f, 2.2f)
        hill(0xFF241640.toInt(), 700f, 35f, 4.0f)
    }

    /** A whiteboard sketch of the mail server setup. */
    private fun whiteboard(): Bitmap = Bitmap.createBitmap(800, 800, Bitmap.Config.ARGB_8888).apply {
        val c = Canvas(this)
        c.drawColor(0xFFF7F5EF.toInt())
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 7f; color = 0xFF33415C.toInt(); strokeCap = Paint.Cap.ROUND }
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF1F2A44.toInt(); textSize = 46f; typeface = Typeface.DEFAULT_BOLD; textAlign = Paint.Align.CENTER }
        fun box(l: Float, t: Float, color: Int, label: String) {
            p.color = color; c.drawRoundRect(RectF(l, t, l + 250f, t + 150f), 28f, 28f, p)
            c.drawRoundRect(RectF(l, t, l + 250f, t + 150f), 28f, 28f, stroke)
            c.drawText(label, l + 125f, t + 92f, text)
        }
        c.drawLine(225f, 245f, 400f, 400f, stroke); c.drawLine(575f, 245f, 400f, 400f, stroke)
        c.drawLine(400f, 480f, 400f, 590f, stroke)
        box(100f, 100f, 0xFFBFD7FF.toInt(), "DNS")
        box(450f, 100f, 0xFFFFD9A8.toInt(), "MX")
        box(275f, 340f, 0xFFC8F0D2.toInt(), "Postfix")
        box(275f, 590f, 0xFFF4C7E3.toInt(), "IMAP")
        text.textSize = 34f; text.typeface = Typeface.DEFAULT; text.textAlign = Paint.Align.LEFT; text.color = 0xFFD93025.toInt()
        c.drawText(":25  :587", 560f, 430f, text)
        c.drawText(":993", 560f, 680f, text)
    }

    /** Terminal output. */
    private fun terminal(): Bitmap = Bitmap.createBitmap(800, 800, Bitmap.Config.ARGB_8888).apply {
        val c = Canvas(this)
        c.drawColor(0xFF0E1525.toInt())
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 38f; typeface = Typeface.MONOSPACE }
        val lines = listOf(
            0xFF7DD3FC to "$ systemctl status postfix", 0xFF86EFAC to "  active (running)", 0xFFCBD5E1 to "",
            0xFF7DD3FC to "$ ss -ltn | grep 25", 0xFFCBD5E1 to "LISTEN 0.0.0.0:25", 0xFFCBD5E1 to "LISTEN 0.0.0.0:587",
            0xFFCBD5E1 to "", 0xFF7DD3FC to "$ dig mx skienlab.com", 0xFFFDE68A to "  10 mail.skienlab.com.",
        )
        lines.forEachIndexed { i, (color, s) -> p.color = color.toInt(); c.drawText(s, 40f, 110f + i * 70f, p) }
        p.color = 0xFF86EFAC.toInt(); c.drawRect(40f, 110f + 9 * 70f - 34f, 62f, 110f + 9 * 70f + 6f, p)
    }

    private val pictures by lazy { mapOf("img-landscap1" to jpeg(landscape()), "img-whitebrd1" to jpeg(whiteboard()), "img-terminal1" to jpeg(terminal())) }

    private val api: TasksApi by lazy {
        val fake = FakeApi()
        object : TasksApi by fake {
            override suspend fun image(id: String, size: String) = pictures.getValue(id)
        }
    }

    private val images by lazy {
        ImageStore(ApplicationProvider.getApplicationContext(), api).also { s ->
            runBlocking { pictures.keys.forEach { s.load(it, "thumb"); s.load(it, "full") } }
        }
    }

    // ---- Tag logos ----
    private fun logo(bg: Int, draw: (Canvas, Paint) -> Unit): String = png(Bitmap.createBitmap(128, 128, Bitmap.Config.ARGB_8888).apply {
        val c = Canvas(this)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.color = bg; c.drawRoundRect(RectF(0f, 0f, 128f, 128f), 28f, 28f, p)
        draw(c, p)
    })

    private val skien = Tag("t1", "Skien Labs", "blue", createdAt = 1, logo = logo(0xFF1A73E8.toInt()) { c, p ->
        p.color = 0xFFFFFFFF.toInt(); p.textSize = 84f; p.typeface = Typeface.DEFAULT_BOLD; p.textAlign = Paint.Align.CENTER
        c.drawText("S", 64f, 94f, p)
    })
    private val zup = Tag("t2", "ZupNex", "purple", createdAt = 2, logo = logo(0xFF1B1036.toInt()) { c, p ->
        p.style = Paint.Style.STROKE; p.strokeWidth = 16f; p.strokeCap = Paint.Cap.ROUND; p.strokeJoin = Paint.Join.ROUND
        p.color = 0xFFB583FF.toInt()
        c.drawPath(Path().apply { moveTo(34f, 36f); lineTo(94f, 36f); lineTo(34f, 92f); lineTo(94f, 92f) }, p)
    })
    private val softop = Tag("t3", "Softop", "orange", createdAt = 3, logo = logo(0xFFFFF1E0.toInt()) { c, p ->
        p.color = 0xFFF57C00.toInt()
        c.drawRoundRect(RectF(26f, 30f, 102f, 50f), 10f, 10f, p)
        p.color = 0xFFFFA726.toInt(); c.drawRoundRect(RectF(26f, 56f, 86f, 76f), 10f, 10f, p)
        p.color = 0xFFFFCC80.toInt(); c.drawRoundRect(RectF(26f, 82f, 66f, 102f), 10f, 10f, p)
    })
    private val home = Tag("t4", "Home", "green", createdAt = 4)
    private val personal = Tag("t5", "Personal", "pink", createdAt = 5)
    private val tags = listOf(skien, zup, softop, home, personal)

    private fun task(id: String, title: String, date: String = today, p: Int = 4, status: String = Status.PENDING, tags: List<String> = emptyList(), notes: String = "", postponed: Int = 0) =
        Task(id, title, notes, p, date, status, date, postponed, createdAt = id.hashCode().toLong(), tagIds = tags)

    private val mailSteps = listOf(
        Subtask("s1-aaaaaaaa", null, "Set up the server", true),
        Subtask("s2-aaaaaaaa", null, "Open ports", false),
        Subtask("s3-aaaaaaaa", "s2-aaaaaaaa", "25 and 587 (SMTP)", true),
        Subtask("s4-aaaaaaaa", "s2-aaaaaaaa", "993 (IMAP)", false),
        Subtask("s5-aaaaaaaa", null, "DNS records", false),
        Subtask("s6-aaaaaaaa", "s5-aaaaaaaa", "MX record", true),
        Subtask("s7-aaaaaaaa", "s5-aaaaaaaa", "SPF and DKIM", false),
        Subtask("s8-aaaaaaaa", "s7-aaaaaaaa", "Check TTL", false),
    )
    private val mail = task("m", "Set up the mail server", p = 1, tags = listOf("t1"), notes = "Use the new VM; keep the old relay until DNS settles").copy(
        subtasks = mailSteps,
        attachments = listOf(Attachment("img-whitebrd1"), Attachment("img-terminal1")),
    )

    private val state = StoreState(
        tasks = listOf(
            task("a", "Send invoice for September", Dates.addDays(today, -1), 1, tags = listOf("t3")),
            mail,
            task("b", "Review pull request #42", p = 2, tags = listOf("t2"), notes = "Check the auth changes first"),
            task("c", "Book the venue for the offsite", p = 2, tags = listOf("t4"), postponed = 1).copy(
                attachments = listOf(Attachment("img-landscap1")),
            ),
            task("d", "Call the bank", p = 3, tags = listOf("t5")),
            task("f", "Morning stand-up notes", status = Status.DONE, tags = listOf("t1")),
            task("g", "Renew the domain", status = Status.DONE, tags = listOf("t2")),
            task("h", "Gym at 7", status = Status.DONE, tags = listOf("t5")),
        ).associateBy { it.id },
        summary = (-3..3).associate { Dates.addDays(today, it.toLong()) to Counts(pending = (it + 4) % 3, done = (it + 5) % 4) } +
            (today to Counts(4, 3, 1)),
        loadedDays = setOf(today),
        tags = tags,
        tagsLoaded = true,
    )
    private val actions = RowActions({}, {}, {}, {}, {}, {}, { _, _ -> }, { _, _ -> }, {})

    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    private fun Frame(tab: Int, title: String?, content: @Composable () -> Unit) {
        val profile = Profile("u", "skienlabs@gmail.com", "Skien", onboarded = true)
        Scaffold(
            topBar = {
                if (title != null) TopAppBar(
                    title = { androidx.compose.foundation.layout.Row { Text(title, style = MaterialTheme.typography.titleLarge); Icon(Icons.Filled.ArrowDropDown, null) } },
                    actions = { Box(Modifier.padding(end = 12.dp)) { Avatar(profile, 32.dp) } },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                )
            },
            bottomBar = {
                NavigationBar(containerColor = LocalExtra.current.surfaceHigh) {
                    NavigationBarItem(tab == 0, {}, { Icon(if (tab == 0) Icons.Filled.CheckCircle else Icons.Outlined.CheckCircle, null) }, label = { Text("Tasks") })
                    NavigationBarItem(tab == 1, {}, { Icon(Icons.Outlined.Insights, null) }, label = { Text("Summary") })
                    NavigationBarItem(tab == 2, {}, { Icon(if (tab == 2) Icons.Filled.Sell else Icons.Outlined.Sell, null) }, label = { Text("Tags") })
                }
            },
            floatingActionButton = { if (tab == 0) FloatingActionButton({}) { Icon(Icons.Filled.Add, null) } },
            containerColor = MaterialTheme.colorScheme.background,
        ) { inner -> Box(Modifier.fillMaxSize().padding(inner)) { content() } }
    }

    @Composable
    private fun Today() = Frame(0, Dates.monthYear(today)) {
        Column(Modifier.fillMaxSize()) {
            WeekStrip(today, today, { state.summary[it] }, {})
            TagFilterRow(state.tags, null, {}, {})
            DayPage(
                today, today, state, null, failed = false, onRetry = {}, actions = actions,
                onAdd = { _, _, _ -> CompletableDeferred(true) }, onMoveAllToToday = {},
                quickAddFocus = remember { FocusRequester() }, bottomPadding = 0.dp,
            )
        }
    }

    private fun setScreen(dark: Boolean, content: @Composable () -> Unit) {
        val imgs = images
        rule.setContent {
            CompositionLocalProvider(LocalImages provides imgs) {
                TasksTheme(dark) { Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) { content() } }
            }
        }
        rule.waitForIdle()
    }

    @Test fun store_today_dark() {
        setScreen(true) { Today() }
        rule.onRoot().captureRoboImage("build/store/raw/today_dark.png")
    }

    @Test fun store_today_light() {
        setScreen(false) { Today() }
        rule.onRoot().captureRoboImage("build/store/raw/today_light.png")
    }

    @OptIn(ExperimentalRoborazziApi::class)
    @Test fun store_task_sheet() {
        val store = Store(api, NoCache, CoroutineScope(Dispatchers.Unconfined), Dispatchers.Unconfined)
        setScreen(true) {
            Today()
            TaskSheet(store, mail, today, null, today, tags, onDismiss = {}, onManageTags = {})
        }
        rule.mainClock.advanceTimeBy(2_000)
        rule.waitForIdle()
        captureScreenRoboImage("build/store/raw/task_sheet.png")
    }

    @Test fun store_tags() {
        val store = Store(api, NoCache, CoroutineScope(Dispatchers.Unconfined), Dispatchers.Unconfined)
        setScreen(true) { Frame(2, null) { TagsScreen(store, tags, true, 0.dp) } }
        rule.onRoot().captureRoboImage("build/store/raw/tags.png")
    }
}

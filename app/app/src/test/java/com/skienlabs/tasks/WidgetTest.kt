package com.skienlabs.tasks

import android.widget.FrameLayout
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.ExperimentalGlanceRemoteViewsApi
import androidx.glance.appwidget.GlanceRemoteViews
import androidx.test.core.app.ApplicationProvider
import com.github.takahirom.roborazzi.captureRoboImage
import com.skienlabs.tasks.data.Status
import com.skienlabs.tasks.data.Subtask
import com.skienlabs.tasks.data.Tag
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.widget.WidgetContent
import com.skienlabs.tasks.widget.WidgetRepo
import com.skienlabs.tasks.widget.widgetImages
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@OptIn(ExperimentalGlanceRemoteViewsApi::class)
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w412dp-h915dp-night-xxhdpi", application = android.app.Application::class)
class WidgetTest {
    private val today = "2026-10-17"
    private fun t(id: String, title: String, p: Int = 4, status: String = Status.PENDING, date: String = today, tags: List<String> = emptyList(), steps: List<Subtask> = emptyList()) =
        Task(id, title, priority = p, date = date, status = status, createdAt = id.hashCode().toLong(), tagIds = tags, subtasks = steps)

    private val tags = listOf(Tag("t1", "Skien Labs", "blue"), Tag("t2", "Softop", "orange"))
    private val tasks = listOf(
        t("a", "Stand-up notes", status = Status.DONE), t("b", "Book flights", status = Status.DONE), t("c", "Pay rent", status = Status.DONE),
        t("d", "Send the invoice", p = 1, tags = listOf("t1")),
        t("e", "Mail server", p = 2, tags = listOf("t2"), steps = listOf(Subtask("s1-aaaaaaaa", null, "Ports", true), Subtask("s2-aaaaaaaa", null, "DNS"), Subtask("s3-aaaaaaaa", null, "TLS"))),
        t("f", "Review pull request", p = 2),
        t("g", "Call the bank", p = 3, date = "2026-10-16"),
        t("h", "Cancelled", status = Status.CANCELLED),
    )

    @Test
    fun summaryCountsAndOrder() {
        val d = WidgetRepo.summarize(today, tasks, tags)
        assertEquals(3, d.done)
        assertEquals(7, d.total) // 6 on the day (not cancelled) + 1 from yesterday
        assertEquals(listOf("d", "e", "f", "g"), d.open.map { it.id })
    }

    private fun shot(name: String, w: Int, h: Int) = runBlocking {
        val activity = org.robolectric.Robolectric.buildActivity(androidx.activity.ComponentActivity::class.java).setup().get()
        val context: android.content.Context = activity
        val d = WidgetRepo.summarize(today, tasks, tags)
        val (ring, checks) = widgetImages(context, d, dark = true)
        val rv = GlanceRemoteViews().compose(context, DpSize(w.dp, h.dp)) { WidgetContent(context, d, ring, checks, list = h > 200) }.remoteViews
        val host = FrameLayout(context)
        val view = rv.apply(context, host)
        val px = { v: Int -> (v * context.resources.displayMetrics.density).toInt() }
        host.addView(view, FrameLayout.LayoutParams(px(w), px(h)))
        val frame = FrameLayout(context).apply { setBackgroundColor(0xFF202124.toInt()); setPadding(px(16), px(16), px(16), px(16)) }
        frame.addView(host, FrameLayout.LayoutParams(px(w), px(h)))
        activity.setContentView(frame)
        org.robolectric.shadows.ShadowLooper.idleMainLooper()
        frame.captureRoboImage("build/screens/$name.png")
    }

    @Test fun widget_4x2() = shot("widget_4x2", 320, 170)
    @Test fun widget_4x4() = shot("widget_4x4", 320, 330)
}

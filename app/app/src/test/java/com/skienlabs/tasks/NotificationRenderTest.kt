package com.skienlabs.tasks

import android.widget.FrameLayout
import android.widget.LinearLayout
import com.github.takahirom.roborazzi.captureRoboImage
import com.skienlabs.tasks.data.Status
import com.skienlabs.tasks.data.Tag
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.notify.DailySummary
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Renders the end-of-day notification's views (collapsed + expanded) on a notification-like shade. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w412dp-h915dp-xxhdpi", application = android.app.Application::class)
class NotificationRenderTest {
    private val today = "2026-10-21"
    private val tags = listOf(Tag("k", "Skien", "blue"), Tag("s", "Softop", "orange"), Tag("p", "Personal", "green"))
    private var n = 0
    private fun t(title: String, p: Int, tag: String? = null, status: String = Status.PENDING, from: String? = null) =
        Task("t${n++}", title, priority = p, date = today, status = status, createdAt = n.toLong(), tagIds = listOfNotNull(tag), carriedFrom = from)

    private val tasks = buildList {
        add(t("AI Amal HR API on Live Server", 1, "k", from = "2026-10-20"))
        add(t("Eduegate Staff App – iOS", 2, "s", from = "2026-10-18"))
        add(t("Setup Tenant HR API on Live Windows", 2, "k", from = "2026-10-19"))
        add(t("Repair Database Backup Pipelines", 2, "k", from = "2026-10-19"))
        add(t("Eduegate Visitor App – iOS", 2, "s", from = "2026-10-20"))
        add(t("Setup Live DevPilot-API Container in Linux", 2, "k", from = "2026-10-20"))
        repeat(10) { add(t("Follow-up $it", 3, "p")) }
        add(t("Read release notes", 4)); add(t("Water plants", 4))
        repeat(3) { add(t("Done $it", 2, "k", status = Status.DONE)) }
    }

    @Test
    fun contentMatchesTheDay() {
        val c = DailySummary.summarize(today, tasks, tags)!!
        assertEquals("18 tasks still open", c.title)
        assertEquals("3 of 21 done · 6 from earlier days", c.text)
        assertEquals(listOf(1, 5, 10, 2), c.open)
        assertEquals("AI Amal HR API on Live Server", c.rows[0].title)
        assertEquals("since yesterday", c.rows[0].note)
        // Medium: Skien before Softop, titles A–Z within each.
        assertEquals(listOf("Repair Database Backup Pipelines", "Setup Live DevPilot-API Container in Linux", "Setup Tenant HR API on Live Windows", "Eduegate Staff App – iOS"), c.rows.drop(1).map { it.title })
        assertEquals(13, c.more)
    }

    private fun render(name: String, bg: Int, dark: Boolean, all: Boolean = false) {
        val activity = org.robolectric.Robolectric.buildActivity(androidx.activity.ComponentActivity::class.java).setup().get()
        activity.setTheme(if (dark) android.R.style.Theme_DeviceDefault else android.R.style.Theme_DeviceDefault_Light)
        val c = if (all) DailySummary.summarize(today, tasks.map { it.copy(status = Status.DONE) }, tags)!! else DailySummary.summarize(today, tasks, tags)!!
        val (small, big) = DailySummary.views(activity, c)
        val px = { v: Int -> (v * activity.resources.displayMetrics.density).toInt() }
        val column = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(0xFF111111.toInt()); setPadding(px(12), px(12), px(12), px(12)) }
        for (rv in listOf(small, big)) {
            val card = FrameLayout(activity).apply {
                background = android.graphics.drawable.GradientDrawable().apply { setColor(bg); cornerRadius = px(24).toFloat() }
                setPadding(px(16), px(14), px(16), px(14))
            }
            card.addView(rv.apply(activity, card))
            column.addView(card, LinearLayout.LayoutParams(px(352), LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = px(12) })
        }
        activity.setContentView(column)
        org.robolectric.shadows.ShadowLooper.idleMainLooper()
        column.captureRoboImage("build/screens/$name.png")
    }

    @Test @Config(qualifiers = "+night") fun notification_dark() = render("notification_dark", 0xFF2B2C30.toInt(), true)
    @Test fun notification_light() = render("notification_light", 0xFFF3F4F8.toInt(), false)
    @Test @Config(qualifiers = "+night") fun notification_all_done() = render("notification_all_done", 0xFF2B2C30.toInt(), true, all = true)
}

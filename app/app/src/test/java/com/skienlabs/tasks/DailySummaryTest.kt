package com.skienlabs.tasks

import com.skienlabs.tasks.data.Status
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.notify.DailySummary
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime

class DailySummaryTest {
    private val today = "2026-10-17"
    private fun t(id: String, title: String, p: Int = 4, status: String = Status.PENDING, date: String = today) =
        Task(id, title, priority = p, date = date, status = status, createdAt = id.hashCode().toLong())

    @Test
    fun nothingPlannedMeansNoNotification() {
        assertNull(DailySummary.summarize(today, emptyList()))
        assertNull(DailySummary.summarize(today, listOf(t("c", "Cancelled", status = Status.CANCELLED))))
    }

    @Test
    fun allDone() {
        val c = DailySummary.summarize(today, listOf(t("a", "A", status = Status.DONE), t("b", "B", status = Status.DONE)))!!
        assertEquals("All done for today", c.title)
        assertEquals("You completed 2 tasks. Nice work.", c.text)
    }

    @Test
    fun openTasksWithHighPriorityAndOverdue() {
        val c = DailySummary.summarize(today, listOf(
            t("a", "Done one", status = Status.DONE),
            t("b", "Send invoice", p = 1),
            t("c", "Call bank", p = 3),
            t("d", "Old report", p = 1, date = "2026-10-15"),
            t("b", "Send invoice", p = 1), // duplicates (today + overdue lists) count once
        ))!!
        assertEquals("3 tasks still open", c.title)
        assertEquals("1 of 4 done · 1 from earlier days", c.text)
        assertEquals(listOf("High · Old report (since Thu)", "High · Send invoice", "Low · Call bank"), c.lines)
        assertEquals(listOf(2, 0, 1, 0), c.open)
        assertEquals(1, c.done)
        assertEquals(4, c.total)
    }

    @Test
    fun carriedOverTasksCountAsFromEarlier() {
        val c = DailySummary.summarize(today, listOf(
            t("a", "Done one", status = Status.DONE),
            t("d", "Old report", p = 1).copy(carriedFrom = "2026-10-16"),
            t("c", "Call bank", p = 3),
        ))!!
        assertEquals("2 tasks still open", c.title)
        assertEquals("1 of 3 done · 1 from earlier days", c.text)
        assertEquals(listOf("High · Old report (since yesterday)", "Low · Call bank"), c.lines)
        assertEquals("since yesterday", c.rows.first().note)
    }

    @Test
    fun manyOpenTasksAreCapped() {
        val c = DailySummary.summarize(today, (1..9).map { t("t$it", "Task $it") })!!
        assertEquals(7, c.lines.size)
        assertEquals("and 3 more", c.lines.last())
        assertTrue(c.text.startsWith("0 of 9 done"))
        assertEquals(DailySummary.ROWS, c.rows.size)
        assertEquals(4, c.more)
        assertEquals(listOf("Task 1", "Task 2", "Task 3", "Task 4", "Task 5"), c.rows.map { it.title })
    }

    @Test
    fun oneListSortedByPriorityThenCompanyThenTitle() {
        val tags = listOf(com.skienlabs.tasks.data.Tag("s", "Softop", "orange"), com.skienlabs.tasks.data.Tag("k", "Skien", "blue"))
        fun tt(id: String, title: String, p: Int, tag: String? = null) = t(id, title, p).copy(tagIds = listOfNotNull(tag))
        val c = DailySummary.summarize(today, listOf(
            tt("1", "Server 10 cleanup", 2, "s"), tt("2", "Server 9 cleanup", 2, "s"),
            tt("3", "zebra", 2, "k"), tt("4", "Alpha", 2), tt("5", "Pay rent", 1), tt("6", "apple", 2, "k"),
        ), tags)!!
        // High first; then Medium by company (Skien, Softop, untagged last), titles A–Z, numbers by value.
        assertEquals(listOf("Pay rent", "apple", "zebra", "Server 9 cleanup", "Server 10 cleanup"), c.rows.map { it.title })
        assertEquals(1, c.more)
        assertEquals("Skien", c.rows[1].note)
    }

    @Test
    fun sinceLabels() {
        assertEquals("since yesterday", DailySummary.since("2026-10-16", today))
        assertEquals("since Thu", DailySummary.since("2026-10-15", today))
        assertEquals("since 1 Oct", DailySummary.since("2026-10-01", today))
    }

    @Test
    fun nextTriggerIsTodayOrTomorrow() {
        val now = LocalDateTime.of(2026, 10, 17, 20, 0)
        assertEquals(LocalDateTime.of(2026, 10, 17, 21, 0), DailySummary.nextTrigger(21 * 60, now))
        assertEquals(LocalDateTime.of(2026, 10, 18, 9, 0), DailySummary.nextTrigger(9 * 60, now))
        assertEquals(LocalDateTime.of(2026, 10, 18, 20, 0), DailySummary.nextTrigger(20 * 60, now)) // exactly now -> tomorrow
    }
}

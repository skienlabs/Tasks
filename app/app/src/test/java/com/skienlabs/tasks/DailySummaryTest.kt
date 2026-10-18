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
        assertEquals("You completed 1 of 3 today. 1 from earlier days. High priority: Old report, Send invoice", c.text)
        assertEquals(listOf("High · Old report (Thu, 15 Oct)", "High · Send invoice", "Low · Call bank"), c.lines)
    }

    @Test
    fun carriedOverTasksCountAsFromEarlier() {
        val c = DailySummary.summarize(today, listOf(
            t("a", "Done one", status = Status.DONE),
            t("d", "Old report", p = 1).copy(carriedFrom = "2026-10-16"),
            t("c", "Call bank", p = 3),
        ))!!
        assertEquals("2 tasks still open", c.title)
        assertEquals("You completed 1 of 3 today. 1 from earlier days. High priority: Old report", c.text)
        assertEquals(listOf("High · Old report (from yesterday)", "Low · Call bank"), c.lines)
    }

    @Test
    fun manyOpenTasksAreCapped() {
        val c = DailySummary.summarize(today, (1..9).map { t("t$it", "Task $it") })!!
        assertEquals(7, c.lines.size)
        assertEquals("and 3 more", c.lines.last())
        assertTrue(c.text.startsWith("You completed 0 of 9"))
    }

    @Test
    fun nextTriggerIsTodayOrTomorrow() {
        val now = LocalDateTime.of(2026, 10, 17, 20, 0)
        assertEquals(LocalDateTime.of(2026, 10, 17, 21, 0), DailySummary.nextTrigger(21 * 60, now))
        assertEquals(LocalDateTime.of(2026, 10, 18, 9, 0), DailySummary.nextTrigger(9 * 60, now))
        assertEquals(LocalDateTime.of(2026, 10, 18, 20, 0), DailySummary.nextTrigger(20 * 60, now)) // exactly now -> tomorrow
    }
}

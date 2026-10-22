package com.skienlabs.tasks

import com.skienlabs.tasks.data.LocalSearch
import com.skienlabs.tasks.data.Status
import com.skienlabs.tasks.data.Subtask
import com.skienlabs.tasks.data.Tag
import com.skienlabs.tasks.data.Task
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The offline search: same basics as the server's, over the tasks saved on the phone. */
class LocalSearchTest {
    private val today = "2026-10-22"
    private val tags = listOf(Tag("k", "Skien Labs", "blue"), Tag("s", "Softop", "orange"))
    private val tasks = listOf(
        Task("1", "Invoice reconciliation", date = today, priority = 2, tagIds = listOf("s")),
        Task("2", "Weekly invoice run", date = "2026-10-19", status = Status.DONE, tagIds = listOf("s")),
        Task("3", "Repair backups", date = today, notes = "Fails on the mail server mount", tagIds = listOf("k")),
        Task("4", "Server patching", date = "2026-10-24", priority = 1, tagIds = listOf("k"), subtasks = listOf(Subtask("a", null, "Reboot the Éclair box"))),
        Task("5", "Renew domain", date = today, priority = 1, carriedFrom = "2026-10-21"),
    )
    private fun ids(q: String) = LocalSearch.search(q, tasks, tags, today)!!.hits().map { it.task.id }

    @Test fun wordsRankTitleStartsFirstAndOpenBeforeDone() = assertEquals(listOf("1", "2"), ids("invoice"))
    @Test fun everyWordMustMatch() = assertEquals(listOf("3"), ids("mail server"))
    @Test fun stepsAndNotesSayWhyTheyMatched() {
        val hit = LocalSearch.search("eclair", tasks, tags, today)!!.hits().single()
        assertEquals("4", hit.task.id)
        assertEquals("step", hit.match?.field)
    }
    @Test fun tagFilterUsesNamesWithoutSpaces() = assertEquals(listOf("3", "4").sorted(), ids("#skienlabs").sorted())
    @Test fun filtersCombine() {
        assertEquals(listOf("2"), ids("invoice is:done"))
        assertEquals(listOf("5", "4").sorted(), ids("p:high").sorted())
        assertEquals(listOf("5"), ids("is:late"))
        assertTrue(ids("#softop is:open").all { it == "1" })
    }
    @Test fun dateAndHasFiltersWorkOffline() {
        assertEquals(listOf("1", "3", "5").sorted(), ids("date:today").sorted())
        assertEquals(listOf("4"), ids("has:steps"))
        assertEquals(listOf("3"), ids("has:notes"))
        assertEquals(listOf("2"), ids("before:2026-10-20"))
        assertEquals(listOf("4"), ids("after:2026-10-22"))
        assertTrue(ids("date:week").containsAll(listOf("1", "2", "3", "4", "5")))
        assertEquals(listOf("1", "2"), ids("invoice \"\""))
    }
    @Test fun nothingToSearchIsNull() = assertNull(LocalSearch.search("   \"\"", tasks, tags, today))
    @Test fun termsLeaveFiltersOut() = assertEquals(listOf("invoice", "mail server"), LocalSearch.terms("invoice #softop is:open \"mail server\""))
}

package com.skienlabs.tasks.data

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.format.TextStyle
import java.time.temporal.ChronoUnit
import java.util.Locale

/** Calendar days as "YYYY-MM-DD" strings in the phone's own time zone (same as the server). */
object Dates {
    const val MIN = "1900-01-01"
    const val MAX = "2999-12-31"

    fun today(): String = LocalDate.now().toString()
    fun parse(key: String): LocalDate = LocalDate.parse(key)
    fun addDays(key: String, n: Long): String = parse(key).plusDays(n).toString()
    fun between(from: String, to: String): Long = ChronoUnit.DAYS.between(parse(from), parse(to))

    fun isValid(key: String?): Boolean =
        key != null && key.length == 10 && key >= MIN && key <= MAX && runCatching { parse(key).toString() == key }.getOrDefault(false)

    /** Weeks start on Sunday, like Google Calendar's default in India. */
    fun startOfWeek(key: String): String {
        val d = parse(key)
        val back = (d.dayOfWeek.value % 7).toLong() // Sunday=0
        return d.minusDays(back).toString()
    }

    fun monthGrid(month: YearMonth): List<String> {
        val start = parse(startOfWeek(month.atDay(1).toString()))
        return List(42) { start.plusDays(it.toLong()).toString() }
    }

    fun relativeLabel(key: String, today: String): String = when (between(today, key)) {
        0L -> "Today"
        1L -> "Tomorrow"
        -1L -> "Yesterday"
        else -> parse(key).dayOfWeek.getDisplayName(TextStyle.FULL, Locale.getDefault())
    }

    private val shortSameYear = DateTimeFormatter.ofPattern("EEE, d MMM", Locale.getDefault())
    private val shortOtherYear = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.getDefault())
    private val full = DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL).withLocale(Locale.getDefault())
    private val monthYear = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.getDefault())
    private val monthOnly = DateTimeFormatter.ofPattern("MMMM", Locale.getDefault())

    /** "From yesterday" / "From Fri, 16 Oct": where a carried-over task came from. */
    fun carriedLabel(from: String, today: String): String =
        shortLabel(from, today).let { if (it == "Yesterday") "From yesterday" else "From $it" }

    fun shortLabel(key: String, today: String): String = when (between(today, key)) {
        0L -> "Today"
        1L -> "Tomorrow"
        -1L -> "Yesterday"
        else -> if (key.take(4) == today.take(4)) shortSameYear.format(parse(key)) else shortOtherYear.format(parse(key))
    }

    fun fullLabel(key: String): String = full.format(parse(key))
    private val longNoWeekday = DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(Locale.getDefault())
    fun longDate(key: String): String = longNoWeekday.format(parse(key))
    fun monthYear(key: String): String = monthYear.format(parse(key))
    fun monthYear(m: YearMonth): String = monthYear.format(m.atDay(1))
    fun monthName(key: String): String = monthOnly.format(parse(key))

    fun weekdayLetters(): List<String> =
        listOf(DayOfWeek.SUNDAY, DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY)
            .map { it.getDisplayName(TextStyle.NARROW, Locale.getDefault()) }

    fun greeting(hour: Int = java.time.LocalTime.now().hour): String = when {
        hour < 5 -> "Working late"
        hour < 12 -> "Good morning"
        hour < 17 -> "Good afternoon"
        else -> "Good evening"
    }

    /** "Postpone" moves to the day after today, or after the task's own date if that is later. */
    fun postponeTarget(taskDate: String, today: String): String = addDays(if (taskDate > today) taskDate else today, 1)
}

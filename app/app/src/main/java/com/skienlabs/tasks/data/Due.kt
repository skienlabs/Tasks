package com.skienlabs.tasks.data

import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.format.TextStyle
import java.util.Locale

/** Time limits ("due at"): local date and time on the device, "2026-10-30T17:00". */
object Due {
    private val RE = Regex("""^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$""")
    private val FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm")

    fun parse(value: String?): LocalDateTime? {
        if (value == null || !RE.matches(value)) return null
        return runCatching { LocalDateTime.parse(value, FMT) }.getOrNull()?.takeIf { it.format(FMT) == value }
    }

    fun isValid(value: String?) = parse(value) != null

    fun format(t: LocalDateTime): String = t.withSecond(0).withNano(0).format(FMT)

    fun epochMillis(value: String?, zone: ZoneId = ZoneId.systemDefault()): Long? = parse(value)?.atZone(zone)?.toInstant()?.toEpochMilli()

    /** A first value when the time limit is switched on: 6 pm on the task's day, or an hour from now. */
    fun default(date: String?, now: LocalDateTime = LocalDateTime.now()): String {
        val day = runCatching { LocalDate.parse(date) }.getOrNull() ?: now.toLocalDate()
        val evening = day.atTime(18, 0)
        if (evening.isAfter(now.plusMinutes(30))) return format(evening)
        val soon = now.plusHours(1)
        val quarter = ((soon.minute + 14) / 15) * 15
        return format(soon.withMinute(0).plusMinutes(quarter.toLong()))
    }

    enum class Tone { LATER, SOON, OVER, MET, LATE }

    data class Info(val label: String, val full: String, val left: String, val tone: Tone)

    private fun span(ms: Long): String {
        val min = maxOf(1L, Math.round(ms / 60_000.0))
        if (min < 60) return "${min}m"
        val h = min / 60
        if (h < 24) return if (min % 60 != 0L && h < 10) "${h}h ${min % 60}m" else "${h}h"
        val d = h / 24
        return if (h % 24 != 0L && d < 3) "${d}d ${h % 24}h" else "${d}d"
    }

    private fun dayWord(t: LocalDateTime, now: LocalDateTime, locale: Locale): String {
        val d = t.toLocalDate()
        val today = now.toLocalDate()
        return when {
            d == today -> "Today"
            d == today.plusDays(1) -> "Tomorrow"
            d == today.minusDays(1) -> "Yesterday"
            Math.abs(Duration.between(now, t).toDays()) < 6 -> d.dayOfWeek.getDisplayName(TextStyle.SHORT, locale)
            d.year == today.year -> d.format(DateTimeFormatter.ofPattern("d MMM", locale))
            else -> d.format(DateTimeFormatter.ofPattern("d MMM yyyy", locale))
        }
    }

    /** "Fri 5:00 PM" with "2d left" / "overdue 3h"; done tasks say whether they made it. */
    fun describe(
        value: String?, now: LocalDateTime = LocalDateTime.now(), done: Boolean = false, completedAt: Long? = null,
        locale: Locale = Locale.getDefault(), zone: ZoneId = ZoneId.systemDefault(),
    ): Info? {
        val t = parse(value) ?: return null
        val time = t.toLocalTime().format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale))
        val label = "${dayWord(t, now, locale)} $time"
        val full = t.format(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.FULL, FormatStyle.SHORT).withLocale(locale))
        val dueMs = t.atZone(zone).toInstant().toEpochMilli()
        if (done) {
            val late = completedAt != null && completedAt > dueMs
            return Info(label, full, if (late) "finished ${span(completedAt!! - dueMs)} late" else "on time", if (late) Tone.LATE else Tone.MET)
        }
        val ms = Duration.between(now, t).toMillis()
        if (ms <= 0) return Info(label, full, "overdue ${span(-ms)}", Tone.OVER)
        return Info(label, full, "${span(ms)} left", if (ms < 86_400_000) Tone.SOON else Tone.LATER)
    }
}

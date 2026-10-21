package com.skienlabs.tasks.data

import java.text.Collator
import java.util.Locale

/**
 * The one order tasks are listed in, everywhere (day list, widgets, end-of-day summary), and the
 * same as the web app:
 *
 *  1. open, then done, then cancelled;
 *  2. priority: High, Medium, Low, None;
 *  3. company: tasks of the same tag together, tags A–Z, untagged last;
 *  4. title A–Z, with numbers read as numbers ("Server 9" before "Server 10").
 *
 * A task's company is its first tag in the user's own tag order.
 */
object TaskOrder {
    private val collator: Collator = Collator.getInstance(Locale.getDefault()).apply { strength = Collator.SECONDARY }

    /** Case-insensitive, accent-aware, with runs of digits compared by value. */
    fun natural(a: String, b: String): Int {
        val x = chunks(a)
        val y = chunks(b)
        for (i in 0 until minOf(x.size, y.size)) {
            val p = x[i]
            val q = y[i]
            val c = if (p[0].isDigit() && q[0].isDigit()) {
                val pt = p.trimStart('0')
                val qt = q.trimStart('0')
                if (pt.length != qt.length) pt.length - qt.length else pt.compareTo(qt)
            } else {
                collator.compare(p, q)
            }
            if (c != 0) return c
        }
        return x.size - y.size
    }

    private fun chunks(s: String): List<String> {
        val out = ArrayList<String>()
        var i = 0
        val t = s.trim()
        while (i < t.length) {
            val digit = t[i].isDigit()
            var j = i
            while (j < t.length && t[j].isDigit() == digit) j++
            out += t.substring(i, j)
            i = j
        }
        return out
    }

    /** The task's company: its first tag in [tags] (already in the user's order). */
    fun primaryTag(task: Task, tags: List<Tag>): Tag? = if (task.tagIds.isEmpty()) null else tags.firstOrNull { it.id in task.tagIds }

    private fun statusRank(t: Task) = when (t.status) {
        Status.PENDING -> 0
        Status.DONE -> 1
        else -> 2
    }

    /** Full order for a day list. */
    fun comparator(tags: List<Tag>): Comparator<Task> {
        val index = tags.withIndex().associate { (i, t) -> t.id to i }
        fun company(t: Task): Tag? {
            var best: Tag? = null
            var bestI = Int.MAX_VALUE
            for (id in t.tagIds) {
                val i = index[id] ?: continue
                if (i < bestI) { bestI = i; best = tags[i] }
            }
            return best
        }
        return Comparator { a, b ->
            var c = statusRank(a) - statusRank(b)
            if (c != 0) return@Comparator c
            c = a.priority.coerceIn(1, 4) - b.priority.coerceIn(1, 4)
            if (c != 0) return@Comparator c
            val ta = company(a)
            val tb = company(b)
            c = when {
                ta == null && tb == null -> 0
                ta == null -> 1
                tb == null -> -1
                else -> natural(ta.name, tb.name).takeIf { it != 0 } ?: ta.id.compareTo(tb.id)
            }
            if (c != 0) return@Comparator c
            c = natural(a.title, b.title)
            if (c != 0) return@Comparator c
            c = a.createdAt.compareTo(b.createdAt)
            if (c != 0) c else a.id.compareTo(b.id)
        }
    }
}

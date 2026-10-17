package com.skienlabs.tasks.data

import java.util.UUID

/**
 * Steps (sub-tasks) of a task: a small tree. Same rules as the server
 * (web/server/src/subtasks.js): only leaves are ticked by hand, a parent is done when all
 * of its children are, and the task is done when every leaf is.
 */
object Steps {
    const val MAX_STEPS = 100
    const val MAX_DEPTH = 4
    const val TITLE_MAX = 300

    data class Progress(val done: Int, val total: Int) {
        val complete get() = total > 0 && done == total
        val open get() = total - done
    }

    data class Row(val step: Subtask, val depth: Int, val leaf: Boolean)

    fun progress(list: List<Subtask>): Progress {
        if (list.isEmpty()) return Progress(0, 0)
        val parents = list.mapNotNullTo(HashSet()) { it.parentId }
        val leaves = list.filter { it.id !in parents }
        return Progress(leaves.count { it.done }, leaves.size)
    }

    fun depthOf(list: List<Subtask>, id: String): Int {
        val byId = list.associateBy { it.id }
        var d = 1
        var p = byId[id]?.parentId
        while (p != null && byId.containsKey(p) && d <= MAX_DEPTH + 1) {
            d++
            p = byId[p]?.parentId
        }
        return d
    }

    fun descendants(list: List<Subtask>, id: String): List<String> {
        val out = ArrayList<String>()
        fun walk(pid: String) {
            for (s in list) if (s.parentId == pid) {
                out += s.id
                walk(s.id)
            }
        }
        walk(id)
        return out
    }

    /** Recomputes parent "done" flags from their children. */
    fun normalize(list: List<Subtask>): List<Subtask> {
        if (list.isEmpty()) return list
        val byId = list.associateBy { it.id }
        val done = HashMap<String, Boolean>()
        fun isDone(s: Subtask, guard: Int = 0): Boolean = done.getOrPut(s.id) {
            val kids = list.filter { it.parentId == s.id }
            if (kids.isEmpty() || guard > MAX_DEPTH + 2) s.done else kids.all { isDone(it, guard + 1) }
        }
        return list.map { s -> isDone(byId.getValue(s.id)).let { if (it == s.done) s else s.copy(done = it) } }
    }

    /** Ticks a step; a step with sub-steps ticks (or unticks) all of them. */
    fun toggle(list: List<Subtask>, id: String): List<Subtask> {
        val target = list.firstOrNull { it.id == id } ?: return list
        val value = !target.done
        val ids = HashSet(descendants(list, id)).apply { add(id) }
        return normalize(list.map { if (it.id in ids) it.copy(done = value) else it })
    }

    fun setAll(list: List<Subtask>, done: Boolean) = normalize(list.map { it.copy(done = done) })

    /** Adds a step after its siblings; returns the same list if a limit is hit. */
    fun add(list: List<Subtask>, title: String, parentId: String? = null): List<Subtask> {
        val t = title.replace(Regex("\\s+"), " ").trim().take(TITLE_MAX)
        if (t.isEmpty() || list.size >= MAX_STEPS) return list
        if (parentId != null && (list.none { it.id == parentId } || depthOf(list, parentId) >= MAX_DEPTH)) return list
        val step = Subtask(UUID.randomUUID().toString(), parentId, t, false)
        var at = list.size
        if (parentId != null) {
            val sub = HashSet(descendants(list, parentId)).apply { add(parentId) }
            at = list.indexOfLast { it.id in sub } + 1
        }
        return normalize(list.subList(0, at) + step + list.subList(at, list.size))
    }

    fun remove(list: List<Subtask>, id: String): List<Subtask> {
        val gone = HashSet(descendants(list, id)).apply { add(id) }
        return normalize(list.filter { it.id !in gone })
    }

    fun rename(list: List<Subtask>, id: String, title: String): List<Subtask> {
        val t = title.replace(Regex("\\s+"), " ").trim().take(TITLE_MAX)
        if (t.isEmpty()) return list
        return list.map { if (it.id == id) it.copy(title = t) else it }
    }

    /** Tree in display order with depth. */
    fun flatten(list: List<Subtask>): List<Row> {
        val ids = list.mapTo(HashSet()) { it.id }
        val parents = list.mapNotNullTo(HashSet()) { it.parentId }
        val out = ArrayList<Row>(list.size)
        fun walk(pid: String?, depth: Int) {
            if (depth > MAX_DEPTH + 1) return
            for (s in list) {
                val p = s.parentId?.takeIf { it in ids } // an unknown parent shows at the top level
                if (p != pid) continue
                out += Row(s, depth, s.id !in parents)
                walk(s.id, depth + 1)
            }
        }
        walk(null, 0)
        return out
    }

    /** Status the server gives the task after its steps change (server resolveStatus). */
    fun statusAfter(current: String, list: List<Subtask>): String {
        val p = progress(list)
        if (p.total == 0 || current == Status.CANCELLED) return current
        return if (p.complete) Status.DONE else Status.PENDING
    }
}

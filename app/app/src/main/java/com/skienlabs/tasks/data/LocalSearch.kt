package com.skienlabs.tasks.data

import java.text.Normalizer

/**
 * Search over the tasks saved on the phone, for when the server can't be reached. It knows the
 * same basics as the server (words, "phrases", #tag, is:, p:) but only sees days opened before.
 */
object LocalSearch {
    private val accents = Regex("\\p{Mn}+")
    fun fold(s: String): String = accents.replace(Normalizer.normalize(s, Normalizer.Form.NFD), "").lowercase()

    private val STATUS = mapOf("open" to Status.PENDING, "pending" to Status.PENDING, "done" to Status.DONE, "cancelled" to Status.CANCELLED, "canceled" to Status.CANCELLED)
    private val PRIORITY = mapOf("high" to 1, "medium" to 2, "low" to 3, "none" to 4, "1" to 1, "2" to 2, "3" to 3, "4" to 4)

    /** Words and phrases to highlight for [q] (filters left out). */
    fun terms(q: String): List<String> = tokens(q).filterNot { it.startsWith("#") || it.contains(':') }.map { it.trim('"') }.filter { it.isNotBlank() }

    private fun tokens(q: String): List<String> =
        Regex("\"([^\"]*)\"?|(\\S+)").findAll(fold(q.take(200))).map { m -> m.groups[1]?.value?.trim() ?: m.value }.toList()

    /** date:today / tomorrow / yesterday / week / month / YYYY-MM-DD → first and last day. */
    private fun dateRange(v: String, today: String): Pair<String, String>? = when (v) {
        "today" -> today to today
        "tomorrow" -> Dates.addDays(today, 1).let { it to it }
        "yesterday" -> Dates.addDays(today, -1).let { it to it }
        "week" -> Dates.startOfWeek(today).let { it to Dates.addDays(it, 6) }
        "month" -> "${today.take(7)}-01" to "${today.take(7)}-31"
        else -> if (Dates.isValid(v)) v to v else null
    }

    fun search(q: String, tasks: Collection<Task>, tags: List<Tag>, today: String, limit: Int = 40): SearchResponse? {
        val words = mutableListOf<String>()
        val wantTags = mutableListOf<String>()
        var status: String? = null
        var priority: Int? = null
        var late = false
        var from: String? = null
        var to: String? = null
        val has = mutableSetOf<String>()
        for (t in tokens(q)) {
            val kv = t.split(':', limit = 2)
            val v = kv.getOrNull(1) ?: ""
            when {
                t.isBlank() -> Unit // an empty "" phrase
                kv.size == 2 && (kv[0] == "date" || kv[0] == "on") && dateRange(v, today) != null -> dateRange(v, today)!!.let { (a, b) -> from = a; to = b }
                kv.size == 2 && kv[0] == "before" && Dates.isValid(v) -> to = Dates.addDays(v, -1)
                kv.size == 2 && kv[0] == "after" && Dates.isValid(v) -> from = Dates.addDays(v, 1)
                kv.size == 2 && kv[0] == "has" && v in setOf("steps", "images", "notes") -> has += v
                t.startsWith("#") && t.length > 1 -> wantTags += t.drop(1)
                kv.size == 2 && kv[0] == "tag" && kv[1].isNotEmpty() -> wantTags += kv[1]
                kv.size == 2 && kv[0] == "is" && kv[1] in STATUS -> status = STATUS[kv[1]]
                kv.size == 2 && kv[0] == "is" && kv[1] == "late" -> late = true
                kv.size == 2 && (kv[0] == "p" || kv[0] == "priority") && kv[1] in PRIORITY -> priority = PRIORITY[kv[1]]
                else -> if (t.isNotBlank()) words += t.trim()
            }
        }
        if (words.isEmpty() && wantTags.isEmpty() && status == null && priority == null && !late && from == null && to == null && has.isEmpty()) return null
        val key = { name: String -> fold(name).replace(Regex("\\s+"), "") }
        val tagIds = wantTags.map { w -> tags.filter { key(it.name).startsWith(w) }.map { it.id } }
        val names = tags.associate { it.id to fold(it.name) }
        val hits = tasks.mapNotNull { t ->
            if (status != null && t.status != status) return@mapNotNull null
            if (priority != null && t.priority != priority) return@mapNotNull null
            if (late && !t.isCarried && !(t.isPending && t.date < today)) return@mapNotNull null
            if (from != null && t.date < from!!) return@mapNotNull null
            if (to != null && t.date > to!!) return@mapNotNull null
            if ("steps" in has && t.subtasks.isEmpty()) return@mapNotNull null
            if ("images" in has && t.attachments.isEmpty()) return@mapNotNull null
            if ("notes" in has && t.notes.isBlank()) return@mapNotNull null
            if (tagIds.any { ids -> ids.none { it in t.tagIds } }) return@mapNotNull null
            val title = fold(t.title)
            var score = 0
            var match: SearchMatch? = null
            for (w in words) {
                score += when {
                    title.startsWith(w) -> 40
                    title.split(Regex("[^\\p{L}\\p{N}]+")).any { it.startsWith(w) } -> 30
                    title.contains(w) -> 18
                    t.tagIds.any { names[it]?.contains(w) == true } -> 12
                    else -> {
                        val step = t.subtasks.firstOrNull { fold(it.title).contains(w) }
                        if (step != null) { match = match ?: SearchMatch("step", step.title); 8 }
                        else if (fold(t.notes).contains(w)) { match = match ?: SearchMatch("notes", t.notes.take(90)); 5 }
                        else return@mapNotNull null
                    }
                }
            }
            if (t.isPending) score += 6
            Triple(t, score, match)
        }.sortedWith(compareByDescending<Triple<Task, Int, SearchMatch?>> { it.second }.thenByDescending { it.first.date })
        val shown = hits.take(limit).map { (t, _, m) ->
            val o = AppJson.encodeToJsonElement(Task.serializer(), t) as kotlinx.serialization.json.JsonObject
            if (m == null) o else kotlinx.serialization.json.JsonObject(o + ("match" to AppJson.encodeToJsonElement(SearchMatch.serializer(), m)))
        }
        return SearchResponse(results = shown, total = hits.size, terms = words)
    }
}

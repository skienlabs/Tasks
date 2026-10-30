package com.skienlabs.tasks.notify

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.auth.FirebaseAuth
import com.skienlabs.tasks.BuildConfig
import com.skienlabs.tasks.MainActivity
import com.skienlabs.tasks.R
import com.skienlabs.tasks.auth.Auth
import com.skienlabs.tasks.data.Dates
import com.skienlabs.tasks.data.HttpTasksApi
import com.skienlabs.tasks.data.Prefs
import com.skienlabs.tasks.data.RoomCache
import com.skienlabs.tasks.data.Tag
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.data.TaskOrder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import java.time.LocalDateTime
import java.time.ZoneId

/**
 * End-of-day summary: a progress ring, a bar of done / open by priority, and the open tasks in
 * list order ("18 tasks still open · 3 of 21 done today · 15 from earlier days").
 * An alarm fires at the chosen time (default 21:00); the receiver fetches today's tasks
 * (falling back to the phone's saved copy when offline) and posts one notification.
 */
object DailySummary {
    const val CHANNEL = "daily-summary"
    private const val NOTIFICATION_ID = 21
    private const val ACTION_FIRE = "com.skienlabs.tasks.DAILY_SUMMARY"

    /** Next time to fire: today at [minutes] after midnight if still ahead (by 30 s), else tomorrow. */
    fun nextTrigger(minutes: Int, now: LocalDateTime = LocalDateTime.now()): LocalDateTime {
        val today = now.toLocalDate().atStartOfDay().plusMinutes(minutes.toLong())
        return if (today.isAfter(now.plusSeconds(30))) today else today.plusDays(1)
    }

    private fun pendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, SummaryReceiver::class.java).setAction(ACTION_FIRE)
        return PendingIntent.getBroadcast(context, 1, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    /** Sets (or clears) the alarm from the saved setting. Safe to call any time. */
    suspend fun reschedule(context: Context) {
        val pref = runCatching { Prefs(context).dailySummary.first() }.getOrNull() ?: return
        schedule(context, pref.enabled, pref.minutes)
    }

    fun schedule(context: Context, enabled: Boolean, minutes: Int) {
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        val pi = pendingIntent(context)
        alarms.cancel(pi)
        if (!enabled) return
        val at = nextTrigger(minutes).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        // Inexact but fires in Doze too; usually within a few minutes of the time.
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    }

    fun ensureChannel(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        if (nm.getNotificationChannel(CHANNEL) != null) return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "End-of-day summary", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "What you finished today and what's still open"
            },
        )
    }

    fun canNotify(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    /** One open task as the notification lists it. */
    data class Row(val title: String, val priority: Int, val note: String?)

    data class Content(
        val title: String,
        val text: String,
        /** Plain-text list (accessibility and older devices). */
        val lines: List<String>,
        val done: Int = 0,
        val total: Int = 0,
        /** Open tasks per priority: High, Medium, Low, None. */
        val open: List<Int> = listOf(0, 0, 0, 0),
        val earlier: Int = 0,
        val rows: List<Row> = emptyList(),
        val more: Int = 0,
    ) {
        val openCount get() = open.sum()
    }

    const val ROWS = 5
    private val LABELS = listOf("High", "Medium", "Low", "None")
    private val LEGEND = listOf("high", "medium", "low", "other")

    /** "since yesterday", "since Sun", "since 12 Oct": how long a carried-over task has waited. */
    fun since(from: String, today: String): String {
        val days = java.time.temporal.ChronoUnit.DAYS.between(java.time.LocalDate.parse(from), java.time.LocalDate.parse(today))
        val d = java.time.LocalDate.parse(from)
        return when {
            days <= 1L -> "since yesterday"
            days < 7L -> "since " + d.dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.getDefault())
            else -> "since " + d.format(java.time.format.DateTimeFormatter.ofPattern("d MMM", java.util.Locale.getDefault()))
        }
    }

    /** Builds the message, or null when nothing was planned (no notification then). */
    fun summarize(today: String, tasks: List<Task>, tags: List<Tag> = emptyList()): Content? {
        val unique = tasks.distinctBy { it.id }
        val day = unique.filter { it.date == today && !it.isCancelled }
        val overdue = unique.filter { it.isPending && it.date < today }
        val done = day.count { it.isDone }
        // Same order as the day list: priority, company (tag) A–Z, title A–Z.
        val open = (day.filter { it.isPending } + overdue).sortedWith(TaskOrder.comparator(tags))
        if (day.isEmpty() && overdue.isEmpty()) return null
        fun tasksWord(n: Int) = if (n == 1) "task" else "tasks"
        val byPriority = (1..4).map { p -> open.count { it.priority.coerceIn(1, 4) == p } }
        val total = day.size + overdue.size
        if (open.isEmpty()) {
            return Content(
                "All done for today", "You completed $done ${tasksWord(done)}. Nice work.", emptyList(),
                done = done, total = total, open = byPriority,
            )
        }
        // Leftovers move to today by themselves; count them with any still on an earlier day.
        val earlier = day.count { it.isPending && it.isCarried } + overdue.size
        val text = buildString {
            append(if (day.isNotEmpty()) "$done of $total done" else "Nothing was planned for today")
            if (earlier > 0) append(" · $earlier from earlier days")
        }
        fun waited(t: Task): String? = when {
            t.date < today -> since(t.date, today)
            t.isCarried -> since(t.carriedFrom!!, today)
            else -> null
        }
        // The note stays short so titles get the room: how long it has waited, else its company.
        val rows = open.take(ROWS).map { t ->
            Row(t.title, t.priority.coerceIn(1, 4), waited(t) ?: TaskOrder.primaryTag(t, tags)?.name)
        }
        val lines = open.take(6).map { t ->
            buildString {
                if (t.priority < 4) append(LABELS[t.priority - 1]).append(" · ")
                append(t.title)
                waited(t)?.let { append(" (").append(it).append(")") }
            }
        } + if (open.size > 6) listOf("and ${open.size - 6} more") else emptyList()
        return Content(
            "${open.size} ${tasksWord(open.size)} still open", text, lines,
            done = done, total = total, open = byPriority, earlier = earlier, rows = rows, more = (open.size - ROWS).coerceAtLeast(0),
        )
    }

    // ---- Drawing ------------------------------------------------------------------------
    // Mid-tone colours that read on both light and dark notification shades.
    private const val DONE = 0xFF34A853.toInt()
    private val PRIORITY = intArrayOf(0xFFEA4335.toInt(), 0xFFF9AB00.toInt(), 0xFF4285F4.toInt(), 0xFF9AA0A6.toInt())
    private const val TRACK = 0x4D9AA0A6

    private fun px(context: Context, dp: Float) = (dp * context.resources.displayMetrics.density).toInt().coerceAtLeast(1)

    /** Ring: the done share in green over a grey track. */
    fun ring(context: Context, c: Content, sizeDp: Float): android.graphics.Bitmap {
        val size = px(context, sizeDp)
        val bmp = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(bmp)
        val w = size * 0.13f
        val r = android.graphics.RectF(w / 2, w / 2, size - w / 2, size - w / 2)
        val p = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { style = android.graphics.Paint.Style.STROKE; strokeWidth = w }
        p.color = TRACK
        canvas.drawArc(r, 0f, 360f, false, p)
        val total = c.total.coerceAtLeast(1)
        if (c.done > 0) {
            p.strokeCap = android.graphics.Paint.Cap.ROUND
            p.color = DONE
            canvas.drawArc(r, -90f, 360f * c.done / total, false, p)
        }
        return bmp
    }

    /** Bar: done, then the open tasks by priority, in proportion. */
    fun bar(context: Context, c: Content): android.graphics.Bitmap {
        val w = px(context, 320f)
        val h = px(context, 8f)
        val bmp = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(bmp)
        val p = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
        val path = android.graphics.Path().apply { addRoundRect(0f, 0f, w.toFloat(), h.toFloat(), h / 2f, h / 2f, android.graphics.Path.Direction.CW) }
        canvas.clipPath(path)
        p.color = TRACK
        canvas.drawRect(0f, 0f, w.toFloat(), h.toFloat(), p)
        val parts = listOf(c.done to DONE) + c.open.mapIndexed { i, n -> n to PRIORITY[i] }
        val total = parts.sumOf { it.first }.coerceAtLeast(1)
        var x = 0f
        val gap = px(context, 2f).toFloat()
        parts.filter { it.first > 0 }.forEach { (n, color) ->
            val seg = w.toFloat() * n / total
            p.color = color
            canvas.drawRect(x, 0f, (x + seg - gap).coerceAtLeast(x + 1f), h.toFloat(), p)
            x += seg
        }
        return bmp
    }

    private fun dotted(parts: List<Pair<String, Int>>): CharSequence {
        val sb = android.text.SpannableStringBuilder()
        parts.forEachIndexed { i, (label, color) ->
            if (i > 0) sb.append("  ")
            val start = sb.length
            sb.append("● ")
            sb.setSpan(android.text.style.ForegroundColorSpan(color), start, start + 1, android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            sb.append(label)
        }
        return sb
    }

    /** The collapsed and expanded views of the notification. */
    fun views(context: Context, c: Content): Pair<android.widget.RemoteViews, android.widget.RemoteViews> {
        val pkg = context.packageName
        val small = android.widget.RemoteViews(pkg, R.layout.notif_summary_small).apply {
            setImageViewBitmap(R.id.ring, ring(context, c, 40f))
            setTextViewText(R.id.title, c.title)
            setTextViewText(R.id.text, c.text)
        }
        val big = android.widget.RemoteViews(pkg, R.layout.notif_summary_big).apply {
            setImageViewBitmap(R.id.ring, ring(context, c, 64f))
            setTextViewText(R.id.ring_label, "${c.done}/${c.total}")
            setContentDescription(R.id.ring_label, "${c.done} of ${c.total} done")
            setTextViewText(R.id.title, c.title)
            setTextViewText(R.id.text, c.text)
            setImageViewBitmap(R.id.bar, bar(context, c))
            // Open tasks per priority (the ring and the line above already say how many are done).
            val legend = buildList {
                c.open.forEachIndexed { i, n -> if (n > 0) add("$n ${LEGEND[i]}" to PRIORITY[i]) }
                if (isEmpty() && c.done > 0) add("${c.done} done" to DONE)
            }
            setTextViewText(R.id.legend, dotted(legend))
            val rowIds = listOf(
                Triple(R.id.row1, R.id.row1_title, R.id.row1_note) to R.id.row1_dot,
                Triple(R.id.row2, R.id.row2_title, R.id.row2_note) to R.id.row2_dot,
                Triple(R.id.row3, R.id.row3_title, R.id.row3_note) to R.id.row3_dot,
                Triple(R.id.row4, R.id.row4_title, R.id.row4_note) to R.id.row4_dot,
                Triple(R.id.row5, R.id.row5_title, R.id.row5_note) to R.id.row5_dot,
            )
            rowIds.forEachIndexed { i, (ids, dot) ->
                val row = c.rows.getOrNull(i)
                setViewVisibility(ids.first, if (row == null) android.view.View.GONE else android.view.View.VISIBLE)
                if (row != null) {
                    setTextColor(dot, PRIORITY[row.priority - 1])
                    setTextViewText(ids.second, row.title)
                    setTextViewText(ids.third, row.note ?: "")
                    setViewVisibility(ids.third, if (row.note == null) android.view.View.GONE else android.view.View.VISIBLE)
                    setContentDescription(ids.first, "${LABELS[row.priority - 1]} priority: ${row.title}" + (row.note?.let { ", $it" } ?: ""))
                }
            }
            setViewVisibility(R.id.rows, if (c.rows.isEmpty()) android.view.View.GONE else android.view.View.VISIBLE)
            setViewVisibility(R.id.more, if (c.more > 0) android.view.View.VISIBLE else android.view.View.GONE)
            setTextViewText(R.id.more, "+ ${c.more} more · tap to see them all")
        }
        return small to big
    }

    /** Fetches today's tasks and posts the notification. */
    suspend fun run(context: Context) {
        val user = runCatching { FirebaseAuth.getInstance().currentUser }.getOrNull() ?: return
        if (!canNotify(context) || BuildConfig.API_URL.isBlank()) return
        val today = Dates.today()
        val cached = runCatching { withTimeout(2000) { RoomCache.get(context).load(user.uid, today, today, today) } }.getOrNull()
        var tags = cached?.tags?.sortedWith(compareBy({ it.position }, { it.createdAt })) ?: emptyList()
        val tasks = withTimeoutOrNull(6000) {
            runCatching {
                val api = HttpTasksApi(BuildConfig.API_URL, Auth(context))
                val res = api.day(today, today)
                runCatching { tags = api.tags().tags.sortedWith(compareBy({ it.position }, { it.createdAt })) }
                res.tasks + res.overdue
            }.getOrNull()
        } ?: cached?.tasks // Offline: the phone's saved copy (as of the last time the app synced).
            ?: return
        val content = summarize(today, tasks, tags) ?: return
        post(context, content)
    }

    private fun post(context: Context, c: Content) {
        ensureChannel(context)
        val open = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val (small, big) = views(context, c)
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFF0B57D0.toInt())
            .setSubText("End of day")
            // Title and text stay set: the lock screen, accessibility and watches use them.
            .setContentTitle(c.title)
            .setContentText(c.text)
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(small)
            .setCustomBigContentView(big)
            .setContentIntent(open)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, n)
        } catch (e: SecurityException) {
            // Permission was revoked between the check and now.
        }
    }
}

/** Fires at the chosen time: posts the summary and sets tomorrow's alarm. */
class SummaryReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        val done = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                DailySummary.reschedule(app) // first, so tomorrow's alarm is set even if this run fails
                DailySummary.run(app)
                runCatching { com.skienlabs.tasks.widget.Widgets.updateAll(app) }
            } catch (e: Exception) {
                // Never crash in the background.
            } finally {
                done.finish()
            }
        }
    }
}

/** Alarms are lost on reboot and must follow clock / time zone changes. */
class RescheduleReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        val done = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                DailySummary.reschedule(app)
                if (com.google.firebase.auth.FirebaseAuth.getInstance().currentUser != null) TeamNotices.schedule(app)
                // Time limit reminders, from the phone's saved copy.
                runCatching {
                    val uid = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.uid
                    if (uid != null) DueReminders.schedule(app, RoomCache.get(app).loadAll(uid).tasks)
                }
                com.skienlabs.tasks.widget.Widgets.updateAll(app) // the date may have changed
            } catch (e: Exception) {
                // ignore
            } finally {
                done.finish()
            }
        }
    }
}

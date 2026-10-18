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
import com.skienlabs.tasks.data.Task
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
 * End-of-day summary: "3 tasks still open · you completed 4 of 7 · high priority: …".
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

    data class Content(val title: String, val text: String, val lines: List<String>)

    /** Builds the message, or null when nothing was planned (no notification then). */
    fun summarize(today: String, tasks: List<Task>): Content? {
        val unique = tasks.distinctBy { it.id }
        val day = unique.filter { it.date == today && !it.isCancelled }
        val overdue = unique.filter { it.isPending && it.date < today }
        val done = day.count { it.isDone }
        val open = (day.filter { it.isPending } + overdue).sortedWith(compareBy<Task>({ it.priority }, { it.date }, { it.createdAt }))
        if (day.isEmpty() && overdue.isEmpty()) return null
        fun tasksWord(n: Int) = if (n == 1) "task" else "tasks"
        if (open.isEmpty()) {
            return Content("All done for today", "You completed $done ${tasksWord(done)}. Nice work.", emptyList())
        }
        val high = open.filter { it.priority == 1 }
        val text = buildString {
            append(if (day.isNotEmpty()) "You completed $done of ${day.size} today." else "Nothing was planned for today.")
            // Leftovers move to today by themselves; count them with any still on an earlier day.
            val earlier = day.count { it.isPending && it.isCarried } + overdue.size
            if (earlier > 0) append(" $earlier from earlier days.")
            if (high.isNotEmpty()) append(" High priority: " + high.take(3).joinToString(", ") { it.title } + if (high.size > 3) "…" else "")
        }
        val labels = mapOf(1 to "High", 2 to "Medium", 3 to "Low")
        val lines = open.take(6).map { t ->
            buildString {
                labels[t.priority]?.let { append(it).append(" · ") }
                append(t.title)
                if (t.date < today) append(" (").append(Dates.shortLabel(t.date, today)).append(")")
                else if (t.isCarried) append(" (").append(Dates.carriedLabel(t.carriedFrom!!, today).replaceFirstChar { it.lowercase() }).append(")")
            }
        } + if (open.size > 6) listOf("and ${open.size - 6} more") else emptyList()
        return Content("${open.size} ${tasksWord(open.size)} still open", text, lines)
    }

    /** Fetches today's tasks and posts the notification. */
    suspend fun run(context: Context) {
        val user = runCatching { FirebaseAuth.getInstance().currentUser }.getOrNull() ?: return
        if (!canNotify(context) || BuildConfig.API_URL.isBlank()) return
        val today = Dates.today()
        val tasks = withTimeoutOrNull(6000) {
            runCatching {
                val res = HttpTasksApi(BuildConfig.API_URL, Auth(context)).day(today, today)
                res.tasks + res.overdue
            }.getOrNull()
        } ?: runCatching {
            // Offline: the phone's saved copy (as of the last time the app synced).
            withTimeout(2000) { RoomCache.get(context).load(user.uid, today, today, today).tasks }
        }.getOrNull() ?: return
        val content = summarize(today, tasks) ?: return
        post(context, content)
    }

    private fun post(context: Context, c: Content) {
        ensureChannel(context)
        val open = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val style = NotificationCompat.InboxStyle().setSummaryText(c.text.takeIf { c.lines.isNotEmpty() })
        c.lines.forEach { style.addLine(it) }
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFF0B57D0.toInt())
            .setContentTitle(c.title)
            .setContentText(c.text)
            .setStyle(if (c.lines.isEmpty()) NotificationCompat.BigTextStyle().bigText(c.text) else style)
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
                com.skienlabs.tasks.widget.Widgets.updateAll(app) // the date may have changed
            } catch (e: Exception) {
                // ignore
            } finally {
                done.finish()
            }
        }
    }
}

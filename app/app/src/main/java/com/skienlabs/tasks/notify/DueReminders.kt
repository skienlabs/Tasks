package com.skienlabs.tasks.notify

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.auth.FirebaseAuth
import com.skienlabs.tasks.MainActivity
import com.skienlabs.tasks.R
import com.skienlabs.tasks.data.Due
import com.skienlabs.tasks.data.RoomCache
import com.skienlabs.tasks.data.Task
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import java.time.ZoneId

/**
 * Time limit reminders: an hour before a task's time limit and when it's reached, for open
 * tasks on this phone (works offline: it reads the saved copy). One alarm is set for the next
 * reminder; when it fires it posts what's due and sets the following one.
 */
object DueReminders {
    const val CHANNEL = "deadlines"
    private const val ACTION_FIRE = "com.skienlabs.tasks.DUE_REMINDER"
    private const val PREFS = "due-reminders"
    private const val SOON_MS = 60 * 60_000L
    /** Reminders missed by more than this (phone off, alarm late) aren't posted any more. */
    private const val STALE_MS = 30 * 60_000L

    enum class Kind { SOON, DUE }

    data class Event(val taskId: String, val title: String, val at: Long, val kind: Kind)

    /** Every reminder of these tasks: an hour before (if there's still an hour) and at the time limit. */
    fun events(tasks: Collection<Task>, zone: ZoneId = ZoneId.systemDefault()): List<Event> = tasks.asSequence()
        .filter { it.isPending && it.dueAt != null }
        .flatMap { t ->
            val due = Due.epochMillis(t.dueAt, zone) ?: return@flatMap emptySequence()
            sequenceOf(Event(t.id, t.title, due - SOON_MS, Kind.SOON), Event(t.id, t.title, due, Kind.DUE))
        }
        .sortedBy { it.at }
        .toList()

    /** Which reminders to post when the alarm fires at [now], having posted everything up to [last]. */
    fun due(events: List<Event>, last: Long, now: Long): List<Event> {
        val from = maxOf(last, now - STALE_MS)
        return events.filter { it.at > from && it.at <= now + 60_000 }
            // One notice per task: "time's up" wins over "an hour left" when both are due.
            .groupBy { it.taskId }.values.map { list -> list.maxBy { it.at } }
    }

    private fun pendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, DueReceiver::class.java).setAction(ACTION_FIRE)
        return PendingIntent.getBroadcast(context, 2, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    /** Sets the alarm for the next reminder of [tasks] (or clears it when there's none). */
    fun schedule(context: Context, tasks: Collection<Task>, now: Long = System.currentTimeMillis()) {
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        val pi = pendingIntent(context)
        alarms.cancel(pi)
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val last = prefs.getLong("last", 0L)
        if (last == 0L) prefs.edit().putLong("last", now).apply()
        // (A "last" in the future means the clock was turned back: don't let it silence reminders.)
        val next = events(tasks).firstOrNull { it.at > maxOf(now, minOf(last, now + 60_000)) } ?: return
        // Inexact but fires in Doze too; usually within a few minutes.
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.at, pi)
    }

    fun cancel(context: Context) {
        context.getSystemService(AlarmManager::class.java)?.cancel(pendingIntent(context))
    }

    private fun ensureChannel(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        if (nm.getNotificationChannel(CHANNEL) != null) return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Time limits", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "An hour before a task's time limit, and when it's reached"
            },
        )
    }

    /** The alarm fired: post what's due now and set the next one. */
    suspend fun fire(context: Context) {
        val user = runCatching { FirebaseAuth.getInstance().currentUser }.getOrNull() ?: return
        val tasks = runCatching { withTimeout(3000) { RoomCache.get(context).loadAll(user.uid).tasks } }.getOrNull() ?: return
        val now = System.currentTimeMillis()
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val list = due(events(tasks), prefs.getLong("last", now - 60_000), now)
        prefs.edit().putLong("last", now + 60_000).apply()
        if (DailySummary.canNotify(context)) list.forEach { post(context, it) }
        schedule(context, tasks, now + 60_000)
    }

    private fun post(context: Context, e: Event) {
        ensureChannel(context)
        val open = PendingIntent.getActivity(
            context, e.taskId.hashCode(),
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFF0B57D0.toInt())
            .setContentTitle(if (e.kind == Kind.DUE) "Time's up" else "1 hour left")
            .setContentText(e.title)
            .setStyle(NotificationCompat.BigTextStyle().bigText(e.title))
            .setContentIntent(open)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        try {
            NotificationManagerCompat.from(context).notify("due:${e.taskId}", 7, n)
        } catch (_: SecurityException) {
            // Permission was revoked between the check and now.
        }
    }
}

class DueReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        val done = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                DueReminders.fire(app)
            } catch (_: Exception) {
                // Never crash in the background.
            } finally {
                done.finish()
            }
        }
    }
}

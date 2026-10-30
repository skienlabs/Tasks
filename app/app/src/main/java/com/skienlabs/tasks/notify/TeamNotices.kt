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
import com.skienlabs.tasks.BuildConfig
import com.skienlabs.tasks.MainActivity
import com.skienlabs.tasks.R
import com.skienlabs.tasks.auth.Auth
import com.skienlabs.tasks.data.AppJson
import com.skienlabs.tasks.data.AppNotification
import com.skienlabs.tasks.data.HttpTasksApi
import com.skienlabs.tasks.data.NotificationsResponse
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

/**
 * Team news on the phone while the app is closed: about every 15 minutes (as Android allows) it
 * asks the server for new notifications (a task given to me, a comment, a review, a reminder,
 * the admins' morning summary) and posts them. While the app is open they arrive live instead,
 * and are marked as seen so they aren't posted twice.
 */
object TeamNotices {
    const val CHANNEL = "team"
    const val EXTRA_TEAM = "com.skienlabs.tasks.TEAM"
    const val EXTRA_TASK = "com.skienlabs.tasks.TASK"
    private const val ACTION_CHECK = "com.skienlabs.tasks.TEAM_CHECK"
    private const val PREFS = "team-notices"

    private fun pendingIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
        context, 41, Intent(context, TeamNoticesReceiver::class.java).setAction(ACTION_CHECK),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    /** Starts (or keeps) the regular check. Inexact, so Android batches it with other work. */
    fun schedule(context: Context) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        am.setInexactRepeating(
            AlarmManager.ELAPSED_REALTIME, android.os.SystemClock.elapsedRealtime() + AlarmManager.INTERVAL_FIFTEEN_MINUTES,
            AlarmManager.INTERVAL_FIFTEEN_MINUTES, pendingIntent(context),
        )
    }

    fun cancel(context: Context) {
        context.getSystemService(AlarmManager::class.java)?.cancel(pendingIntent(context))
    }

    /** The newest notification this phone has shown (or the app has seen), per account. */
    fun markSeen(context: Context, uid: String?, id: Long) {
        if (uid == null) return
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (id > p.getLong("seen:$uid", 0)) p.edit().putLong("seen:$uid", id).apply()
    }

    /** What to post: unread, newer than the last seen, oldest first, at most [max]. */
    fun toPost(list: List<AppNotification>, seen: Long, max: Int = 5): List<AppNotification> =
        list.filter { !it.read && it.id > seen }.sortedBy { it.id }.takeLast(max)

    suspend fun check(context: Context) {
        val user = runCatching { FirebaseAuth.getInstance().currentUser }.getOrNull() ?: return
        if (BuildConfig.API_URL.isBlank()) return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val seen = prefs.getLong("seen:${user.uid}", -1)
        val api = HttpTasksApi(BuildConfig.API_URL, Auth(context))
        val res = withTimeout(8000) { api.json("GET", "/api/notifications?limit=20") } ?: return
        val list = AppJson.decodeFromJsonElement(NotificationsResponse.serializer(), res).notifications
        val newest = list.maxOfOrNull { it.id } ?: return
        // The first check after installing only remembers where things stand.
        if (seen >= 0 && DailySummary.canNotify(context)) toPost(list, seen).forEach { post(context, it) }
        markSeen(context, user.uid, newest)
    }

    private fun ensureChannel(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        if (nm.getNotificationChannel(CHANNEL) != null) return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Team news", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Tasks given to you, comments, reviews and reminders from your teams"
            },
        )
    }

    private fun post(context: Context, n: AppNotification) {
        ensureChannel(context)
        val open = PendingIntent.getActivity(
            context, n.id.toInt(),
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra(EXTRA_TEAM, n.teamId).putExtra(EXTRA_TASK, n.taskId),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val built = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFF0B57D0.toInt())
            .setContentTitle(n.title)
            .setContentText(n.body ?: "")
            .setStyle(NotificationCompat.BigTextStyle().bigText(n.body ?: ""))
            .setWhen(n.createdAt)
            .setShowWhen(true)
            .setContentIntent(open)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_SOCIAL)
            .build()
        try {
            NotificationManagerCompat.from(context).notify("team:${n.id}", 9, built)
        } catch (_: SecurityException) {
            // Permission was revoked meanwhile.
        }
    }
}

class TeamNoticesReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        val done = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                TeamNotices.check(app)
            } catch (_: Exception) {
                // Offline or signed out: try again next time. Never crash in the background.
            } finally {
                done.finish()
            }
        }
    }
}

package com.skienlabs.tasks

import android.app.Application
import com.skienlabs.tasks.notify.DailySummary
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class TasksApp : Application() {
    /** Created on first use, on the main thread, so app start stays light. */
    val controller: AppController by lazy { AppController(this).also { it.start() } }

    override fun onCreate() {
        super.onCreate()
        // Keep the end-of-day alarm set (it's cleared by updates, force-stops and some battery savers).
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch { runCatching { DailySummary.reschedule(this@TasksApp) } }
    }
}

package com.skienlabs.tasks

import android.app.Application

class TasksApp : Application() {
    /** Created on first use, on the main thread, so app start stays light. */
    val controller: AppController by lazy { AppController(this).also { it.start() } }
}

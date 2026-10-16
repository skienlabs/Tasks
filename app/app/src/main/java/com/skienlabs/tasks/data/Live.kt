package com.skienlabs.tasks.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.Request
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.util.concurrent.TimeUnit

/**
 * Live sync: keeps a stream to /api/events while the app is in the foreground and reports what
 * changed on other devices. Every (re)connect triggers a refresh, so nothing is missed while away.
 * Callbacks are delivered on [scope] (the main thread).
 */
class LiveSync(
    private val baseUrl: String,
    private val api: HttpTasksApi,
    private val scope: CoroutineScope,
    private val onChange: (Change) -> Unit,
    private val onConnected: () -> Unit,
) {
    private val client = api.client.newBuilder()
        .readTimeout(0, TimeUnit.MILLISECONDS) // the stream stays open; the server pings every 25 s
        .callTimeout(0, TimeUnit.MILLISECONDS)
        .build()
    private var source: EventSource? = null
    private var job: Job? = null
    private var running = false
    private var retryMs = 1000L
    private var forceToken = false

    fun start() {
        if (running) return
        running = true
        retryMs = 1000
        connect()
    }

    fun stop() {
        running = false
        job?.cancel()
        job = null
        source?.cancel()
        source = null
    }

    private fun connect() {
        job?.cancel()
        job = scope.launch {
            if (!running) return@launch
            val headers = runCatching { api.authHeaders(forceToken) }.getOrNull()
            forceToken = false
            if (headers == null || !headers.containsKey("Authorization")) {
                scheduleRetry()
                return@launch
            }
            val request = Request.Builder().url("$baseUrl/api/events").apply { headers.forEach { (k, v) -> header(k, v) } }.build()
            source?.cancel()
            source = EventSources.createFactory(client).newEventSource(request, listener)
        }
    }

    private fun scheduleRetry() {
        if (!running) return
        val wait = retryMs
        retryMs = (retryMs * 2).coerceAtMost(30_000)
        job = scope.launch {
            delay(wait)
            connect()
        }
    }

    private val listener = object : EventSourceListener() {
        override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
            scope.launch {
                if (eventSource !== source) return@launch
                when (type) {
                    "ready" -> {
                        retryMs = 1000
                        onConnected()
                    }
                    "change" -> {
                        val change = runCatching { AppJson.decodeFromString(Change.serializer(), data) }.getOrNull() ?: return@launch
                        if (change.source != api.clientId) onChange(change)
                    }
                }
            }
        }

        override fun onClosed(eventSource: EventSource) {
            scope.launch { if (eventSource === source) scheduleRetry() } // server ends streams hourly to re-check sign-in
        }

        override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
            val unauthorized = response?.code == 401
            response?.close()
            scope.launch {
                if (eventSource !== source) return@launch
                if (unauthorized) forceToken = true
                scheduleRetry()
            }
        }
    }
}

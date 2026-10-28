package com.skienlabs.tasks.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class ApiException(val status: Int, message: String) : Exception(message)

val AppJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
}

/** Everything the app asks of the server. An interface so tests can swap in a fake. */
interface TasksApi {
    suspend fun me(): Profile
    suspend fun updateMe(name: String? = null, onboarded: Boolean? = null): Profile
    suspend fun day(date: String, today: String): DayResponse
    suspend fun summary(from: String, to: String): SummaryResponse
    suspend fun stats(from: String, to: String, today: String): Stats
    suspend fun createTask(body: JsonObject): Task
    suspend fun updateTask(id: String, patch: JsonObject): Task
    /** [from]: the task's day when it was postponed, so sending it twice moves it once. */
    suspend fun postpone(id: String, today: String, from: String? = null): Task
    suspend fun deleteTask(id: String)
    suspend fun tags(): TagsResponse
    suspend fun createTag(body: JsonObject): Tag
    suspend fun updateTag(id: String, patch: JsonObject): Tag
    suspend fun deleteTag(id: String)
    /** Uploads an image; returns the task with its updated image list. */
    suspend fun addAttachment(taskId: String, body: JsonObject): Task
    /** Deletes an image; returns the task, or null if the task itself no longer exists. */
    suspend fun deleteAttachment(id: String): Task?
    /** Image file bytes; [size] is "thumb" or "full". */
    suspend fun image(id: String, size: String): ByteArray
    /** Searches every task; the app falls back to what it has saved when this fails. */
    suspend fun search(q: String, today: String, limit: Int = 40): SearchResponse =
        throw ApiException(0, "Search needs a connection")
    /** Everything in the account (after carry-over), for the offline copy. */
    suspend fun sync(today: String): SyncResponse = throw ApiException(0, "You appear to be offline")

    // Teams (online only; the server checks every permission).
    suspend fun teams(): TeamsResponse = throw ApiException(0, "You appear to be offline")
    suspend fun createTeam(body: JsonObject): Team = throw ApiException(0, "You appear to be offline")
    suspend fun updateTeam(id: String, body: JsonObject): Team = throw ApiException(0, "You appear to be offline")
    suspend fun deleteTeam(id: String): Unit = throw ApiException(0, "You appear to be offline")
    suspend fun invite(teamId: String, emails: List<String>, role: String): InviteResult = throw ApiException(0, "You appear to be offline")
    suspend fun cancelInvite(teamId: String, inviteId: String): Team = throw ApiException(0, "You appear to be offline")
    suspend fun acceptInvite(id: String): AcceptResult = throw ApiException(0, "You appear to be offline")
    suspend fun declineInvite(id: String): Unit = throw ApiException(0, "You appear to be offline")
    suspend fun setRole(teamId: String, uid: String, role: String): Team = throw ApiException(0, "You appear to be offline")
    suspend fun removeMember(teamId: String, uid: String): Unit = throw ApiException(0, "You appear to be offline")
    suspend fun board(teamId: String, from: String, to: String): BoardResponse = throw ApiException(0, "You appear to be offline")
    suspend fun assign(teamId: String, body: JsonObject): Task = throw ApiException(0, "You appear to be offline")
    suspend fun updateTeamTask(teamId: String, taskId: String, patch: JsonObject): Task = throw ApiException(0, "You appear to be offline")
    suspend fun deleteTeamTask(teamId: String, taskId: String): Unit = throw ApiException(0, "You appear to be offline")
}

/** Supplies the Firebase ID token; `force` asks Firebase for a fresh one. */
fun interface TokenProvider {
    suspend fun token(force: Boolean): String?
}

class HttpTasksApi(
    private val baseUrl: String,
    private val tokens: TokenProvider,
    val client: OkHttpClient = defaultClient(),
) : TasksApi {

    /** Random per app launch; lets the app ignore live-sync events it caused itself. */
    val clientId: String = "android-" + UUID.randomUUID().toString()

    companion object {
        private val JSON_TYPE = "application/json".toMediaType()

        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .callTimeout(40, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }

    suspend fun authHeaders(force: Boolean = false): Map<String, String> {
        val headers = mutableMapOf("X-Client-Id" to clientId)
        val token = try {
            tokens.token(force)
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            // Firebase couldn't refresh the sign-in (no network to Google, clock wrong, ...).
            throw ApiException(0, "Couldn't confirm your sign-in. Check your connection and try again.")
        }
        token?.let { headers["Authorization"] = "Bearer $it" }
        return headers
    }

    private suspend fun send(method: String, path: String, body: JsonElement?, force: Boolean, http: OkHttpClient = client): Response {
        val builder = Request.Builder().url(baseUrl + path)
        authHeaders(force).forEach { (k, v) -> builder.header(k, v) }
        val requestBody = body?.let { AppJson.encodeToString(JsonElement.serializer(), it).toRequestBody(JSON_TYPE) }
        builder.method(method, requestBody ?: if (method == "POST" || method == "PATCH") "{}".toRequestBody(JSON_TYPE) else null)
        return http.newCall(builder.build()).await()
    }

    // The whole exchange runs on IO: a large reply (a tag logo, a full day) is still streaming in
    // after the headers arrive, and reading it on the main thread throws NetworkOnMainThreadException.
    private suspend fun <T> call(method: String, path: String, body: JsonElement?, serializer: KSerializer<T>?, http: OkHttpClient = client): T? =
        withContext(Dispatchers.IO) { callBlocking(method, path, body, serializer, http) }

    private suspend fun <T> callBlocking(method: String, path: String, body: JsonElement?, serializer: KSerializer<T>?, http: OkHttpClient): T? {
        val response = try {
            var res = send(method, path, body, force = false, http = http)
            if (res.code == 401) { // the token may have just expired: refresh once and retry
                res.close()
                res = send(method, path, body, force = true, http = http)
            }
            res
        } catch (e: IOException) {
            throw ApiException(0, "You appear to be offline")
        } catch (e: ApiException) {
            throw e
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            // Anything else from the network stack: say what it was rather than a generic failure.
            throw ApiException(0, "Couldn't reach Tasks (${e.message ?: e.javaClass.simpleName})")
        }
        response.use { res ->
            val text = try {
                res.body.string()
            } catch (e: IOException) {
                throw ApiException(0, "You appear to be offline")
            }
            if (!res.isSuccessful) {
                val msg = runCatching { AppJson.decodeFromString(ErrorBody.serializer(), text).error }.getOrNull()
                throw ApiException(res.code, msg ?: "Request failed (${res.code})")
            }
            if (serializer == null || res.code == 204 || text.isBlank()) return null
            return try {
                AppJson.decodeFromString(serializer, text)
            } catch (e: Exception) {
                throw ApiException(res.code, "Unexpected server response")
            }
        }
    }

    private suspend fun <T> req(method: String, path: String, body: JsonElement?, s: KSerializer<T>): T =
        call(method, path, body, s) ?: throw ApiException(0, "Empty server response")

    override suspend fun me() = req("GET", "/api/me", null, Profile.serializer())
    override suspend fun updateMe(name: String?, onboarded: Boolean?) = req("PATCH", "/api/me", buildJsonObject {
        name?.let { put("name", it) }
        onboarded?.let { put("onboarded", it) }
    }, Profile.serializer())
    override suspend fun day(date: String, today: String) = req("GET", "/api/tasks?date=$date&today=$today", null, DayResponse.serializer())
    override suspend fun summary(from: String, to: String) = req("GET", "/api/summary?from=$from&to=$to", null, SummaryResponse.serializer())
    override suspend fun search(q: String, today: String, limit: Int) = req(
        "GET", "/api/search?q=${java.net.URLEncoder.encode(q, "UTF-8").replace("+", "%20")}&today=$today&limit=${limit.coerceIn(1, 100)}",
        null, SearchResponse.serializer(),
    )
    override suspend fun stats(from: String, to: String, today: String) = req("GET", "/api/stats?from=$from&to=$to&today=$today", null, Stats.serializer())
    override suspend fun createTask(body: JsonObject) = req("POST", "/api/tasks", body, Task.serializer())
    override suspend fun updateTask(id: String, patch: JsonObject) = req("PATCH", "/api/tasks/$id", patch, Task.serializer())
    override suspend fun postpone(id: String, today: String, from: String?) = req("POST", "/api/tasks/$id/postpone", buildJsonObject {
        put("today", today)
        from?.let { put("from", it) }
    }, Task.serializer())
    override suspend fun sync(today: String) = req("GET", "/api/sync?today=$today", null, SyncResponse.serializer())
    override suspend fun deleteTask(id: String) { call("DELETE", "/api/tasks/$id", null, null as KSerializer<Unit>?) }
    override suspend fun tags() = req("GET", "/api/tags", null, TagsResponse.serializer())
    override suspend fun createTag(body: JsonObject) = req("POST", "/api/tags", body, Tag.serializer())
    override suspend fun updateTag(id: String, patch: JsonObject) = req("PATCH", "/api/tags/$id", patch, Tag.serializer())
    override suspend fun deleteTag(id: String) { call("DELETE", "/api/tags/$id", null, null as KSerializer<Unit>?) }

    private fun enc(s: String) = java.net.URLEncoder.encode(s, "UTF-8").replace("+", "%20")
    override suspend fun teams() = req("GET", "/api/teams", null, TeamsResponse.serializer())
    override suspend fun createTeam(body: JsonObject) = req("POST", "/api/teams", body, Team.serializer())
    override suspend fun updateTeam(id: String, body: JsonObject) = req("PATCH", "/api/teams/$id", body, Team.serializer())
    override suspend fun deleteTeam(id: String) { call("DELETE", "/api/teams/$id", null, null as KSerializer<Unit>?) }
    override suspend fun invite(teamId: String, emails: List<String>, role: String) = req("POST", "/api/teams/$teamId/invites", buildJsonObject {
        putJsonArray("emails") { emails.forEach { add(JsonPrimitive(it)) } }
        put("role", role)
    }, InviteResult.serializer())
    override suspend fun cancelInvite(teamId: String, inviteId: String) = req("DELETE", "/api/teams/$teamId/invites/$inviteId", null, Team.serializer())
    override suspend fun acceptInvite(id: String) = req("POST", "/api/invites/$id/accept", null, AcceptResult.serializer())
    override suspend fun declineInvite(id: String) { call("POST", "/api/invites/$id/decline", null, null as KSerializer<Unit>?) }
    override suspend fun setRole(teamId: String, uid: String, role: String) =
        req("PATCH", "/api/teams/$teamId/members/${enc(uid)}", buildJsonObject { put("role", role) }, Team.serializer())
    override suspend fun removeMember(teamId: String, uid: String) { call("DELETE", "/api/teams/$teamId/members/${enc(uid)}", null, null as KSerializer<Unit>?) }
    override suspend fun board(teamId: String, from: String, to: String) = req("GET", "/api/teams/$teamId/tasks?from=$from&to=$to", null, BoardResponse.serializer())
    override suspend fun assign(teamId: String, body: JsonObject) = req("POST", "/api/teams/$teamId/tasks", body, Task.serializer())
    override suspend fun updateTeamTask(teamId: String, taskId: String, patch: JsonObject) = req("PATCH", "/api/teams/$teamId/tasks/$taskId", patch, Task.serializer())
    override suspend fun deleteTeamTask(teamId: String, taskId: String) { call("DELETE", "/api/teams/$teamId/tasks/$taskId", null, null as KSerializer<Unit>?) }

    // Uploads can be a couple of MB on a slow connection: give them more time.
    private val uploadClient by lazy {
        client.newBuilder().writeTimeout(90, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).callTimeout(180, TimeUnit.SECONDS).build()
    }

    override suspend fun addAttachment(taskId: String, body: JsonObject): Task =
        call("POST", "/api/tasks/$taskId/attachments", body, Task.serializer(), uploadClient) ?: throw ApiException(0, "Empty server response")

    override suspend fun deleteAttachment(id: String): Task? {
        val obj = call("DELETE", "/api/attachments/$id", null, JsonObject.serializer()) ?: return null
        if (!obj.containsKey("id")) return null
        return try {
            AppJson.decodeFromJsonElement(Task.serializer(), obj)
        } catch (e: Exception) {
            throw ApiException(200, "Unexpected server response")
        }
    }

    override suspend fun image(id: String, size: String): ByteArray = withContext(Dispatchers.IO) { imageBlocking(id, size) }

    private suspend fun imageBlocking(id: String, size: String): ByteArray {
        val path = "/api/attachments/$id?size=$size"
        val response = try {
            var res = send("GET", path, null, force = false)
            if (res.code == 401) {
                res.close()
                res = send("GET", path, null, force = true)
            }
            res
        } catch (e: IOException) {
            throw ApiException(0, "You appear to be offline")
        }
        response.use { res ->
            if (!res.isSuccessful) throw ApiException(res.code, "Image not available")
            return try {
                res.body.bytes()
            } catch (e: IOException) {
                throw ApiException(0, "You appear to be offline")
            }
        }
    }
}

/** Runs an OkHttp call without blocking a thread; cancelling the coroutine cancels the request. */
suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
    cont.invokeOnCancellation { runCatching { cancel() } }
    enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
            if (!cont.isCancelled) cont.resumeWithException(e)
        }
        override fun onResponse(call: Call, response: Response) {
            cont.resume(response) { _, _, _ -> response.close() }
        }
    })
}

/** Request body for creating a task (with history when undoing a delete). */
fun taskBody(
    t: Task,
    includeHistory: Boolean = false,
): JsonObject = buildJsonObject {
    put("id", t.id)
    put("title", t.title)
    put("notes", t.notes)
    put("priority", t.priority)
    put("date", t.date)
    putJsonArray("tagIds") { t.tagIds.forEach { add(JsonPrimitive(it)) } }
    if (t.subtasks.isNotEmpty()) put("subtasks", subtasksJson(t.subtasks))
    t.dueAt?.let { put("dueAt", it) }
    if (includeHistory) {
        put("status", t.status)
        put("originalDate", t.originalDate)
        put("postponed", t.postponed)
        put("createdAt", t.createdAt)
        t.completedAt?.let { put("completedAt", it) }
        t.carriedFrom?.let { put("carriedFrom", it) }
        // A team task (only its admins can delete one) comes back as the same team task.
        t.teamId?.let { put("teamId", it); t.assignedBy?.let { by -> put("assignedBy", by) } }
    }
}

fun subtasksJson(list: List<Subtask>): JsonArray = buildJsonArray {
    for (s in list) add(buildJsonObject {
        put("id", s.id)
        if (s.parentId == null) put("parentId", JsonNull) else put("parentId", s.parentId)
        put("title", s.title)
        put("done", s.done)
    })
}

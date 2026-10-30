package com.skienlabs.tasks.data

import androidx.compose.runtime.Immutable
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

// Mirrors the server API (web/server/src/app.js). Unknown fields are ignored.

object Status {
    const val PENDING = "pending"
    const val DONE = "done"
    const val CANCELLED = "cancelled"
}

@Immutable
@Serializable
data class Task(
    val id: String,
    val title: String,
    val notes: String = "",
    val priority: Int = 4,
    val date: String,
    val status: String = Status.PENDING,
    val originalDate: String = date,
    val postponed: Int = 0,
    val createdAt: Long = 0,
    val updatedAt: Long = 0,
    val completedAt: Long? = null,
    val tagIds: List<String> = emptyList(),
    val subtasks: List<Subtask> = emptyList(),
    val attachments: List<Attachment> = emptyList(),
    /** Set when the server moved this unfinished task here from an earlier day: the day it was first due. */
    val carriedFrom: String? = null,
    /** Optional time limit: local date and time, "2026-10-30T17:00". */
    val dueAt: String? = null,
    /** A task given out in a team: who it's for ([assignee], its owner) and who gave it. */
    val teamId: String? = null,
    val assignee: String? = null,
    val assignedBy: String? = null,
    /** Team tasks (2.0): done waits for an admin's sign-off ([review]: waiting, returned, approved). */
    val needsReview: Boolean = false,
    val review: String? = null,
    /** One task for several people: their copies share [groupId]; [groupMode] each or first. */
    val groupId: String? = null,
    val groupMode: String? = null,
    /** "First one to finish closes it": who finished, on the copies that closed. */
    val closedBy: String? = null,
    val teamTagIds: List<String> = emptyList(),
    val recurringId: String? = null,
    val files: List<TaskFile> = emptyList(),
    /** Comment count (on a team's board). */
    val comments: Int = 0,
) {
    val isCarried get() = carriedFrom != null && carriedFrom < date
    val isPending get() = status == Status.PENDING
    val isDone get() = status == Status.DONE
    val isCancelled get() = status == Status.CANCELLED
}

/** A file on a task (PDF, document, sheet…); downloaded from /api/files/{id}. */
@Immutable
@Serializable
data class TaskFile(
    val id: String,
    val name: String = "file",
    val mime: String = "application/octet-stream",
    val size: Long = 0,
    val addedBy: String? = null,
    val createdAt: Long = 0,
)

/** A step of a task; steps form a tree through [parentId] (see Steps.kt). */
@Immutable
@Serializable
data class Subtask(
    val id: String,
    val parentId: String? = null,
    val title: String,
    val done: Boolean = false,
)

/** An image on a task. The files are fetched from /api/attachments/{id}. */
@Immutable
@Serializable
data class Attachment(
    val id: String,
    val type: String = "jpeg",
    val width: Int = 0,
    val height: Int = 0,
    val size: Long = 0,
    val createdAt: Long = 0,
    /** Shown while the upload is still running (never sent or stored). */
    @Transient val uploading: Boolean = false,
)

@Immutable
@Serializable
data class Tag(
    val id: String,
    val name: String,
    val color: String = "blue",
    val logo: String? = null,
    val position: Int = 0,
    val createdAt: Long = 0,
    val updatedAt: Long = 0,
)

@Immutable
@Serializable
data class Profile(
    val uid: String,
    val email: String? = null,
    val name: String,
    val photo: String? = null,
    val createdAt: Long = 0,
    val onboarded: Boolean = false,
    val provider: String? = null,
    val emailVerified: Boolean = false,
)

@Immutable
@Serializable
/**
 * Tasks on one day by status. [missed] counts tasks that were on the day, weren't finished and
 * moved on to the next day by themselves; they're shown (in red) but aren't counted again.
 */
data class Counts(val pending: Int = 0, val done: Int = 0, val cancelled: Int = 0, val missed: Int = 0) {
    val active get() = pending + done
    val total get() = pending + done + cancelled
    /** Everything that was on the day, including tasks that moved on unfinished. */
    val planned get() = pending + done + missed
    fun plus(o: Counts) = Counts(pending + o.pending, done + o.done, cancelled + o.cancelled, missed + o.missed)

    fun bump(status: String, sign: Int) = when (status) {
        Status.PENDING -> copy(pending = (pending + sign).coerceAtLeast(0))
        Status.DONE -> copy(done = (done + sign).coerceAtLeast(0))
        else -> copy(cancelled = (cancelled + sign).coerceAtLeast(0))
    }
}

@Serializable
data class DayCounts(val date: String, val pending: Int = 0, val done: Int = 0, val cancelled: Int = 0, val missed: Int = 0) {
    fun counts() = Counts(pending, done, cancelled, missed)
}

@Serializable data class DayResponse(val tasks: List<Task> = emptyList(), val overdue: List<Task> = emptyList())
@Serializable data class SummaryResponse(val days: List<DayCounts> = emptyList())
@Serializable data class TagsResponse(val tags: List<Tag> = emptyList())

@Immutable
@Serializable
data class TagCounts(val tagId: String? = null, val pending: Int = 0, val done: Int = 0, val cancelled: Int = 0) {
    fun counts() = Counts(pending, done, cancelled)
}

@Immutable
@Serializable
data class PriorityCounts(val priority: Int, val pending: Int = 0, val done: Int = 0, val cancelled: Int = 0) {
    fun counts() = Counts(pending, done, cancelled)
}

@Immutable
@Serializable
data class Stats(
    val days: List<DayCounts> = emptyList(),
    val byTag: List<TagCounts> = emptyList(),
    val byPriority: List<PriorityCounts> = emptyList(),
    val overdue: Int = 0,
    val postponed: Int = 0,
)

@Serializable data class ErrorBody(val error: String? = null)

/** How many tasks were left unfinished on a day and moved on. */
@Serializable data class MissCount(val date: String, val missed: Int = 0)

/** /api/sync: the whole account, for the offline copy. */
@Serializable
data class SyncResponse(
    val tasks: List<Task> = emptyList(),
    val tags: List<Tag> = emptyList(),
    val misses: List<MissCount> = emptyList(),
    /** Null from a server older than teams. */
    val teams: List<Team>? = null,
    val invites: List<Invite> = emptyList(),
    val serverTime: Long = 0,
)

object Role {
    const val OWNER = "owner"
    const val ADMIN = "admin"
    const val MEMBER = "member"
    fun label(role: String) = when (role) { OWNER -> "Owner"; ADMIN -> "Admin"; else -> "Member" }
}

@Immutable
@Serializable
data class Member(
    val uid: String,
    val role: String = Role.MEMBER,
    val name: String = "",
    val email: String? = null,
    val photo: String? = null,
    val joinedAt: Long = 0,
    /** Job title ("Designer"), set by the person or an admin. */
    val title: String? = null,
)

/** Someone invited to a team who hasn't joined yet (only admins see these). */
@Immutable
@Serializable
data class TeamInvite(
    val id: String,
    val email: String,
    val role: String = Role.MEMBER,
    val invitedBy: String? = null,
    val invitedByName: String = "",
    val createdAt: Long = 0,
)

/** A team as I see it: [role] is mine. */
@Immutable
@Serializable
data class Team(
    val id: String,
    val name: String,
    val color: String = "blue",
    /** Small PNG/JPEG/WebP data URL, like a tag's logo. */
    val logo: String? = null,
    val createdBy: String? = null,
    val createdAt: Long = 0,
    val updatedAt: Long = 0,
    val role: String = Role.MEMBER,
    val members: List<Member> = emptyList(),
    val invites: List<TeamInvite> = emptyList(),
    /** Archived: everything stays readable, nothing changes until its owner brings it back. */
    val archived: Boolean = false,
    val settings: TeamSettings = TeamSettings(),
    val groups: List<TeamGroup> = emptyList(),
    val tags: List<TeamTag> = emptyList(),
    /** People asking to join through the invite link (admins only). */
    val requests: List<JoinRequest> = emptyList(),
) {
    val isAdmin get() = role == Role.OWNER || role == Role.ADMIN
    /** May I give tasks here? */
    val canGive get() = !archived && (isAdmin || settings.membersCanAssign)
    fun tag(id: String) = tags.firstOrNull { it.id == id }
    fun member(uid: String?) = members.firstOrNull { it.uid == uid }
}

/** An invite waiting for me. */
@Immutable
@Serializable
data class Invite(
    val id: String,
    val teamId: String,
    val teamName: String,
    val teamColor: String = "blue",
    val teamLogo: String? = null,
    val role: String = Role.MEMBER,
    val email: String = "",
    val invitedBy: String? = null,
    val invitedByName: String = "",
    val memberCount: Int = 0,
    val createdAt: Long = 0,
)

@Serializable data class TeamsResponse(val teams: List<Team> = emptyList(), val invites: List<Invite> = emptyList())
@Serializable data class InviteResult(val team: Team, val invited: List<String> = emptyList(), val alreadyMembers: List<String> = emptyList())
@Serializable data class AcceptResult(val team: Team)
@Serializable data class BoardResponse(val tasks: List<Task> = emptyList())

/** Why a search result matched when it wasn't the title: a step, or a bit of the notes. */
@Immutable @Serializable data class SearchMatch(val field: String, val text: String)

/** A word, tag or filter that completes what's being typed in search. */
@Immutable @Serializable
data class SearchSuggestion(val kind: String, val insert: String, val label: String? = null, val tagId: String? = null)

@Immutable data class SearchHit(val task: Task, val match: SearchMatch? = null)

/** /api/search: ranked tasks (each with an optional `match`), plus suggestions. */
@Immutable @Serializable
data class SearchResponse(
    val results: List<kotlinx.serialization.json.JsonObject> = emptyList(),
    val total: Int = 0,
    val fuzzy: Boolean = false,
    val terms: List<String> = emptyList(),
    val suggestions: List<SearchSuggestion> = emptyList(),
) {
    fun hits(): List<SearchHit> = results.mapNotNull { o ->
        val task = runCatching { AppJson.decodeFromJsonElement(Task.serializer(), o) }.getOrNull() ?: return@mapNotNull null
        val match = o["match"]?.let { runCatching { AppJson.decodeFromJsonElement(SearchMatch.serializer(), it) }.getOrNull() }
        SearchHit(task, match)
    }.distinctBy { it.task.id } // one row per task, whatever the source
}

/** A live-sync notice from /api/events. */
@Serializable
data class Change(
    val type: String,
    val dates: List<String> = emptyList(),
    val tasks: Boolean = false,
    val teamId: String? = null,
    val source: String? = null,
    val taskId: String? = null,
    val thread: String? = null,
)

const val MAX_TAGS_PER_TASK = 10
const val MAX_IMAGES_PER_TASK = 20

@Immutable @Serializable data class TeamSettings(val membersCanAssign: Boolean = false)
@Immutable @Serializable data class TeamGroup(val id: String, val name: String, val color: String = "blue", val members: List<String> = emptyList())
@Immutable @Serializable data class TeamTag(val id: String, val name: String, val color: String = "blue")
@Immutable @Serializable
data class JoinRequest(val uid: String, val name: String = "", val email: String? = null, val photo: String? = null, val createdAt: Long = 0)

/** A comment on a team task (one thread is shared by the copies of a task given to several people). */
@Immutable @Serializable
data class Comment(val id: String, val thread: String = "", val uid: String, val name: String = "", val photo: String? = null, val text: String, val createdAt: Long = 0)
@Serializable data class CommentsResponse(val comments: List<Comment> = emptyList())

/** Team news for me: a task given, a comment, a review, a reminder… */
@Immutable @Serializable
data class AppNotification(
    val id: Long,
    val kind: String,
    val teamId: String? = null,
    val taskId: String? = null,
    val actor: String? = null,
    val title: String,
    val body: String? = null,
    val createdAt: Long = 0,
    val read: Boolean = false,
)
@Serializable data class NotificationsResponse(val notifications: List<AppNotification> = emptyList(), val unread: Int = 0)
@Serializable data class UnreadResponse(val unread: Int = 0)

@Immutable @Serializable data class Rule(val freq: String, val days: List<Int>? = null, val day: Int? = null)

/** A task the team gives often; also the shape of a repeating task's contents. */
@Immutable @Serializable
data class Template(
    val id: String = "",
    val name: String = "",
    val title: String = "",
    val notes: String = "",
    val priority: Int = 4,
    val subtasks: List<Subtask> = emptyList(),
    val dueTime: String? = null,
    val teamTagIds: List<String> = emptyList(),
    val needsReview: Boolean = false,
)
@Serializable data class TemplatesResponse(val templates: List<Template> = emptyList())

@Immutable @Serializable
data class Recurring(
    val id: String,
    val title: String = "",
    val notes: String = "",
    val priority: Int = 4,
    val subtasks: List<Subtask> = emptyList(),
    val dueTime: String? = null,
    val teamTagIds: List<String> = emptyList(),
    val needsReview: Boolean = false,
    val assignees: List<String> = emptyList(),
    val mode: String = "each",
    val rule: Rule = Rule("daily"),
    val nextDate: String = "",
    val active: Boolean = true,
)
@Serializable data class RecurringResponse(val recurring: List<Recurring> = emptyList())

@Immutable @Serializable
data class Activity(
    val id: Long,
    val uid: String? = null,
    val name: String = "",
    val action: String,
    val taskId: String? = null,
    val detail: kotlinx.serialization.json.JsonObject? = null,
    val createdAt: Long = 0,
)
@Serializable data class ActivityResponse(val activity: List<Activity> = emptyList())

@Immutable @Serializable data class TeamLink(val token: String, val url: String, val qr: String, val createdAt: Long = 0)
@Serializable data class LinkResponse(val link: TeamLink? = null)
@Immutable @Serializable data class JoinTeam(val id: String, val name: String, val color: String = "blue", val logo: String? = null, val memberCount: Int = 0)
@Serializable data class JoinInfo(val team: JoinTeam, val status: String)
@Serializable data class JoinStatus(val status: String)
@Serializable data class TasksResponse(val tasks: List<Task> = emptyList())

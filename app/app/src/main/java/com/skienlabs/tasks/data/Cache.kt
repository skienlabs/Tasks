package com.skienlabs.tasks.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Transaction

/**
 * Local copy of recent data so the app opens instantly and shows tasks offline.
 * The server is always the source of truth; this is only a cache per signed-in account.
 */
interface Cache {
    suspend fun load(uid: String, from: String, to: String, today: String): CacheSnapshot
    suspend fun saveTasks(uid: String, upserts: List<Task>, deletes: List<String>)
    suspend fun saveTags(uid: String, tags: List<Tag>)
    suspend fun saveSummary(uid: String, days: Map<String, Counts>)
    suspend fun saveProfile(uid: String, profile: Profile)
    suspend fun loadProfile(uid: String): Profile?
    suspend fun clear()
}

data class CacheSnapshot(
    val tasks: List<Task> = emptyList(),
    val tags: List<Tag> = emptyList(),
    val summary: Map<String, Counts> = emptyMap(),
)

object NoCache : Cache {
    override suspend fun load(uid: String, from: String, to: String, today: String) = CacheSnapshot()
    override suspend fun saveTasks(uid: String, upserts: List<Task>, deletes: List<String>) = Unit
    override suspend fun saveTags(uid: String, tags: List<Tag>) = Unit
    override suspend fun saveSummary(uid: String, days: Map<String, Counts>) = Unit
    override suspend fun saveProfile(uid: String, profile: Profile) = Unit
    override suspend fun loadProfile(uid: String): Profile? = null
    override suspend fun clear() = Unit
}

@Entity(tableName = "tasks", primaryKeys = ["id"])
data class TaskEntity(val id: String, val uid: String, val date: String, val status: String, val json: String)

@Entity(tableName = "tags", primaryKeys = ["id"])
data class TagEntity(val id: String, val uid: String, val json: String)

@Entity(tableName = "summary", primaryKeys = ["uid", "date"])
data class SummaryEntity(val uid: String, val date: String, val pending: Int, val done: Int, val cancelled: Int)

@Entity(tableName = "meta", primaryKeys = ["uid", "key"])
data class MetaEntity(val uid: String, val key: String, val value: String)

@Dao
interface CacheDao {
    @Query(
        "SELECT * FROM tasks WHERE uid = :uid AND ((date BETWEEN :from AND :to) OR (status = 'pending' AND date < :today))",
    )
    suspend fun tasks(uid: String, from: String, to: String, today: String): List<TaskEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertTasks(rows: List<TaskEntity>)

    @Query("DELETE FROM tasks WHERE uid = :uid AND id IN (:ids)")
    suspend fun deleteTasks(uid: String, ids: List<String>)

    @Query("SELECT * FROM tags WHERE uid = :uid")
    suspend fun tags(uid: String): List<TagEntity>

    @Query("DELETE FROM tags WHERE uid = :uid")
    suspend fun clearTags(uid: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTags(rows: List<TagEntity>)

    @Transaction
    suspend fun replaceTags(uid: String, rows: List<TagEntity>) {
        clearTags(uid)
        insertTags(rows)
    }

    @Query("SELECT * FROM summary WHERE uid = :uid AND date BETWEEN :from AND :to")
    suspend fun summary(uid: String, from: String, to: String): List<SummaryEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertSummary(rows: List<SummaryEntity>)

    @Query("SELECT value FROM meta WHERE uid = :uid AND `key` = :key")
    suspend fun meta(uid: String, key: String): String?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putMeta(row: MetaEntity)

    @Query("DELETE FROM tasks")
    suspend fun clearAllTasks()

    @Query("DELETE FROM tags")
    suspend fun clearAllTags()

    @Query("DELETE FROM summary")
    suspend fun clearAllSummary()

    @Query("DELETE FROM meta")
    suspend fun clearAllMeta()
}

@Database(entities = [TaskEntity::class, TagEntity::class, SummaryEntity::class, MetaEntity::class], version = 1, exportSchema = true)
abstract class CacheDatabase : RoomDatabase() {
    abstract fun dao(): CacheDao
}

class RoomCache(context: Context) : Cache {
    private val db = Room.databaseBuilder(context, CacheDatabase::class.java, "tasks-cache.db")
        // It is only a cache: if a future version changes the format, start fresh rather than crash.
        .fallbackToDestructiveMigration(dropAllTables = true)
        .build()
    private val dao get() = db.dao()

    private fun decodeTask(json: String) = runCatching { AppJson.decodeFromString(Task.serializer(), json) }.getOrNull()
    private fun decodeTag(json: String) = runCatching { AppJson.decodeFromString(Tag.serializer(), json) }.getOrNull()

    override suspend fun load(uid: String, from: String, to: String, today: String): CacheSnapshot = CacheSnapshot(
        tasks = dao.tasks(uid, from, to, today).mapNotNull { decodeTask(it.json) },
        tags = dao.tags(uid).mapNotNull { decodeTag(it.json) },
        summary = dao.summary(uid, from, to).associate { it.date to Counts(it.pending, it.done, it.cancelled) },
    )

    override suspend fun saveTasks(uid: String, upserts: List<Task>, deletes: List<String>) {
        if (deletes.isNotEmpty()) deletes.chunked(500).forEach { dao.deleteTasks(uid, it) }
        if (upserts.isNotEmpty()) {
            dao.upsertTasks(upserts.map { TaskEntity(it.id, uid, it.date, it.status, AppJson.encodeToString(Task.serializer(), it)) })
        }
    }

    override suspend fun saveTags(uid: String, tags: List<Tag>) =
        dao.replaceTags(uid, tags.map { TagEntity(it.id, uid, AppJson.encodeToString(Tag.serializer(), it)) })

    override suspend fun saveSummary(uid: String, days: Map<String, Counts>) {
        if (days.isEmpty()) return
        dao.upsertSummary(days.map { (d, c) -> SummaryEntity(uid, d, c.pending, c.done, c.cancelled) })
    }

    override suspend fun saveProfile(uid: String, profile: Profile) =
        dao.putMeta(MetaEntity(uid, "profile", AppJson.encodeToString(Profile.serializer(), profile)))

    override suspend fun loadProfile(uid: String): Profile? =
        dao.meta(uid, "profile")?.let { runCatching { AppJson.decodeFromString(Profile.serializer(), it) }.getOrNull() }

    override suspend fun clear() {
        dao.clearAllTasks()
        dao.clearAllTags()
        dao.clearAllSummary()
        dao.clearAllMeta()
    }
}

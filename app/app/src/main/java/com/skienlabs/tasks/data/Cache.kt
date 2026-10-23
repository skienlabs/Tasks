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
 * This device's copy of the account, so the app opens instantly and works offline, plus the
 * queue of changes made offline that the server hasn't received yet (the outbox).
 * The server is the source of truth for everything already sent.
 */
interface Cache {
    suspend fun load(uid: String, from: String, to: String, today: String): CacheSnapshot
    /** Every saved task, tag and day count of the account. */
    suspend fun loadAll(uid: String): CacheSnapshot = load(uid, Dates.MIN, Dates.MAX, Dates.MAX)
    suspend fun saveMeta(uid: String, key: String, value: String) {}
    suspend fun loadMeta(uid: String, key: String): String? = null
    /** Changes waiting for the server, oldest first. */
    suspend fun loadOps(uid: String): List<String> = emptyList()
    suspend fun saveOp(uid: String, key: Long, json: String) {}
    suspend fun deleteOp(uid: String, key: Long) {}
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
data class SummaryEntity(val uid: String, val date: String, val pending: Int, val done: Int, val cancelled: Int, val missed: Int = 0)

@Entity(tableName = "meta", primaryKeys = ["uid", "key"])
data class MetaEntity(val uid: String, val key: String, val value: String)

/** A change made here, waiting to be sent (JSON of [OutboxOp]). */
@Entity(tableName = "outbox", primaryKeys = ["uid", "key"])
data class OutboxEntity(val uid: String, val key: Long, val json: String)

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

    @Query("SELECT * FROM tasks WHERE uid = :uid")
    suspend fun allTasks(uid: String): List<TaskEntity>

    @Query("SELECT * FROM summary WHERE uid = :uid")
    suspend fun allSummary(uid: String): List<SummaryEntity>

    @Query("SELECT json FROM outbox WHERE uid = :uid ORDER BY `key`")
    suspend fun ops(uid: String): List<String>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putOp(row: OutboxEntity)

    @Query("DELETE FROM outbox WHERE uid = :uid AND `key` = :key")
    suspend fun deleteOp(uid: String, key: Long)

    @Query("DELETE FROM outbox")
    suspend fun clearAllOps()

    @Query("DELETE FROM tasks")
    suspend fun clearAllTasks()

    @Query("DELETE FROM tags")
    suspend fun clearAllTags()

    @Query("DELETE FROM summary")
    suspend fun clearAllSummary()

    @Query("DELETE FROM meta")
    suspend fun clearAllMeta()
}

@Database(entities = [TaskEntity::class, TagEntity::class, SummaryEntity::class, MetaEntity::class, OutboxEntity::class], version = 3, exportSchema = true)
abstract class CacheDatabase : RoomDatabase() {
    abstract fun dao(): CacheDao
}

class RoomCache private constructor(context: Context) : Cache {
    companion object {
        @Volatile private var instance: RoomCache? = null

        /** One instance per process (the app and the end-of-day summary share it). */
        fun get(context: Context): RoomCache = instance ?: synchronized(this) {
            instance ?: RoomCache(context.applicationContext).also { instance = it }
        }
    }

    private val db = Room.databaseBuilder(context, CacheDatabase::class.java, "tasks-cache.db")
        // 2 → 3 adds the outbox. Later versions must migrate it too: it holds unsent changes.
        .addMigrations(MIGRATION_2_3)
        // Version 1 was only a cache: start fresh rather than crash.
        .fallbackToDestructiveMigrationFrom(true, 1)
        .build()
    private val dao get() = db.dao()

    private fun decodeTask(json: String) = runCatching { AppJson.decodeFromString(Task.serializer(), json) }.getOrNull()
    private fun decodeTag(json: String) = runCatching { AppJson.decodeFromString(Tag.serializer(), json) }.getOrNull()

    override suspend fun load(uid: String, from: String, to: String, today: String): CacheSnapshot = CacheSnapshot(
        tasks = dao.tasks(uid, from, to, today).mapNotNull { decodeTask(it.json) },
        tags = dao.tags(uid).mapNotNull { decodeTag(it.json) },
        summary = dao.summary(uid, from, to).associate { it.date to Counts(it.pending, it.done, it.cancelled, it.missed) },
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
        dao.upsertSummary(days.map { (d, c) -> SummaryEntity(uid, d, c.pending, c.done, c.cancelled, c.missed) })
    }

    override suspend fun loadAll(uid: String): CacheSnapshot = CacheSnapshot(
        tasks = dao.allTasks(uid).mapNotNull { decodeTask(it.json) },
        tags = dao.tags(uid).mapNotNull { decodeTag(it.json) },
        summary = dao.allSummary(uid).associate { it.date to Counts(it.pending, it.done, it.cancelled, it.missed) },
    )

    override suspend fun saveMeta(uid: String, key: String, value: String) = dao.putMeta(MetaEntity(uid, key, value))
    override suspend fun loadMeta(uid: String, key: String): String? = dao.meta(uid, key)
    override suspend fun loadOps(uid: String): List<String> = dao.ops(uid)
    override suspend fun saveOp(uid: String, key: Long, json: String) = dao.putOp(OutboxEntity(uid, key, json))
    override suspend fun deleteOp(uid: String, key: Long) = dao.deleteOp(uid, key)

    override suspend fun saveProfile(uid: String, profile: Profile) =
        dao.putMeta(MetaEntity(uid, "profile", AppJson.encodeToString(Profile.serializer(), profile)))

    override suspend fun loadProfile(uid: String): Profile? =
        dao.meta(uid, "profile")?.let { runCatching { AppJson.decodeFromString(Profile.serializer(), it) }.getOrNull() }

    override suspend fun clear() {
        dao.clearAllOps()
        dao.clearAllTasks()
        dao.clearAllTags()
        dao.clearAllSummary()
        dao.clearAllMeta()
    }
}

private val MIGRATION_2_3 = object : androidx.room.migration.Migration(2, 3) {
    override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS `outbox` (`uid` TEXT NOT NULL, `key` INTEGER NOT NULL, `json` TEXT NOT NULL, PRIMARY KEY(`uid`, `key`))")
    }
}

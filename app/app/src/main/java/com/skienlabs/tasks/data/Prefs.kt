package com.skienlabs.tasks.data

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "prefs")

/** Saved theme choice. DARK is Midnight Black (true black); the name is kept so saved choices still work. */
enum class ThemePref { SYSTEM, LIGHT, GRAY, DIM, DARK, ABYSS, GLASS, GLASS_LIGHT }

/** Small per-device settings. */
class Prefs(private val context: Context) {
    private val themeKey = stringPreferencesKey("theme")
    private fun filterKey(uid: String) = stringPreferencesKey("tagFilter.$uid")
    private fun hideVerifyKey(uid: String) = stringPreferencesKey("hideVerify.$uid")

    private val data: Flow<Preferences> = context.dataStore.data.catch { emit(androidx.datastore.preferences.core.emptyPreferences()) }

    private val summaryOnKey = stringPreferencesKey("dailySummary")
    private val summaryTimeKey = stringPreferencesKey("dailySummaryMinutes")
    private val notifAskedKey = stringPreferencesKey("notifAsked")
    private val introSeenKey = stringPreferencesKey("introSeen")
    private fun recentSearchKey(uid: String) = stringPreferencesKey("recentSearches.$uid")

    /** The last few searches, newest first (one per line). */
    fun recentSearches(uid: String): Flow<List<String>> =
        data.map { p -> p[recentSearchKey(uid)]?.split('\n')?.filter { it.isNotBlank() } ?: emptyList() }
    suspend fun addRecentSearch(uid: String, q: String) = runCatching {
        val v = q.trim().replace('\n', ' ')
        if (v.isEmpty()) return@runCatching
        context.dataStore.edit { p ->
            val old = p[recentSearchKey(uid)]?.split('\n')?.filter { it.isNotBlank() } ?: emptyList()
            p[recentSearchKey(uid)] = (listOf(v) + old.filter { it != v }).take(8).joinToString("\n")
        }
    }
    suspend fun clearRecentSearches(uid: String) = runCatching { context.dataStore.edit { it.remove(recentSearchKey(uid)) } }

    /** The feature tour before sign-in is shown once per install. */
    val introSeen: Flow<Boolean> = data.map { it[introSeenKey] == "1" }
    suspend fun setIntroSeen() = runCatching { context.dataStore.edit { it[introSeenKey] = "1" } }

    /** End-of-day summary notification: on by default at 21:00. */
    val dailySummary: Flow<DailySummaryPref> = data.map { p ->
        DailySummaryPref(
            enabled = p[summaryOnKey] != "0",
            minutes = p[summaryTimeKey]?.toIntOrNull()?.takeIf { it in 0 until 24 * 60 } ?: DailySummaryPref.DEFAULT_MINUTES,
        )
    }
    val notificationsAsked: Flow<Boolean> = data.map { it[notifAskedKey] == "1" }

    suspend fun setDailySummary(enabled: Boolean, minutes: Int) = runCatching {
        context.dataStore.edit {
            it[summaryOnKey] = if (enabled) "1" else "0"
            it[summaryTimeKey] = minutes.coerceIn(0, 24 * 60 - 1).toString()
        }
    }
    suspend fun setNotificationsAsked() = runCatching { context.dataStore.edit { it[notifAskedKey] = "1" } }

    val theme: Flow<ThemePref> = data.map { p -> p[themeKey]?.let { runCatching { ThemePref.valueOf(it) }.getOrNull() } ?: ThemePref.SYSTEM }
    fun tagFilter(uid: String): Flow<String?> = data.map { it[filterKey(uid)]?.ifBlank { null } }
    fun hideVerify(uid: String): Flow<Boolean> = data.map { it[hideVerifyKey(uid)] == "1" }

    suspend fun setTheme(t: ThemePref) = runCatching { context.dataStore.edit { it[themeKey] = t.name } }
    suspend fun setTagFilter(uid: String, id: String?) = runCatching { context.dataStore.edit { it[filterKey(uid)] = id ?: "" } }
    suspend fun setHideVerify(uid: String) = runCatching { context.dataStore.edit { it[hideVerifyKey(uid)] = "1" } }
}

data class DailySummaryPref(val enabled: Boolean = true, val minutes: Int = DEFAULT_MINUTES) {
    companion object { const val DEFAULT_MINUTES = 21 * 60 }
}

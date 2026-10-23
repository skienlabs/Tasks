package com.skienlabs.tasks.widget

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import com.google.firebase.auth.FirebaseAuth
import com.skienlabs.tasks.BuildConfig
import com.skienlabs.tasks.MainActivity
import com.skienlabs.tasks.R
import com.skienlabs.tasks.auth.Auth
import com.skienlabs.tasks.data.Dates
import com.skienlabs.tasks.data.HttpTasksApi
import com.skienlabs.tasks.data.RoomCache
import com.skienlabs.tasks.data.Status
import com.skienlabs.tasks.data.Steps
import com.skienlabs.tasks.data.Tag
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.ui.theme.Palette
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** What the widgets show. */
data class WidgetData(
    val signedIn: Boolean,
    val today: String,
    val open: List<Task> = emptyList(),
    val done: Int = 0,
    val total: Int = 0,
    val tags: Map<String, Tag> = emptyMap(),
)

object WidgetRepo {
    private const val PREFS = "widgets"
    private const val LOCAL_AT = "localAt"

    /** The app just saved its own (newest) copy: widgets read that instead of the network. */
    fun markLocal(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong(LOCAL_AT, System.currentTimeMillis()).apply()
    }

    private fun localIsFresh(context: Context) =
        System.currentTimeMillis() - context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(LOCAL_AT, 0) < 90_000

    fun forget(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(LOCAL_AT).apply()
    }

    suspend fun load(context: Context): WidgetData {
        val today = Dates.today()
        val user = runCatching { FirebaseAuth.getInstance().currentUser }.getOrNull() ?: return WidgetData(false, today)
        val cache = RoomCache.get(context)
        val snap = runCatching { cache.load(user.uid, today, today, today) }.getOrNull()
        val fromNetwork = if (localIsFresh(context) || BuildConfig.API_URL.isBlank()) null else withTimeoutOrNull(5000) {
            runCatching {
                val res = HttpTasksApi(BuildConfig.API_URL, Auth(context)).day(today, today)
                (res.tasks + res.overdue).also { runCatching { cache.saveTasks(user.uid, it, emptyList()) } }
            }.getOrNull()
        }
        val tasks = (fromNetwork ?: snap?.tasks ?: emptyList()).distinctBy { it.id }
        return summarize(today, tasks, snap?.tags ?: emptyList())
    }

    fun summarize(today: String, tasks: List<Task>, tags: List<Tag>): WidgetData {
        val day = tasks.filter { it.date == today && !it.isCancelled }
        val overdue = tasks.filter { it.isPending && it.date < today }
        val open = (day.filter { it.isPending } + overdue).sortedWith(com.skienlabs.tasks.data.TaskOrder.comparator(tags))
        return WidgetData(true, today, open, day.count { it.isDone }, day.size + overdue.size, tags.associateBy { it.id })
    }
}

/** Refreshes every Tasks widget on the home screen (no-op when there are none). */
object Widgets {
    suspend fun updateAll(context: Context) {
        val m = GlanceAppWidgetManager(context)
        if (m.getGlanceIds(TodayWidget::class.java).isNotEmpty()) TodayWidget().updateAll(context)
        if (m.getGlanceIds(FocusWidget::class.java).isNotEmpty()) FocusWidget().updateAll(context)
    }

    /** Set by the app while it runs, so a tick on the widget refreshes the open app too. */
    @Volatile var onWidgetChange: (() -> Unit)? = null
}

// ---- Look ----------------------------------------------------------------------------

private val bg = ColorProvider(day = Color(0xFFF8FAFD), night = Color(0xFF000000))
private val surface = ColorProvider(day = Color(0xFFEEF2F8), night = Color(0xFF16171A))
private val text = ColorProvider(day = Color(0xFF1F1F1F), night = Color(0xFFE3E3E3))
private val muted = ColorProvider(day = Color(0xFF5F6368), night = Color(0xFF9AA0A6))
private val primary = ColorProvider(day = Color(0xFF0B57D0), night = Color(0xFFA8C7FA))
private val overdue = ColorProvider(day = Color(0xFFC5221F), night = Color(0xFFF2B8B5))
private val onPrimary = ColorProvider(day = Color.White, night = Color(0xFF062E6F))

private fun dp(context: Context, v: Int) = (v * context.resources.displayMetrics.density).toInt()

/** Progress ring as a bitmap (widgets can't draw). Green done, blue still open. */
private fun ring(context: Context, done: Int, total: Int, sizeDp: Int): Bitmap {
    val px = dp(context, sizeDp)
    val bmp = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val w = px * 0.12f
    val r = RectF(w / 2, w / 2, px - w / 2, px - w / 2)
    val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = w; strokeCap = Paint.Cap.ROUND }
    p.color = 0x334C8DF6
    c.drawArc(r, 0f, 360f, false, p)
    if (total > 0 && done > 0) {
        p.color = 0xFF34A853.toInt()
        c.drawArc(r, -90f, 360f * done / total, false, p)
    }
    return bmp
}

/** Small round tick target in the priority colour. */
private fun check(context: Context, color: Int, sizeDp: Int = 22): Bitmap {
    val px = dp(context, sizeDp)
    val bmp = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
    val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = px * 0.1f; this.color = color }
    Canvas(bmp).drawCircle(px / 2f, px / 2f, px / 2f - p.strokeWidth, p)
    return bmp
}

private fun openApp(context: Context, newTask: Boolean = false) = actionStartActivity(
    Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        if (newTask) putExtra(MainActivity.EXTRA_ACTION, MainActivity.ACTION_NEW_TASK)
    },
)

private val TaskIdKey = ActionParameters.Key<String>("taskId")

/** Base widget; [list] shows the full scrolling list (4x4), otherwise the top few (4x2). */
abstract class TasksWidgetBase(private val list: Boolean) : GlanceAppWidget(errorUiLayout = R.layout.widget_error) {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val data = WidgetRepo.load(context)
        val dark = (context.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
            android.content.res.Configuration.UI_MODE_NIGHT_YES
        val (ringImg, checks) = widgetImages(context, data, dark)
        provideContent { WidgetContent(context, data, ringImg, checks, list) }
    }
}

/** Images the widget needs (drawn as bitmaps: widgets can't draw shapes). */
internal fun widgetImages(context: Context, d: WidgetData, dark: Boolean): Pair<ImageProvider, Map<Int, ImageProvider>> =
    ImageProvider(ring(context, d.done, d.total, 52)) to (1..4).associateWith { p -> ImageProvider(check(context, Palette.priority(p, dark).toArgbInt())) }

@Composable
internal fun WidgetContent(context: Context, d: WidgetData, ringImg: ImageProvider, checks: Map<Int, ImageProvider>, list: Boolean) {
    run {
        val size = LocalSize.current
        val roomy = list || size.height >= 200.dp
        Column(
            GlanceModifier.fillMaxSize().background(bg).cornerRadius(26.dp).padding(horizontal = 14.dp, vertical = 12.dp),
        ) {
            if (!d.signedIn) {
                Box(GlanceModifier.fillMaxSize().clickable(openApp(context)), contentAlignment = Alignment.Center) {
                    Text("Sign in to Tasks to see your day", style = TextStyle(color = muted, fontSize = 14.sp))
                }
                return@Column
            }
            Header(context, d, ringImg)
            Spacer(GlanceModifier.height(8.dp))
            when {
                d.total == 0 -> Empty(context, "Nothing planned for today", "Tap + to add a task")
                d.open.isEmpty() -> Empty(context, "All done for today", "You completed ${d.done} task${if (d.done == 1) "" else "s"}")
                else -> {
                    // Plain rows (no scrolling list): as many as fit, then "+N more".
                    val fit = ((size.height.value - 92) / 40).toInt().coerceIn(1, if (roomy) 8 else 3)
                    Column(GlanceModifier.fillMaxWidth()) {
                        d.open.take(fit).forEach { t -> TaskRow(context, d, t, checks) }
                        if (d.open.size > fit) {
                            Text(
                                "+${d.open.size - fit} more", style = TextStyle(color = muted, fontSize = 12.sp),
                                modifier = GlanceModifier.padding(start = 34.dp, top = 2.dp).clickable(openApp(context)),
                            )
                        }
                    }
                    if (roomy && size.height >= 260.dp) {
                        Spacer(GlanceModifier.defaultWeight())
                        StatStrip(d)
                    }
                }
            }
        }
    }
}

    @Composable
    private fun Header(context: Context, d: WidgetData, ringImg: ImageProvider) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(GlanceModifier.size(52.dp).clickable(openApp(context)), contentAlignment = Alignment.Center) {
                Image(ringImg, "Progress", GlanceModifier.size(52.dp))
                Text("${d.done}/${d.total}", style = TextStyle(color = text, fontSize = 13.sp, fontWeight = FontWeight.Medium))
            }
            Column(GlanceModifier.defaultWeight().padding(start = 12.dp).clickable(openApp(context))) {
                Text("Today", style = TextStyle(color = text, fontSize = 18.sp, fontWeight = FontWeight.Medium))
                val left = d.open.size
                val sub = buildString {
                    append(java.time.format.DateTimeFormatter.ofPattern("EEE, d MMM", java.util.Locale.getDefault()).format(java.time.LocalDate.parse(d.today)))
                    if (d.total > 0) append(if (left == 0) "  ·  all done" else "  ·  $left left")
                }
                Text(sub, style = TextStyle(color = muted, fontSize = 12.5.sp), maxLines = 1)
            }
            Box(
                GlanceModifier.size(40.dp).cornerRadius(20.dp).background(primary).clickable(openApp(context, newTask = true)),
                contentAlignment = Alignment.Center,
            ) {
                Text("+", style = TextStyle(color = onPrimary, fontSize = 22.sp, fontWeight = FontWeight.Medium))
            }
        }
    }

    /** Three coloured counters along the bottom of the big widget. */
    @Composable
    private fun StatStrip(d: WidgetData) {
        Row(GlanceModifier.fillMaxWidth().padding(top = 6.dp)) {
            Stat("Done", d.done, ColorProvider(Color(0xFF188038), Color(0xFF81C995)), GlanceModifier.defaultWeight())
            Spacer(GlanceModifier.width(8.dp))
            Stat("Left", d.open.size, primary, GlanceModifier.defaultWeight())
            Spacer(GlanceModifier.width(8.dp))
            Stat("High", d.open.count { it.priority == 1 }, overdue, GlanceModifier.defaultWeight())
        }
    }

    @Composable
    private fun Stat(label: String, n: Int, color: androidx.glance.unit.ColorProvider, modifier: GlanceModifier) {
        Column(modifier.cornerRadius(14.dp).background(surface).padding(horizontal = 10.dp, vertical = 6.dp)) {
            Text("$n", style = TextStyle(color = color, fontSize = 18.sp, fontWeight = FontWeight.Medium))
            Text(label, style = TextStyle(color = muted, fontSize = 11.sp))
        }
    }

    @Composable
    private fun Empty(context: Context, title: String, sub: String) {
        Column(
            GlanceModifier.fillMaxSize().cornerRadius(18.dp).background(surface).padding(12.dp).clickable(openApp(context)),
            verticalAlignment = Alignment.CenterVertically, horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(title, style = TextStyle(color = text, fontSize = 14.sp, fontWeight = FontWeight.Medium))
            Text(sub, style = TextStyle(color = muted, fontSize = 12.sp))
        }
    }

    @Composable
    private fun TaskRow(context: Context, d: WidgetData, t: Task, checks: Map<Int, ImageProvider>) {
        val steps = Steps.progress(t.subtasks)
        val hasOpenSteps = steps.total > 0 && !steps.complete
        val tag = d.tags.values.firstOrNull { it.id in t.tagIds } // the company: first in the user's tag order
        Row(GlanceModifier.fillMaxWidth().height(40.dp), verticalAlignment = Alignment.CenterVertically) {
            // Tick: completes right here (tasks with open steps open the app instead).
            Box(
                GlanceModifier.size(34.dp).clickable(
                    if (hasOpenSteps) openApp(context) else actionRunCallback<CompleteTask>(actionParametersOf(TaskIdKey to t.id)),
                ),
                contentAlignment = Alignment.CenterStart,
            ) {
                Image(checks.getValue(t.priority.coerceIn(1, 4)), "Complete ${t.title}", GlanceModifier.size(22.dp))
            }
            Column(GlanceModifier.defaultWeight().clickable(openApp(context))) {
                Text(t.title, style = TextStyle(color = text, fontSize = 14.sp), maxLines = 1)
                val meta = buildList {
                    if (t.date < d.today) add(Dates.shortLabel(t.date, d.today))
                    else if (t.isCarried) add(Dates.carriedLabel(t.carriedFrom!!, d.today))
                    if (t.priority == 1) add("High")
                    if (steps.total > 0) add("${steps.done}/${steps.total} steps")
                    tag?.let { add(it.name) }
                }
                if (meta.isNotEmpty()) {
                    Text(
                        meta.joinToString("  ·  "), maxLines = 1,
                        style = TextStyle(color = if (t.date < d.today || t.isCarried) overdue else muted, fontSize = 11.5.sp),
                    )
                }
            }
            if (tag != null) {
                Box(GlanceModifier.size(8.dp).cornerRadius(4.dp).background(ColorProvider(Palette.tag(tag.color, false), Palette.tag(tag.color, true)))) {}
                Spacer(GlanceModifier.width(4.dp))
            }
        }
    }

private fun Color.toArgbInt(): Int = android.graphics.Color.argb((alpha * 255).toInt(), (red * 255).toInt(), (green * 255).toInt(), (blue * 255).toInt())

/** 4×2: today's progress and the top tasks. */
class TodayWidget : TasksWidgetBase(list = false)

/** 4×4: today's progress and every open task, scrollable. */
class FocusWidget : TasksWidgetBase(list = true)

class TodayWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodayWidget()
}

class FocusWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = FocusWidget()
}

/** Tick from the home screen: marks the task done on the server, then refreshes. */
class CompleteTask : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val id = parameters[TaskIdKey] ?: return
        val user = runCatching { FirebaseAuth.getInstance().currentUser }.getOrNull() ?: return
        // Through the app's store, so it works offline too (queued, sent when back online).
        val viaStore = runCatching {
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) {
                val store = (context.applicationContext as com.skienlabs.tasks.TasksApp).controller.store
                if (store.currentUid != user.uid) store.start(user.uid, com.skienlabs.tasks.data.Dates.today())
                if (store.currentUid != user.uid || store.state.value.tasks[id] == null) return@withContext false
                store.updateTask(id, com.skienlabs.tasks.data.TaskPatch(status = Status.DONE))
                store.settle()
                true
            }
        }.getOrDefault(false)
        if (viaStore) {
            WidgetRepo.markLocal(context)
            Widgets.updateAll(context)
            Widgets.onWidgetChange?.invoke()
            return
        }
        val saved = withTimeoutOrNull(10_000) {
            runCatching {
                HttpTasksApi(BuildConfig.API_URL, Auth(context)).updateTask(id, buildJsonObject { put("status", Status.DONE) })
            }.getOrNull()
        }
        if (saved != null) {
            runCatching { RoomCache.get(context).saveTasks(user.uid, listOf(saved), emptyList()) }
            WidgetRepo.forget(context) // next refresh asks the server
        }
        Widgets.updateAll(context)
        Widgets.onWidgetChange?.invoke()
    }
}

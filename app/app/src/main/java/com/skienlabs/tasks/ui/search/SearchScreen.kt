package com.skienlabs.tasks.ui.search

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Notes
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.NorthWest
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skienlabs.tasks.data.Dates
import com.skienlabs.tasks.data.LocalSearch
import com.skienlabs.tasks.data.SearchHit
import com.skienlabs.tasks.data.SearchResponse
import com.skienlabs.tasks.data.Tag
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.ui.common.TagAvatar
import com.skienlabs.tasks.ui.common.tagColor
import com.skienlabs.tasks.ui.theme.LocalExtra
import com.skienlabs.tasks.ui.theme.glassPanel
import com.skienlabs.tasks.ui.theme.Palette
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

private val QUICK = listOf(
    "is:open" to "Open", "is:late" to "From earlier days", "p:high" to "High priority",
    "date:week" to "This week", "has:steps" to "With steps", "is:done" to "Done",
)

/** Where results come from: the server, or (offline) what the phone has saved. */
private enum class Source { Server, Saved }

/**
 * Search every task: words, "phrases", #tags, and filters like is:done, p:high, date:week.
 * Suggestions complete the word being typed; tapping a result opens it.
 */
@Composable
fun SearchScreen(
    today: String,
    tags: List<Tag>,
    savedTasks: () -> Collection<Task>,
    recent: List<String>,
    search: suspend (String) -> SearchResponse,
    onRemember: (String) -> Unit,
    onClearRecent: () -> Unit,
    onOpen: (Task) -> Unit,
    onClose: () -> Unit,
) {
    var field by rememberSaveable(stateSaver = TextFieldValue.Saver) { mutableStateOf(TextFieldValue("")) }
    val q = field.text
    var res by remember { mutableStateOf<Pair<String, SearchResponse>?>(null) }
    var busy by remember { mutableStateOf(false) }
    var source by remember { mutableStateOf(Source.Server) }
    val focus = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current

    BackHandler(onBack = onClose)
    LaunchedEffect(Unit) { focus.requestFocus() }

    // Live results while typing (debounced; a newer query cancels the older one).
    LaunchedEffect(q) {
        if (q.isBlank()) { res = null; busy = false; return@LaunchedEffect }
        delay(160)
        busy = true
        try {
            res = q to search(q)
            source = Source.Server
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Offline or the server is unreachable: search what's saved on the phone.
            res = q to (LocalSearch.search(q, savedTasks(), tags, today) ?: SearchResponse())
            source = Source.Saved
        } finally {
            busy = false
        }
    }

    fun setText(t: String) { field = TextFieldValue(t, TextRange(t.length)) }

    /** Replaces the word being typed with a suggestion (or adds a filter) and keeps typing. */
    fun apply(insert: String, replaceLast: Boolean = true) {
        val parts = q.split(Regex("\\s+")).filter { it.isNotEmpty() }.toMutableList()
        if (replaceLast && q.isNotEmpty() && !q.last().isWhitespace() && parts.isNotEmpty()) parts.removeAt(parts.lastIndex)
        setText((parts + insert).joinToString(" ") + " ")
        focus.requestFocus()
    }

    fun open(t: Task) {
        onRemember(q)
        focusManager.clearFocus()
        onOpen(t)
    }

    val current = res?.takeIf { it.first == q }?.second
    val hits = remember(current) { current?.hits() ?: emptyList() }
    val terms = current?.terms?.map { LocalSearch.fold(it) } ?: emptyList()

    val glass = LocalExtra.current.glass
    val dark = LocalExtra.current.dark
    Box(Modifier.fillMaxSize().then(if (glass == null) Modifier.background(MaterialTheme.colorScheme.background) else Modifier)) {
    // Glass themes: the page is clear, so search brings its own light behind (and hides the day).
    if (glass != null) com.skienlabs.tasks.ui.theme.GlassBackdrop(glass, dark)
    Column(Modifier.fillMaxSize().statusBarsPadding().imePadding()) {
        // Search field
        Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 8.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onClose) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Close search") }
            TextField(
                value = field,
                onValueChange = { field = it.copy(text = it.text.take(200)) },
                placeholder = { Text("Search tasks, steps, #tags…") },
                leadingIcon = {
                    if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.5.dp)
                    else Icon(Icons.Outlined.Search, null)
                },
                trailingIcon = {
                    if (q.isNotEmpty()) IconButton(onClick = { setText(""); focus.requestFocus() }) { Icon(Icons.Outlined.Close, "Clear") }
                },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search, autoCorrectEnabled = false),
                keyboardActions = KeyboardActions(onSearch = { hits.firstOrNull()?.let { open(it.task) } ?: focusManager.clearFocus() }),
                shape = RoundedCornerShape(28.dp),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = LocalExtra.current.surfaceHigh, unfocusedContainerColor = LocalExtra.current.surfaceHigh,
                    focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent,
                ),
                modifier = Modifier.weight(1f).focusRequester(focus),
            )
        }

        // Completions for the word being typed
        val suggestions = current?.suggestions.orEmpty()
        AnimatedVisibility(suggestions.isNotEmpty(), enter = fadeIn(), exit = fadeOut()) {
            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 6.dp)) {
                items(suggestions, key = { it.insert }) { s ->
                    val tag = s.tagId?.let { id -> tags.firstOrNull { it.id == id } }
                    Chip(s.label ?: s.insert, onClick = { apply(s.insert) }) {
                        if (tag != null) TagAvatar(tag, 18.dp) else Icon(Icons.Outlined.NorthWest, null, Modifier.size(15.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 8.dp, end = 8.dp, bottom = 24.dp)) {
            if (q.isBlank()) {
                if (recent.isNotEmpty()) {
                    item(key = "recent-h") {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 12.dp, top = 8.dp)) {
                            Heading("Recent", Modifier.weight(1f))
                            TextButton(onClick = onClearRecent) { Text("Clear") }
                        }
                    }
                    items(recent, key = { "r-$it" }) { r ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable { setText(r) }.padding(horizontal = 12.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Outlined.History, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(r, Modifier.padding(start = 14.dp).weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Icon(Icons.Outlined.NorthWest, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                item(key = "filters") {
                    Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                        Heading("Filters")
                        FlowRow(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            QUICK.forEach { (f, label) -> Chip(label, onClick = { apply(f, replaceLast = false) }) }
                        }
                    }
                }
                if (tags.isNotEmpty()) item(key = "companies") {
                    Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                        Heading("Companies")
                        FlowRow(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            tags.forEach { t ->
                                Chip(t.name, onClick = { apply("#" + LocalSearch.fold(t.name).replace(Regex("\\s+"), ""), replaceLast = false) }) { TagAvatar(t, 18.dp) }
                            }
                        }
                    }
                }
                item(key = "tip") {
                    Text(
                        buildAnnotatedString {
                            append("Tip: combine words and filters, like ")
                            pushStyle(SpanStyle(fontWeight = FontWeight.SemiBold)); append("invoice #softop is:open"); pop()
                            append(". Quotes find exact phrases.")
                        },
                        Modifier.padding(horizontal = 12.dp, vertical = 12.dp),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else if (current != null) {
                item(key = "count") {
                    Row(Modifier.padding(horizontal = 12.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (source == Source.Saved) {
                            Icon(Icons.Outlined.CloudOff, null, Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(" Offline: searching saved days · ", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text(
                            when {
                                hits.isEmpty() -> ""
                                current.fuzzy -> "No exact matches. Close ones (${current.total})"
                                else -> "${current.total} result${if (current.total == 1) "" else "s"}" + if (current.total > hits.size) " · showing ${hits.size}" else ""
                            },
                            style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                if (hits.isEmpty()) item(key = "none") {
                    Column(Modifier.fillMaxWidth().padding(vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Outlined.Search, null, Modifier.size(44.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))
                        Text("No tasks match “${q.trim()}”", Modifier.padding(top = 10.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                val open = hits.filter { it.task.isPending }
                val closed = hits.filter { !it.task.isPending }
                if (open.isNotEmpty()) {
                    item(key = "h-open") { Heading("Open", Modifier.padding(start = 12.dp, top = 8.dp, bottom = 2.dp)) }
                    items(open, key = { "o-" + it.task.id }) { h -> Hit(h, terms, today, tags) { open(h.task) } }
                }
                if (closed.isNotEmpty()) {
                    item(key = "h-closed") { Heading("Done & cancelled", Modifier.padding(start = 12.dp, top = 14.dp, bottom = 2.dp)) }
                    items(closed, key = { "c-" + it.task.id }) { h -> Hit(h, terms, today, tags) { open(h.task) } }
                }
            }
        }
    }
    }
}

@Composable
private fun Heading(text: String, modifier: Modifier = Modifier) {
    Text(
        text.uppercase(), modifier, style = MaterialTheme.typography.labelMedium, letterSpacing = 0.6.sp,
        fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun Chip(label: String, onClick: () -> Unit, icon: (@Composable () -> Unit)? = null) {
    val shape = RoundedCornerShape(50)
    Row(
        Modifier.clip(shape).border(1.dp, LocalExtra.current.outline, shape).clickable(role = Role.Button, onClick = onClick)
            .heightIn(min = 36.dp).padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        icon?.invoke()
        Text(label, style = MaterialTheme.typography.labelLarge, maxLines = 1)
    }
}

/** One result: status, title with the matched words marked, why it matched, its day and company. */
@Composable
private fun Hit(h: SearchHit, terms: List<String>, today: String, tags: List<Tag>, onClick: () -> Unit) {
    val t = h.task
    val x = LocalExtra.current
    val mark = MaterialTheme.colorScheme.primaryContainer
    val onMark = MaterialTheme.colorScheme.onPrimaryContainer
    val company = remember(t.tagIds, tags) { tags.firstOrNull { it.id in t.tagIds } }
    Row(
        Modifier.fillMaxWidth()
            .then(if (x.glass != null) Modifier.padding(vertical = 3.dp).glassPanel(RoundedCornerShape(18.dp)) else Modifier)
            .clip(RoundedCornerShape(16.dp)).clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(Modifier.padding(top = 1.dp).size(22.dp), contentAlignment = Alignment.Center) {
            when {
                t.isPending -> Box(Modifier.size(19.dp).border(2.dp, Palette.priority(t.priority, x.dark), CircleShape))
                t.isDone -> Icon(Icons.Filled.CheckCircle, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
                else -> Icon(Icons.Filled.Block, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(21.dp))
            }
        }
        Column(Modifier.weight(1f).padding(start = 14.dp)) {
            Text(
                highlight(t.title, terms, mark, onMark),
                style = MaterialTheme.typography.bodyLarge,
                color = if (t.isPending) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                textDecoration = if (t.isPending) null else TextDecoration.LineThrough,
            )
            h.match?.let { m ->
                Row(Modifier.padding(top = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(if (m.field == "step") Icons.Outlined.Checklist else Icons.AutoMirrored.Outlined.Notes, null, Modifier.size(15.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        highlight(m.text, terms, mark, onMark), Modifier.padding(start = 4.dp),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        Column(Modifier.padding(start = 10.dp), horizontalAlignment = Alignment.End) {
            Text(
                Dates.shortLabel(t.date, today), style = MaterialTheme.typography.labelMedium,
                color = if (t.date == today) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = if (t.date == today) FontWeight.SemiBold else FontWeight.Normal,
            )
            if (company != null) Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                TagAvatar(company, 16.dp)
                Text(" " + company.name, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = tagColor(company.color), maxLines = 1)
            }
        }
    }
}

/** [text] with every occurrence of [terms] (already folded) marked. */
private fun highlight(text: String, terms: List<String>, bg: Color, fg: Color): AnnotatedString {
    val folded = LocalSearch.fold(text)
    // Folding can change length (rare: some ligatures); then just show the plain text.
    if (folded.length != text.length || terms.isEmpty()) return AnnotatedString(text)
    val hits = terms.filter { it.isNotBlank() }.flatMap { term ->
        generateSequence(folded.indexOf(term).takeIf { it >= 0 }) { i -> folded.indexOf(term, i + term.length).takeIf { it >= 0 } }
            .map { it until it + term.length }.toList()
    }.sortedBy { it.first }
    return buildAnnotatedString {
        append(text)
        var end = -1
        for (r in hits) {
            if (r.first <= end) continue
            addStyle(SpanStyle(background = bg, color = fg), r.first, r.last + 1)
            end = r.last
        }
    }
}

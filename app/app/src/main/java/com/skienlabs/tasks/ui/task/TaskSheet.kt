package com.skienlabs.tasks.ui.task

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import com.skienlabs.tasks.data.Dates
import com.skienlabs.tasks.data.MAX_TAGS_PER_TASK
import com.skienlabs.tasks.data.Store
import com.skienlabs.tasks.data.Tag
import com.skienlabs.tasks.data.Task
import com.skienlabs.tasks.data.TaskPatch
import com.skienlabs.tasks.ui.common.TagChip
import com.skienlabs.tasks.ui.day.StepsEditor
import com.skienlabs.tasks.ui.theme.LocalExtra
import com.skienlabs.tasks.ui.theme.Palette
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

private fun toMillis(date: String) = LocalDate.parse(date).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
private fun fromMillis(ms: Long) = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate().toString()
private fun normalize(s: String) = s.replace(Regex("\\s+"), " ").trim()

/** New task (task == null) or edit. Only edited fields are sent, so changes made elsewhere meanwhile survive. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskSheet(
    store: Store,
    task: Task?,
    defaultDate: String,
    defaultTagId: String?,
    today: String,
    tags: List<Tag>,
    onDismiss: () -> Unit,
    onManageTags: () -> Unit,
) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val key = task?.id ?: "new"
    val original = remember(key) { task }
    var title by rememberSaveable(key) { mutableStateOf(task?.title ?: "") }
    var notes by rememberSaveable(key) { mutableStateOf(task?.notes ?: "") }
    var priority by rememberSaveable(key) { mutableStateOf(task?.priority ?: 4) }
    var date by rememberSaveable(key) { mutableStateOf(task?.date ?: defaultDate) }
    var tagIds by rememberSaveable(key) { mutableStateOf(task?.tagIds ?: listOfNotNull(defaultTagId)) }
    var tagsChanged by rememberSaveable(key) { mutableStateOf(false) }
    // Steps are kept as JSON so they survive rotation.
    var stepsJson by rememberSaveable(key) { mutableStateOf(encodeSteps(task?.subtasks ?: emptyList())) }
    val steps = remember(stepsJson) { decodeSteps(stepsJson) }
    var stepsChanged by rememberSaveable(key) { mutableStateOf(false) }
    // Images: saved ones minus removed, plus new ones; applied on Save.
    var removedImages by remember(key) { mutableStateOf(emptySet<String>()) }
    var newImages by remember(key) { mutableStateOf(emptyList<NewImage>()) }
    var imagesBusy by remember { mutableStateOf(false) }
    var picking by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    val valid = title.isNotBlank() && Dates.isValid(date)
    val dark = LocalExtra.current.dark

    fun close() {
        scope.launch { sheet.hide() }.invokeOnCompletion { onDismiss() }
    }

    fun save() {
        if (!valid) return
        fun applyImages(id: String) {
            removedImages.forEach { store.removeAttachment(id, it) }
            newImages.forEach { store.addAttachment(id, it.prepared) }
        }
        if (task == null) {
            val (created, _) = store.createTask(title, date, priority, notes, tagIds, steps)
            applyImages(created.id)
        } else if (store.state.value.tasks[task.id] == null) {
            // Deleted (maybe on another device) while open: keep the edits on offer.
            val t = title; val n = notes; val p = priority; val d = date; val ids = tagIds; val st = steps
            store.toast("This task was deleted, so changes weren't saved", "Add as new") { store.createTask(t, d, p, n, ids, st) }
        } else {
            // Compare with the task as it was when the sheet opened, so a field changed meanwhile
            // on another device is only overwritten if it was edited here too.
            val o = original ?: task
            val patch = TaskPatch(
                title = normalize(title).takeIf { it != o.title },
                notes = notes.trim().takeIf { it != o.notes },
                priority = priority.takeIf { it != o.priority },
                date = date.takeIf { it != o.date },
                tagIds = tagIds.takeIf { tagsChanged && it.sorted() != o.tagIds.sorted() },
                subtasks = steps.takeIf { stepsChanged && it != o.subtasks },
            )
            if (patch != TaskPatch()) store.updateTask(task.id, patch)
            applyImages(task.id)
        }
        close()
    }

    LaunchedEffect(Unit) { if (task == null) runCatching { focus.requestFocus() } }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().navigationBarsPadding()
                .padding(horizontal = 20.dp).padding(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Text(if (task == null) "New task" else "Edit task", style = MaterialTheme.typography.titleLarge)
            OutlinedTextField(
                value = title, onValueChange = { title = it.replace("\n", " ").take(500) },
                label = { Text("Title") }, maxLines = 4,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                modifier = Modifier.fillMaxWidth().focusRequester(focus),
            )
            OutlinedTextField(
                value = notes, onValueChange = { notes = it.take(5000) },
                label = { Text("Details") }, placeholder = { Text("Add notes") }, minLines = 2, maxLines = 8,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                modifier = Modifier.fillMaxWidth(),
            )
            StepsEditor(steps) {
                stepsJson = encodeSteps(it)
                stepsChanged = true
            }
            val saved = (task?.attachments ?: emptyList()).filter { it.id !in removedImages && !it.uploading }
            ImagesEditor(
                saved = saved, added = newImages, busy = imagesBusy,
                onBusy = { imagesBusy = it },
                onAdd = { newImages = newImages + it },
                onRemoveSaved = { removedImages = removedImages + it.id },
                onRemoveNew = { img -> newImages = newImages.filter { it.prepared.id != img.prepared.id } },
                onError = { store.toast(it) },
            )

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Priority", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    for (p in 1..4) {
                        SegmentedButton(
                            selected = priority == p, onClick = { priority = p },
                            shape = SegmentedButtonDefaults.itemShape(p - 1, 4),
                            icon = { Icon(if (p == 4) Icons.Outlined.Flag else Icons.Filled.Flag, null, Modifier.size(18.dp), tint = Palette.priority(p, dark)) },
                        ) { Text(Palette.priorityLabel(p), maxLines = 1) }
                    }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Tags", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                    TextButton(onClick = onManageTags) { Text("New tag") }
                }
                if (tags.isEmpty()) {
                    Text("Tag tasks by company or project.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        tags.forEach { tag ->
                            val on = tag.id in tagIds
                            TagChip(tag, selected = on, onClick = {
                                tagsChanged = true
                                tagIds = if (on) tagIds - tag.id else if (tagIds.size >= MAX_TAGS_PER_TASK) tagIds else tagIds + tag.id
                            })
                        }
                    }
                    if (tagIds.size >= MAX_TAGS_PER_TASK) Text("Up to $MAX_TAGS_PER_TASK tags per task", style = MaterialTheme.typography.labelSmall)
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Date", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    val quick = listOf("Today" to today, "Tomorrow" to Dates.addDays(today, 1), "Next week" to Dates.addDays(today, 7))
                    quick.forEach { (label, d) -> FilterChip(selected = date == d, onClick = { date = d }, label = { Text(label) }) }
                    val custom = quick.none { it.second == date }
                    FilterChip(
                        selected = custom, onClick = { picking = true },
                        leadingIcon = { Icon(Icons.Outlined.CalendarMonth, null, Modifier.size(18.dp)) },
                        label = { Text(if (custom) Dates.shortLabel(date, today) else "Pick date") },
                    )
                }
            }

            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                if (task != null) {
                    TextButton(onClick = { store.deleteTask(task.id); close() }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
                }
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { close() }) { Text("Cancel") }
                Button(onClick = { save() }, enabled = valid && !imagesBusy, modifier = Modifier.padding(start = 8.dp)) { Text(if (task == null) "Add task" else "Save") }
            }
        }
    }

    if (picking) {
        val state = rememberDatePickerState(initialSelectedDateMillis = toMillis(date), yearRange = 1900..2999)
        DatePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { ms -> fromMillis(ms).takeIf(Dates::isValid)?.let { date = it } }
                    picking = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { picking = false }) { Text("Cancel") } },
        ) { DatePicker(state) }
    }
}

private val stepsSerializer = kotlinx.serialization.builtins.ListSerializer(com.skienlabs.tasks.data.Subtask.serializer())
private fun encodeSteps(list: List<com.skienlabs.tasks.data.Subtask>) = com.skienlabs.tasks.data.AppJson.encodeToString(stepsSerializer, list)
private fun decodeSteps(json: String) = runCatching { com.skienlabs.tasks.data.AppJson.decodeFromString(stepsSerializer, json) }.getOrDefault(emptyList())

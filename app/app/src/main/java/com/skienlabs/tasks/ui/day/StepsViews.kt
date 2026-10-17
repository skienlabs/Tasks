package com.skienlabs.tasks.ui.day

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.SubdirectoryArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.skienlabs.tasks.data.Steps
import com.skienlabs.tasks.data.Subtask
import com.skienlabs.tasks.ui.theme.LocalExtra

private val INDENT = 22.dp

/** Reddit-style thread lines, one per nesting level. */
private fun Modifier.threads(depth: Int, color: androidx.compose.ui.graphics.Color, start: Dp) = drawBehind {
    for (i in 0 until depth) {
        val x = (start + INDENT * i + 11.dp).toPx()
        drawRoundRect(color, Offset(x, 0f), Size(2.dp.toPx(), size.height), CornerRadius(1.dp.toPx()))
    }
}

/** "2/5" with a small bar. Tap to show or hide the steps. */
@Composable
fun StepsProgress(steps: List<Subtask>, open: Boolean, onToggle: () -> Unit) {
    val p = Steps.progress(steps)
    if (p.total == 0) return
    val x = LocalExtra.current
    val color = if (p.complete) x.done else MaterialTheme.colorScheme.onSurfaceVariant
    val rotation by animateFloatAsState(if (open) 180f else 0f, label = "steps")
    Row(
        Modifier.padding(top = 4.dp).clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button, onClick = onToggle)
            .semantics { contentDescription = "${p.done} of ${p.total} steps done. ${if (open) "Hide" else "Show"} steps" }
            .padding(vertical = 3.dp, horizontal = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Checklist, null, Modifier.size(15.dp), tint = color)
        Text(" ${p.done}/${p.total} ", style = MaterialTheme.typography.labelMedium, color = color)
        LinearProgressIndicator(
            progress = { p.done.toFloat() / p.total }, modifier = Modifier.width(44.dp).height(4.dp),
            color = if (p.complete) x.done else MaterialTheme.colorScheme.primary, trackColor = x.surfaceHighest, drawStopIndicator = {},
        )
        Icon(Icons.Filled.ExpandMore, null, Modifier.size(18.dp).rotate(rotation), tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Steps under a task row; ticking saves right away. */
@Composable
fun StepsInline(steps: List<Subtask>, enabled: Boolean, onToggle: (String) -> Unit) {
    val line = LocalExtra.current.outline
    Column(Modifier.padding(top = 2.dp)) {
        Steps.flatten(steps).forEach { row ->
            Row(
                Modifier.fillMaxWidth().heightIn(min = 40.dp).threads(row.depth, line, 0.dp)
                    .clickable(enabled = enabled, role = Role.Checkbox) { onToggle(row.step.id) }
                    .padding(start = INDENT * row.depth),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(checked = row.step.done, onCheckedChange = null, enabled = enabled, modifier = Modifier.size(24.dp).padding(end = 0.dp))
                Text(
                    row.step.title, Modifier.padding(start = 10.dp, top = 6.dp, bottom = 6.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (row.step.done) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                    textDecoration = if (row.step.done) TextDecoration.LineThrough else null,
                )
            }
        }
    }
}

/** Editable step tree for the task sheet; changes stay in the sheet until Save. */
@Composable
fun StepsEditor(value: List<Subtask>, onChange: (List<Subtask>) -> Unit) {
    val x = LocalExtra.current
    var draft by remember { mutableStateOf("") }
    var replyTo by remember { mutableStateOf<String?>(null) }
    val replyStep = replyTo?.let { id -> value.firstOrNull { it.id == id } }
    val focus = remember { FocusRequester() }
    val p = Steps.progress(value)
    val full = value.size >= Steps.MAX_STEPS

    fun submit() {
        val next = Steps.add(value, draft, replyStep?.id)
        if (next !== value) {
            onChange(next)
            draft = ""
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            "Steps" + if (p.total > 0) " · ${p.done}/${p.total} done" else "",
            style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (p.total > 0) {
            Text("The task is completed when every step is ticked.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Steps.flatten(value).forEach { row ->
            val s = row.step
            Row(
                Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(10.dp))
                    .background(if (replyTo == s.id) x.surfaceHigh else androidx.compose.ui.graphics.Color.Transparent)
                    .threads(row.depth, x.outline, 0.dp).padding(start = INDENT * row.depth),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(checked = s.done, onCheckedChange = { onChange(Steps.toggle(value, s.id)) }, modifier = Modifier.size(40.dp))
                StepTitleField(s, Modifier.weight(1f)) { onChange(Steps.rename(value, s.id, it)) }
                if (Steps.depthOf(value, s.id) < Steps.MAX_DEPTH) {
                    IconButton(onClick = { replyTo = s.id; runCatching { focus.requestFocus() } }, modifier = Modifier.size(40.dp)) {
                        Icon(Icons.Filled.SubdirectoryArrowRight, "Add a sub-step under \"${s.title}\"", Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                IconButton(onClick = { onChange(Steps.remove(value, s.id)) }, modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Filled.Close, "Remove step \"${s.title}\"", Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(top = 4.dp).heightIn(min = 46.dp).clip(RoundedCornerShape(12.dp))
                .border(1.dp, x.outline, RoundedCornerShape(12.dp)).padding(start = 12.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Add, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.primary)
            Box(Modifier.weight(1f).padding(start = 10.dp)) {
                if (draft.isEmpty()) {
                    Text(
                        when {
                            full -> "Up to ${Steps.MAX_STEPS} steps"
                            replyStep != null -> "Sub-step of \"${replyStep.title}\""
                            else -> "Add a step"
                        },
                        style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1,
                    )
                }
                BasicTextField(
                    value = draft, onValueChange = { draft = it.replace("\n", " ").take(Steps.TITLE_MAX) },
                    enabled = !full, singleLine = true,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { submit() }), // keeps the keyboard up for the next step
                    modifier = Modifier.fillMaxWidth().focusRequester(focus).semantics { contentDescription = "New step" },
                )
            }
            if (replyStep != null) {
                IconButton(onClick = { replyTo = null }, modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Filled.Close, "Add at the top level instead", Modifier.size(18.dp))
                }
            }
            if (draft.isNotBlank()) {
                IconButton(onClick = { submit() }, modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Filled.Add, "Add step", tint = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

/** Editable title; every non-empty edit is kept (so Save never misses the last keystrokes). */
@Composable
private fun StepTitleField(step: Subtask, modifier: Modifier, onRename: (String) -> Unit) {
    var text by remember(step.id) { mutableStateOf(step.title) }
    var focused by remember { mutableStateOf(false) }
    fun commit() {
        if (text.isBlank()) text = step.title
    }
    BasicTextField(
        value = text,
        onValueChange = {
            text = it.replace("\n", " ").take(Steps.TITLE_MAX)
            if (text.isNotBlank() && text.trim() != step.title) onRename(text)
        },
        singleLine = true,
        textStyle = MaterialTheme.typography.bodyLarge.copy(
            color = if (step.done) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
            textDecoration = if (step.done) TextDecoration.LineThrough else null,
        ),
        cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { commit() }),
        modifier = modifier.padding(vertical = 8.dp).onFocusChanged {
            if (focused && !it.isFocused) commit()
            focused = it.isFocused
        }.semantics { contentDescription = "Step title" },
    )
}

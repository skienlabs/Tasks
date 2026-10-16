package com.skienlabs.tasks.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.skienlabs.tasks.data.Counts
import com.skienlabs.tasks.data.Dates
import com.skienlabs.tasks.ui.theme.LocalExtra
import java.time.YearMonth

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MonthSheet(
    month: YearMonth,
    selected: String,
    today: String,
    summary: Map<String, Counts>,
    onMonth: (YearMonth) -> Unit,
    onPick: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val x = LocalExtra.current
    val grid = remember(month) { Dates.monthGrid(month) }
    val letters = remember { Dates.weekdayLetters() }
    val min = YearMonth.of(1900, 1)
    val max = YearMonth.of(2999, 12)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 12.dp).padding(bottom = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(Dates.monthYear(month), style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f).padding(start = 8.dp))
                val thisMonth = YearMonth.parse(today.take(7))
                if (month != thisMonth) TextButton(onClick = { onMonth(thisMonth) }) { Text("This month") }
                IconButton(onClick = { onMonth(month.minusMonths(1)) }, enabled = month > min) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, "Previous month") }
                IconButton(onClick = { onMonth(month.plusMonths(1)) }, enabled = month < max) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, "Next month") }
            }
            Row(Modifier.fillMaxWidth().padding(top = 8.dp)) {
                letters.forEach {
                    Text(it, Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                }
            }
            for (week in 0 until 6) {
                Row(Modifier.fillMaxWidth()) {
                    for (i in 0 until 7) {
                        val d = grid[week * 7 + i]
                        val inMonth = d.startsWith(month.toString())
                        val isSel = d == selected
                        val isToday = d == today
                        val c = summary[d]
                        Column(
                            Modifier.weight(1f).aspectRatio(1f).clip(CircleShape)
                                .clickable(enabled = Dates.isValid(d)) { onPick(d) }
                                .semantics { contentDescription = Dates.fullLabel(d) },
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Box(
                                Modifier.size(36.dp).clip(CircleShape).background(
                                    when {
                                        isToday -> MaterialTheme.colorScheme.primary
                                        isSel -> MaterialTheme.colorScheme.primaryContainer
                                        else -> Color.Transparent
                                    },
                                ),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    d.takeLast(2).trimStart('0'),
                                    style = MaterialTheme.typography.bodyLarge,
                                    fontWeight = if (isToday || isSel) FontWeight.Bold else FontWeight.Normal,
                                    color = when {
                                        isToday -> MaterialTheme.colorScheme.onPrimary
                                        isSel -> MaterialTheme.colorScheme.onPrimaryContainer
                                        inMonth -> MaterialTheme.colorScheme.onSurface
                                        else -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                                    },
                                )
                            }
                            // One dot: red = left on a past day, blue = left, green = all done.
                            val dot = when {
                                c == null || c.active == 0 -> null
                                c.pending == 0 -> x.done
                                d < today -> x.overdue
                                else -> x.pending
                            }
                            Box(Modifier.padding(top = 2.dp).size(5.dp).clip(CircleShape).background(dot ?: Color.Transparent))
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.Center) {
                listOf(x.pending to "Left", x.done to "All done", x.overdue to "Overdue").forEach { (c, l) ->
                    Box(Modifier.padding(start = 12.dp, top = 5.dp).size(8.dp).clip(CircleShape).background(c))
                    Text(" $l", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Box(Modifier.height(4.dp))
        }
    }
}

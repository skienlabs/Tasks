package com.skienlabs.tasks.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape
import com.skienlabs.tasks.R

val GoogleSans = FontFamily(
    Font(R.font.google_sans_regular, FontWeight.Normal),
    Font(R.font.google_sans_medium, FontWeight.Medium),
    Font(R.font.google_sans_bold, FontWeight.Bold),
)

/** Extra colors outside Material's scheme (same tokens as the web app). */
@Immutable
data class Extra(
    val dark: Boolean,
    val surfaceHigh: Color,
    val surfaceHighest: Color,
    val outline: Color,
    val done: Color,
    val pending: Color,
    val overdue: Color,
    val cancelled: Color,
    val postponed: Color,
    val rate: Color,
    val gradient: List<Color>,
    val overdueBg: Color,
    val overdueBorder: Color,
)

private val LightExtra = Extra(
    dark = false,
    surfaceHigh = Color(0xFFF0F4F9),
    surfaceHighest = Color(0xFFE9EEF6),
    outline = Color(0xFFC4C7C5),
    done = Color(0xFF188038),
    pending = Color(0xFF1A73E8),
    overdue = Color(0xFFD93025),
    cancelled = Color(0xFF80868B),
    postponed = Color(0xFF12838F),
    rate = Color(0xFF9334E6),
    gradient = listOf(Color(0xFF1A73E8), Color(0xFF9334E6), Color(0xFFD01884)),
    overdueBg = Color(0xFFFDF3F2),
    overdueBorder = Color(0xFFF6CFCB),
)

private val DarkExtra = Extra(
    dark = true,
    surfaceHigh = Color(0xFF0F1012),
    surfaceHighest = Color(0xFF1B1C1E),
    outline = Color(0xFF3C3F43),
    done = Color(0xFF81C995),
    pending = Color(0xFF8AB4F8),
    overdue = Color(0xFFF28B82),
    cancelled = Color(0xFF9AA0A6),
    postponed = Color(0xFF78D9EC),
    rate = Color(0xFFD7AEFB),
    gradient = listOf(Color(0xFF8AB4F8), Color(0xFFD7AEFB), Color(0xFFFF8BCB)),
    overdueBg = Color(0xFF140807),
    overdueBorder = Color(0xFF5C2B29),
)

// Soft dark grey, like Google's own dark mode.
private val DimExtra = DarkExtra.copy(
    surfaceHigh = Color(0xFF1E1F20),
    surfaceHighest = Color(0xFF282A2C),
    outline = Color(0xFF444746),
    overdueBg = Color(0xFF2A1D1C),
    overdueBorder = Color(0xFF8C3B35),
)

// Deep navy, after VS Code's Abyss theme.
private val AbyssExtra = DarkExtra.copy(
    surfaceHigh = Color(0xFF060621),
    surfaceHighest = Color(0xFF0E1B3A),
    outline = Color(0xFF22325A),
    pending = Color(0xFF82AAFF),
    overdueBg = Color(0xFF1D0B1C),
    overdueBorder = Color(0xFF7A3049),
)

val LocalExtra = staticCompositionLocalOf { LightExtra }

private val LightColors = lightColorScheme(
    primary = Color(0xFF0B57D0),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD3E3FD),
    onPrimaryContainer = Color(0xFF041E49),
    secondaryContainer = Color(0xFFD3E3FD),
    onSecondaryContainer = Color(0xFF041E49),
    background = Color.White,
    onBackground = Color(0xFF1F1F1F),
    surface = Color.White,
    onSurface = Color(0xFF1F1F1F),
    surfaceVariant = Color(0xFFF0F4F9),
    onSurfaceVariant = Color(0xFF444746),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFF8FAFD),
    surfaceContainer = Color(0xFFF0F4F9),
    surfaceContainerHigh = Color(0xFFE9EEF6),
    surfaceContainerHighest = Color(0xFFDDE3EA),
    outline = Color(0xFFC4C7C5),
    outlineVariant = Color(0xFFE3E3E3),
    error = Color(0xFFB3261E),
    inverseSurface = Color(0xFF303030),
    inverseOnSurface = Color(0xFFF2F2F2),
    inversePrimary = Color(0xFFA8C7FA),
)

// AMOLED: true black everywhere the eye rests; slightly lifted surfaces for sheets and cards.
private val DarkColors = darkColorScheme(
    primary = Color(0xFFA8C7FA),
    onPrimary = Color(0xFF062E6F),
    primaryContainer = Color(0xFF0842A0),
    onPrimaryContainer = Color(0xFFD3E3FD),
    secondaryContainer = Color(0xFF0842A0),
    onSecondaryContainer = Color(0xFFD3E3FD),
    background = Color.Black,
    onBackground = Color(0xFFE3E3E3),
    surface = Color.Black,
    onSurface = Color(0xFFE3E3E3),
    surfaceVariant = Color(0xFF1B1C1E),
    onSurfaceVariant = Color(0xFFA6A8AB),
    surfaceContainerLowest = Color.Black,
    surfaceContainerLow = Color(0xFF0A0A0B),
    surfaceContainer = Color(0xFF0F1012),
    surfaceContainerHigh = Color(0xFF151618),
    surfaceContainerHighest = Color(0xFF1F2023),
    outline = Color(0xFF3C3F43),
    outlineVariant = Color(0xFF222426),
    error = Color(0xFFF2B8B5),
    inverseSurface = Color(0xFFE3E3E3),
    inverseOnSurface = Color(0xFF1F1F1F),
    inversePrimary = Color(0xFF0B57D0),
)

private val DimColors = DarkColors.copy(
    background = Color(0xFF131314),
    surface = Color(0xFF131314),
    surfaceVariant = Color(0xFF282A2C),
    onSurfaceVariant = Color(0xFFC4C7C5),
    surfaceContainerLowest = Color(0xFF0E0E0F),
    surfaceContainerLow = Color(0xFF1B1B1C),
    surfaceContainer = Color(0xFF1E1F20),
    surfaceContainerHigh = Color(0xFF282A2C),
    surfaceContainerHighest = Color(0xFF333537),
    outline = Color(0xFF444746),
    outlineVariant = Color(0xFF2D2F31),
)

private val AbyssColors = DarkColors.copy(
    primary = Color(0xFF82AAFF),
    onPrimary = Color(0xFF00204F),
    primaryContainer = Color(0xFF16336B),
    onPrimaryContainer = Color(0xFFD8E2FF),
    secondaryContainer = Color(0xFF16336B),
    onSecondaryContainer = Color(0xFFD8E2FF),
    background = Color(0xFF000C18),
    onBackground = Color(0xFFD4DCF2),
    surface = Color(0xFF000C18),
    onSurface = Color(0xFFD4DCF2),
    surfaceVariant = Color(0xFF0E1B3A),
    onSurfaceVariant = Color(0xFF8695BB),
    surfaceContainerLowest = Color(0xFF000812),
    surfaceContainerLow = Color(0xFF030F22),
    surfaceContainer = Color(0xFF060621),
    surfaceContainerHigh = Color(0xFF0A1630),
    surfaceContainerHighest = Color(0xFF0E1B3A),
    outline = Color(0xFF22325A),
    outlineVariant = Color(0xFF0F1D36),
    error = Color(0xFFFF9E9E),
    inverseSurface = Color(0xFFD4DCF2),
    inverseOnSurface = Color(0xFF000C18),
    inversePrimary = Color(0xFF2B5BB8),
)

/** The looks people can pick (Account → Theme). Same set as the web app. */
enum class AppTheme(val dark: Boolean, val label: String, val background: Color, val card: Color, val accent: Color) {
    LIGHT(false, "Light", Color.White, Color(0xFFF0F4F9), Color(0xFF0B57D0)),
    DIM(true, "Dark", Color(0xFF131314), Color(0xFF1E1F20), Color(0xFFA8C7FA)),
    MIDNIGHT(true, "Midnight Black", Color.Black, Color(0xFF0F1012), Color(0xFFA8C7FA)),
    ABYSS(true, "Abyss", Color(0xFF000C18), Color(0xFF060621), Color(0xFF82AAFF)),
}

private val base = Typography()
private fun TextStyle.g() = copy(fontFamily = GoogleSans)
private val AppTypography = Typography(
    displayLarge = base.displayLarge.g(), displayMedium = base.displayMedium.g(), displaySmall = base.displaySmall.g(),
    headlineLarge = base.headlineLarge.g(), headlineMedium = base.headlineMedium.g(), headlineSmall = base.headlineSmall.g(),
    titleLarge = base.titleLarge.g().copy(fontWeight = FontWeight.Normal), titleMedium = base.titleMedium.g(), titleSmall = base.titleSmall.g(),
    bodyLarge = base.bodyLarge.g(), bodyMedium = base.bodyMedium.g(), bodySmall = base.bodySmall.g(),
    labelLarge = base.labelLarge.g(), labelMedium = base.labelMedium.g(), labelSmall = base.labelSmall.g().copy(fontSize = 11.sp),
)

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

@Composable
fun TasksTheme(dark: Boolean, content: @Composable () -> Unit) =
    TasksTheme(if (dark) AppTheme.MIDNIGHT else AppTheme.LIGHT, content)

@Composable
fun TasksTheme(theme: AppTheme, content: @Composable () -> Unit) {
    val extra = when (theme) {
        AppTheme.LIGHT -> LightExtra
        AppTheme.DIM -> DimExtra
        AppTheme.MIDNIGHT -> DarkExtra
        AppTheme.ABYSS -> AbyssExtra
    }
    val colors = when (theme) {
        AppTheme.LIGHT -> LightColors
        AppTheme.DIM -> DimColors
        AppTheme.MIDNIGHT -> DarkColors
        AppTheme.ABYSS -> AbyssColors
    }
    androidx.compose.runtime.CompositionLocalProvider(LocalExtra provides extra) {
        MaterialTheme(
            colorScheme = colors,
            typography = AppTypography,
            shapes = AppShapes,
            content = content,
        )
    }
}

object Palette {
    data class P(val label: String, val light: Color, val dark: Color)

    /** Tag colors (keys match the server). */
    val tags: Map<String, P> = linkedMapOf(
        "blue" to P("Blue", Color(0xFF1A73E8), Color(0xFF8AB4F8)),
        "red" to P("Red", Color(0xFFD93025), Color(0xFFF28B82)),
        "green" to P("Green", Color(0xFF188038), Color(0xFF81C995)),
        "yellow" to P("Yellow", Color(0xFFE37400), Color(0xFFFDD663)),
        "orange" to P("Orange", Color(0xFFE8710A), Color(0xFFFCAD70)),
        "purple" to P("Purple", Color(0xFF9334E6), Color(0xFFD7AEFB)),
        "pink" to P("Pink", Color(0xFFD01884), Color(0xFFFF8BCB)),
        "teal" to P("Teal", Color(0xFF12838F), Color(0xFF78D9EC)),
        "indigo" to P("Indigo", Color(0xFF3F51B5), Color(0xFF9FA8DA)),
        "brown" to P("Brown", Color(0xFF795548), Color(0xFFBCAAA4)),
        "grey" to P("Grey", Color(0xFF5F6368), Color(0xFFBDC1C6)),
    )

    val priorities = listOf(
        P("High", Color(0xFFD93025), Color(0xFFF28B82)),
        P("Medium", Color(0xFFE37400), Color(0xFFFDD663)),
        P("Low", Color(0xFF1A73E8), Color(0xFF8AB4F8)),
        P("None", Color(0xFF80868B), Color(0xFF80868B)),
    )

    fun tag(key: String, dark: Boolean): Color = (tags[key] ?: tags.getValue("blue")).let { if (dark) it.dark else it.light }
    fun priority(p: Int, dark: Boolean): Color = priorities[(p - 1).coerceIn(0, 3)].let { if (dark) it.dark else it.light }
    fun priorityLabel(p: Int) = priorities[(p - 1).coerceIn(0, 3)].label
}

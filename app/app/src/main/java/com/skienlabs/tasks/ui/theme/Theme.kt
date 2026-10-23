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
    /** Set for the Glass theme: see-through panels over moving light (see Glass.kt). */
    val glass: GlassStyle? = null,
    /** Task cards are neutral (colour only marks things): fill, outline, and the tag/badge pills. */
    val card: Color = surfaceHigh,
    val cardBorder: Color = outline.copy(alpha = 0.5f),
    val chip: Color = surfaceHighest,
    /** Top bar colour (VS Code style themes: a shade darker than the page). Unspecified = the page. */
    val bar: Color = Color.Unspecified,
    /** Black & White themes: shades of the ink instead of hues (only lateness stays red). */
    val mono: Boolean = false,
)

/** How a Glass theme looks: the lights behind, and the panels floating over them. */
@Immutable
data class GlassStyle(
    val base: Color,
    val blobs: List<Color>,
    val blobAlpha: Float,
    /** Fill of a panel (task card, summary card). */
    val panel: Color,
    /** Fill of bars that need to stay readable (navigation bar). */
    val panelStrong: Color,
    /** The rim of a panel, and the brighter light along its top edge. */
    val edge: Color,
    val shine: Color,
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

// Deep navy, after VS Code's Abyss theme: layered blues and its blue / purple / gold accents.
private val AbyssExtra = DarkExtra.copy(
    surfaceHigh = Color(0xFF0A1A33),
    surfaceHighest = Color(0xFF132648),
    outline = Color(0xFF2A3F6B),
    pending = Color(0xFF7FA6FF),
    rate = Color(0xFFDDBB88),
    gradient = listOf(Color(0xFF6688CC), Color(0xFF9966B8), Color(0xFFDDBB88)),
    overdueBg = Color(0xFF230C1F),
    overdueBorder = Color(0xFF8A3556),
)


// Charcoal greys and blue, after VS Code's dark theme: a darker title bar around a slightly
// lighter page, hairline borders, VS Code's blue and syntax colours.
private val VsDarkExtra = DarkExtra.copy(
    surfaceHigh = Color(0xFF252526),
    surfaceHighest = Color(0xFF2D2D30),
    outline = Color(0xFF454545),
    pending = Color(0xFF4DAAFC),
    done = Color(0xFF89D185),
    overdue = Color(0xFFF48771),
    rate = Color(0xFFC586C0),
    gradient = listOf(Color(0xFF4FC1FF), Color(0xFFC586C0), Color(0xFFDCDCAA)),
    overdueBg = Color(0xFF3A2320),
    overdueBorder = Color(0xFF7A3B33),
    card = Color(0xFF252526),
    cardBorder = Color(0xFF2F2F31),
    chip = Color(0xFF313131),
    bar = Color(0xFF181818),
)

// Black and white only: a black page, white ink; lateness keeps a touch of red.
private val MonoExtra = DarkExtra.copy(
    surfaceHigh = Color(0xFF0E0E0E),
    surfaceHighest = Color(0xFF1C1C1C),
    outline = Color(0xFF4A4A4A),
    done = Color.White,
    pending = Color(0xFF8F8F8F),
    overdue = Color(0xFFFF8A80),
    cancelled = Color(0xFF5E5E5E),
    postponed = Color(0xFFC2C2C2),
    rate = Color.White,
    gradient = listOf(Color.White, Color(0xFF9E9E9E), Color.White),
    overdueBg = Color(0xFF1A0E0D),
    overdueBorder = Color(0xFF7A3A35),
    card = Color(0xFF0B0B0B),
    cardBorder = Color(0xFF2B2B2B),
    chip = Color(0xFF1C1C1C),
    mono = true,
)

// The same, inverted: a white page, black ink.
private val MonoLightExtra = LightExtra.copy(
    surfaceHigh = Color(0xFFF4F4F4),
    surfaceHighest = Color(0xFFE9E9E9),
    outline = Color(0xFFBDBDBD),
    done = Color.Black,
    pending = Color(0xFF707070),
    overdue = Color(0xFFC62828),
    cancelled = Color(0xFFA3A3A3),
    postponed = Color(0xFF3D3D3D),
    rate = Color.Black,
    gradient = listOf(Color.Black, Color(0xFF6B6B6B), Color.Black),
    overdueBg = Color(0xFFFBEDED),
    overdueBorder = Color(0xFFE3A6A6),
    card = Color.White,
    cardBorder = Color(0xFFDEDEDE),
    chip = Color(0xFFF0F0F0),
    mono = true,
)

// Liquid glass on white: milky panels over soft pastel light.
private val GlassLightExtra = LightExtra.copy(
    surfaceHigh = Color(0x99FFFFFF),
    surfaceHighest = Color(0xCCFFFFFF),
    outline = Color(0x381E2846),
    pending = Color(0xFF0A63E0),
    rate = Color(0xFF8B3CF0),
    gradient = listOf(Color(0xFF2F6BFF), Color(0xFF8B3CF0), Color(0xFFE0388F)),
    overdueBg = Color(0x14D93025),
    overdueBorder = Color(0x80D93025),
    glass = GlassStyle(
        base = Color(0xFFEEF1F8),
        blobs = listOf(Color(0xFF8FB3FF), Color(0xFFFFB3D9), Color(0xFF9FF0D8), Color(0xFFFFD59E), Color(0xFFC7B3FF)),
        blobAlpha = 0.8f,
        panel = Color(0x8CFFFFFF),
        panelStrong = Color(0xD9FFFFFF),
        edge = Color(0xB3FFFFFF),
        shine = Color(0xFFFFFFFF),
    ),
)

private val LightCards = LightExtra.copy(card = Color.White, cardBorder = Color(0xFFE1E5EA), chip = Color(0xFFF0F3F8))
private val DarkCards = DarkExtra.copy(card = Color(0xFF0D0E10), cardBorder = Color(0xFF202225), chip = Color(0xFF1B1C1F))
private val DimCards = DimExtra.copy(card = Color(0xFF1B1C1D), cardBorder = Color(0xFF2D2F31), chip = Color(0xFF282A2C))
private val AbyssCards = AbyssExtra.copy(card = Color(0xFF06162B), cardBorder = Color(0xFF13264A), chip = Color(0xFF0F2342))

val LocalExtra = staticCompositionLocalOf { LightCards }

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
    primary = Color(0xFF7FA6FF),
    onPrimary = Color(0xFF00204F),
    primaryContainer = Color(0xFF1B3F7E),
    onPrimaryContainer = Color(0xFFDCE6FF),
    secondaryContainer = Color(0xFF1B3F7E),
    onSecondaryContainer = Color(0xFFDCE6FF),
    background = Color(0xFF000C18),
    onBackground = Color(0xFFE0E7FA),
    surface = Color(0xFF000C18),
    onSurface = Color(0xFFE0E7FA),
    surfaceVariant = Color(0xFF132648),
    onSurfaceVariant = Color(0xFF93A3C9),
    surfaceContainerLowest = Color(0xFF000812),
    surfaceContainerLow = Color(0xFF020F1F),
    surfaceContainer = Color(0xFF0A1A33),
    surfaceContainerHigh = Color(0xFF0F2040),
    surfaceContainerHighest = Color(0xFF132648),
    outline = Color(0xFF2A3F6B),
    outlineVariant = Color(0xFF11203D),
    error = Color(0xFFFF9E9E),
    tertiary = Color(0xFFDDBB88),
    inverseSurface = Color(0xFFE0E7FA),
    inverseOnSurface = Color(0xFF000C18),
    inversePrimary = Color(0xFF2B5BB8),
)


// VS Code's dark theme: #1f1f1f page, #181818 bars, #252526 panels, #2b2b2b borders.
private val VsDarkColors = DarkColors.copy(
    primary = Color(0xFF4DAAFC),
    onPrimary = Color(0xFF002544),
    primaryContainer = Color(0xFF04395E),
    onPrimaryContainer = Color(0xFFD6EBFF),
    secondaryContainer = Color(0xFF04395E),
    onSecondaryContainer = Color(0xFFD6EBFF),
    background = Color(0xFF1F1F1F),
    onBackground = Color(0xFFCCCCCC),
    surface = Color(0xFF1F1F1F),
    onSurface = Color(0xFFCCCCCC),
    surfaceVariant = Color(0xFF2D2D30),
    onSurfaceVariant = Color(0xFF9D9D9D),
    surfaceContainerLowest = Color(0xFF181818),
    surfaceContainerLow = Color(0xFF202020),
    surfaceContainer = Color(0xFF252526),
    surfaceContainerHigh = Color(0xFF2A2D2E),
    surfaceContainerHighest = Color(0xFF313131),
    outline = Color(0xFF454545),
    outlineVariant = Color(0xFF2B2B2B),
    error = Color(0xFFF48771),
    inverseSurface = Color(0xFFCCCCCC),
    inverseOnSurface = Color(0xFF1F1F1F),
    inversePrimary = Color(0xFF0078D4),
)

private val MonoColors = DarkColors.copy(
    primary = Color.White,
    onPrimary = Color.Black,
    primaryContainer = Color.White,
    onPrimaryContainer = Color.Black,
    secondaryContainer = Color.White,
    onSecondaryContainer = Color.Black,
    background = Color.Black,
    onBackground = Color.White,
    surface = Color.Black,
    onSurface = Color.White,
    surfaceVariant = Color(0xFF1C1C1C),
    onSurfaceVariant = Color(0xFFA8A8A8),
    surfaceContainerLowest = Color.Black,
    surfaceContainerLow = Color(0xFF0A0A0A),
    surfaceContainer = Color(0xFF111111),
    surfaceContainerHigh = Color(0xFF171717),
    surfaceContainerHighest = Color(0xFF1F1F1F),
    outline = Color(0xFF4A4A4A),
    outlineVariant = Color(0xFF262626),
    error = Color(0xFFFF8A80),
    inverseSurface = Color.White,
    inverseOnSurface = Color.Black,
    inversePrimary = Color.Black,
)

private val MonoLightColors = LightColors.copy(
    primary = Color.Black,
    onPrimary = Color.White,
    primaryContainer = Color.Black,
    onPrimaryContainer = Color.White,
    secondaryContainer = Color.Black,
    onSecondaryContainer = Color.White,
    background = Color.White,
    onBackground = Color.Black,
    surface = Color.White,
    onSurface = Color.Black,
    surfaceVariant = Color(0xFFF4F4F4),
    onSurfaceVariant = Color(0xFF555555),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFFAFAFA),
    surfaceContainer = Color(0xFFF4F4F4),
    surfaceContainerHigh = Color(0xFFEEEEEE),
    surfaceContainerHighest = Color(0xFFE6E6E6),
    outline = Color(0xFFBDBDBD),
    outlineVariant = Color(0xFFE4E4E4),
    error = Color(0xFFC62828),
    inverseSurface = Color.Black,
    inverseOnSurface = Color.White,
    inversePrimary = Color.White,
)

private val GlassLightColors = LightColors.copy(
    primary = Color(0xFF0A63E0),
    onPrimary = Color.White,
    primaryContainer = Color(0x330A63E0),
    onPrimaryContainer = Color(0xFF06306E),
    secondaryContainer = Color(0x330A63E0),
    onSecondaryContainer = Color(0xFF06306E),
    background = Color.Transparent,
    onBackground = Color(0xFF141821),
    surface = Color(0xFFF7F8FC),
    onSurface = Color(0xFF141821),
    surfaceVariant = Color(0xCCFFFFFF),
    onSurfaceVariant = Color(0xFF4A5068),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFF7F8FC),
    surfaceContainer = Color(0xFFF1F3FA),
    surfaceContainerHigh = Color(0xFFEBEEF7),
    surfaceContainerHighest = Color(0xFFE3E7F2),
    outline = Color(0x4D1E2846),
    outlineVariant = Color(0x261E2846),
    error = Color(0xFFC62828),
)

/** The looks people can pick (Account → Theme). Same set as the web app. */
enum class AppTheme(val dark: Boolean, val label: String, val background: Color, val card: Color, val accent: Color) {
    LIGHT(false, "Light", Color.White, Color(0xFFF0F4F9), Color(0xFF0B57D0)),
    // Saved as GRAY (it used to be a light grey); now VS Code's dark theme.
    GRAY(true, "Dark Gray", Color(0xFF1F1F1F), Color(0xFF252526), Color(0xFF4DAAFC)),
    DIM(true, "Dark", Color(0xFF131314), Color(0xFF1E1F20), Color(0xFFA8C7FA)),
    MIDNIGHT(true, "Midnight Black", Color.Black, Color(0xFF0F1012), Color(0xFFA8C7FA)),
    ABYSS(true, "Abyss", Color(0xFF000C18), Color(0xFF060621), Color(0xFF82AAFF)),
    MONO(true, "Black & White", Color.Black, Color(0xFF1C1C1C), Color.White),
    MONO_LIGHT(false, "White & Black", Color.White, Color(0xFFEDEDED), Color.Black),
    GLASS_LIGHT(false, "Glass White", Color(0xFFEEF1F8), Color(0xB3FFFFFF), Color(0xFF0A63E0)),
    ;

    val glass get() = this == GLASS_LIGHT

    /** For the small theme cards, where "Midnight Black" doesn't fit. */
    val shortLabel get() = when (this) {
        MIDNIGHT -> "Midnight"
        MONO -> "Black & White"
        MONO_LIGHT -> "White & Black"
        else -> label
    }
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
        AppTheme.LIGHT -> LightCards
        AppTheme.GRAY -> VsDarkExtra
        AppTheme.DIM -> DimCards
        AppTheme.MIDNIGHT -> DarkCards
        AppTheme.ABYSS -> AbyssCards
        AppTheme.MONO -> MonoExtra
        AppTheme.MONO_LIGHT -> MonoLightExtra
        AppTheme.GLASS_LIGHT -> GlassLightExtra
    }
    val colors = when (theme) {
        AppTheme.LIGHT -> LightColors
        AppTheme.GRAY -> VsDarkColors
        AppTheme.DIM -> DimColors
        AppTheme.MIDNIGHT -> DarkColors
        AppTheme.ABYSS -> AbyssColors
        AppTheme.MONO -> MonoColors
        AppTheme.MONO_LIGHT -> MonoLightColors
        AppTheme.GLASS_LIGHT -> GlassLightColors
    }
    androidx.compose.runtime.CompositionLocalProvider(LocalExtra provides extra) {
        MaterialTheme(
            colorScheme = colors,
            typography = AppTypography,
            shapes = AppShapes,
        ) {
            val g = extra.glass
            if (g == null) content()
            else GlassLayer(g, theme.dark, content)
        }
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

    private val monoShades = mapOf(true to listOf(Color.White, Color(0xFFC2C2C2), Color(0xFF8F8F8F), Color(0xFF5E5E5E)), false to listOf(Color.Black, Color(0xFF3D3D3D), Color(0xFF707070), Color(0xFFA3A3A3)))

    /** A priority's colour in the current theme (Black & White themes: shades of the ink). */
    fun priority(p: Int, x: Extra): Color = if (x.mono) monoShades.getValue(x.dark)[(p - 1).coerceIn(0, 3)] else priority(p, x.dark)

    /** A tag's colour in the current theme (Black & White themes: one grey). */
    fun tag(key: String, x: Extra): Color = if (x.mono) monoShades.getValue(x.dark)[1] else tag(key, x.dark)

    fun tag(key: String, dark: Boolean): Color = (tags[key] ?: tags.getValue("blue")).let { if (dark) it.dark else it.light }
    fun priority(p: Int, dark: Boolean): Color = priorities[(p - 1).coerceIn(0, 3)].let { if (dark) it.dark else it.light }
    fun priorityLabel(p: Int) = priorities[(p - 1).coerceIn(0, 3)].label
}

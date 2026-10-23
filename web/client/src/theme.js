import { createTheme } from '@mui/material/styles';

const FONT = '"Google Sans", "Roboto", system-ui, -apple-system, "Segoe UI", Arial, sans-serif';

// Material 3 palettes. Every theme is light or dark (palette.mode); the dark ones differ in depth.
const DARK_ACCENTS = {
  primary: '#a8c7fa',
  onPrimary: '#062e6f',
  primaryContainer: '#0842a0',
  onPrimaryContainer: '#d3e3fd',
  error: '#f2b8b5',
  success: '#6dd58c',
  warning: '#fdd663',
};

// Every theme also has card colours (task cards are neutral; colour only marks things) and
// `sidebar`, the colour of the side bar and top bar.
const TOKENS = {
  light: {
    primary: '#0b57d0',
    onPrimary: '#ffffff',
    primaryContainer: '#d3e3fd',
    onPrimaryContainer: '#041e49',
    bg: '#ffffff',
    surface: '#f8fafd',
    surfaceHigh: '#f0f4f9',
    surfaceHighest: '#e9eef6',
    text: '#1f1f1f',
    textMuted: '#444746',
    outline: '#c4c7c5',
    divider: '#e3e3e3',
    error: '#b3261e',
    success: '#146c2e',
    warning: '#b06000',
    card: '#ffffff',
    cardBorder: '#e1e5ea',
    cardHover: '#f6f8fc',
    chip: '#f0f3f8',
  },
  // Charcoal greys and blue, after VS Code's dark theme: a darker side bar and title bar
  // around a slightly lighter page, hairline borders, VS Code's blue and syntax colours.
  gray: {
    primary: '#4daafc',
    onPrimary: '#002544',
    primaryContainer: '#04395e',
    onPrimaryContainer: '#d6ebff',
    bg: '#1f1f1f',
    sidebar: '#181818',
    surface: '#1f1f1f',
    surfaceHigh: '#252526',
    surfaceHighest: '#2d2d30',
    text: '#cccccc',
    textMuted: '#9d9d9d',
    outline: '#454545',
    divider: '#2b2b2b',
    error: '#f48771',
    success: '#89d185',
    warning: '#cca700',
    card: '#252526',
    cardBorder: '#2f2f31',
    cardHover: '#2a2d2e',
    chip: '#313131',
    gradient: ['#4fc1ff', '#c586c0', '#dcdcaa'],
  },
  // Soft dark grey, like Google's own dark mode.
  dim: {
    ...DARK_ACCENTS,
    bg: '#131314',
    surface: '#131314',
    surfaceHigh: '#1e1f20',
    surfaceHighest: '#282a2c',
    text: '#e3e3e3',
    textMuted: '#c4c7c5',
    outline: '#444746',
    divider: '#2d2f31',
    card: '#1b1c1d',
    cardBorder: '#2d2f31',
    cardHover: '#222325',
    chip: '#282a2c',
  },
  // True black for OLED screens.
  dark: {
    ...DARK_ACCENTS,
    bg: '#000000',
    surface: '#000000',
    surfaceHigh: '#0f1012',
    surfaceHighest: '#1b1c1e',
    text: '#e3e3e3',
    textMuted: '#a6a8ab',
    outline: '#3c3f43',
    divider: '#222426',
    card: '#0d0e10',
    cardBorder: '#202225',
    cardHover: '#141518',
    chip: '#1b1c1f',
  },
  // Deep navy, after VS Code's Abyss: layered blues, a soft glow, and its blue/purple/gold accents.
  abyss: {
    primary: '#7fa6ff',
    onPrimary: '#00204f',
    primaryContainer: '#1b3f7e',
    onPrimaryContainer: '#dce6ff',
    bg: '#000c18',
    surface: '#020f1f',
    surfaceHigh: '#0a1a33',
    surfaceHighest: '#132648',
    text: '#e0e7fa',
    textMuted: '#93a3c9',
    outline: '#2a3f6b',
    divider: '#11203d',
    error: '#ff9e9e',
    success: '#7fdba0',
    warning: '#f0c674',
    card: '#06162b',
    cardBorder: '#13264a',
    cardHover: '#0b1d38',
    chip: '#0f2342',
    gradient: ['#6688cc', '#9966b8', '#ddbb88'],
    glow: 'radial-gradient(1100px 600px at 88% -10%, rgba(102,136,204,.24), transparent 62%), '
      + 'radial-gradient(900px 560px at -10% 110%, rgba(153,102,184,.18), transparent 60%)',
  },
  // Black and white only: a black page, white type, and white for everything selected.
  mono: {
    primary: '#ffffff',
    onPrimary: '#000000',
    primaryContainer: '#ffffff',
    onPrimaryContainer: '#000000',
    bg: '#000000',
    surface: '#000000',
    surfaceHigh: '#0e0e0e',
    surfaceHighest: '#1c1c1c',
    text: '#ffffff',
    textMuted: '#a8a8a8',
    outline: '#4a4a4a',
    divider: '#262626',
    error: '#ff8a80',
    success: '#d9d9d9',
    warning: '#e0e0e0',
    card: '#0b0b0b',
    cardBorder: '#2b2b2b',
    cardHover: '#151515',
    chip: '#1c1c1c',
    gradient: ['#ffffff', '#9e9e9e', '#ffffff'],
    mono: true,
  },
  // The same, inverted: a white page, black type, and black for everything selected.
  monoLight: {
    primary: '#000000',
    onPrimary: '#ffffff',
    primaryContainer: '#000000',
    onPrimaryContainer: '#ffffff',
    bg: '#ffffff',
    surface: '#ffffff',
    surfaceHigh: '#f4f4f4',
    surfaceHighest: '#e9e9e9',
    text: '#000000',
    textMuted: '#555555',
    outline: '#bdbdbd',
    divider: '#e4e4e4',
    error: '#c62828',
    success: '#2b2b2b',
    warning: '#3a3a3a',
    card: '#ffffff',
    cardBorder: '#dedede',
    cardHover: '#f7f7f7',
    chip: '#f0f0f0',
    gradient: ['#000000', '#6b6b6b', '#000000'],
    mono: true,
  },
};

const LIGHT_THEMES = new Set(['light', 'monoLight']);

/** The themes people can pick. `v` is what's saved; null follows the system (Light or Midnight Black). */
export const THEMES = [
  { v: null, label: 'System', hint: 'Light or Midnight Black, following your device' },
  { v: 'light', label: 'Light', hint: 'Bright and clean' },
  { v: 'gray', label: 'Dark Gray', hint: 'Charcoal greys and blue, like VS Code\'s dark theme' },
  { v: 'dim', label: 'Dark', hint: 'Soft dark grey' },
  { v: 'dark', label: 'Midnight Black', hint: 'True black, easy on OLED screens' },
  { v: 'abyss', label: 'Abyss', hint: 'Deep navy, like the VS Code theme' },
  { v: 'mono', label: 'Black & White', hint: 'Black page, white ink, a touch of red for what\'s late' },
  { v: 'monoLight', label: 'White & Black', hint: 'White page, black ink, a touch of red for what\'s late' },
];

export const themeTokens = (name) => TOKENS[name] ?? TOKENS.light;
export const isThemeName = (v) => v === null || Object.prototype.hasOwnProperty.call(TOKENS, v);

export const PRIORITIES = [
  { value: 1, label: 'High', light: '#d93025', dark: '#f28b82' },
  { value: 2, label: 'Medium', light: '#e37400', dark: '#fdd663' },
  { value: 3, label: 'Low', light: '#1a73e8', dark: '#8ab4f8' },
  { value: 4, label: 'None', light: '#80868b', dark: '#80868b' },
];

// Black & White themes: shades of the ink colour instead of hues (only lateness stays red).
const MONO_SHADES = { dark: ['#ffffff', '#c2c2c2', '#8f8f8f', '#5e5e5e'], light: ['#000000', '#3d3d3d', '#707070', '#a3a3a3'] };
const shade = (theme, i) => MONO_SHADES[theme.palette.mode][i];

export function priorityColor(theme, value) {
  const p = PRIORITIES.find((x) => x.value === value) ?? PRIORITIES[3];
  if (theme.tokens?.mono) return shade(theme, p.value - 1);
  return theme.palette.mode === 'dark' ? p.dark : p.light;
}

export function makeTheme(name) {
  const t = themeTokens(name);
  const mode = LIGHT_THEMES.has(name) || !TOKENS[name] ? 'light' : 'dark';
  return createTheme({
    palette: {
      mode,
      primary: { main: t.primary, contrastText: t.onPrimary },
      error: { main: t.error },
      success: { main: t.success },
      warning: { main: t.warning },
      background: { default: t.bg, paper: t.bg },
      text: { primary: t.text, secondary: t.textMuted },
      divider: t.divider,
    },
    tokens: { sidebar: t.bg, ...t },
    themeName: name,
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: FONT,
      button: { textTransform: 'none', fontWeight: 500, letterSpacing: 0.1 },
      h5: { fontWeight: 400 },
      h6: { fontWeight: 500 },
    },
    transitions: { duration: { shortest: 100, shorter: 140, short: 180, standard: 200 } },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: t.bg, WebkitTapHighlightColor: 'transparent',
            transition: 'background-color .3s ease',
            ...(t.glow && { backgroundImage: t.glow, backgroundAttachment: 'fixed', backgroundRepeat: 'no-repeat' }),
          },
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: t.outline, borderRadius: 8, border: `3px solid ${t.bg}`,
          },
        },
      },
      MuiButtonBase: { defaultProps: { disableRipple: false } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 999, paddingInline: 18, minHeight: 36 } },
      },
      MuiIconButton: { styleOverrides: { root: { borderRadius: 999 } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 28, backgroundColor: t.surfaceHigh, ...(t.mono && { border: `1px solid ${t.divider}` }) },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: 12, backgroundColor: t.surfaceHighest, border: `1px solid ${t.divider}`,
          },
        },
      },
      MuiTooltip: {
        defaultProps: { enterDelay: 500, disableInteractive: true },
        styleOverrides: { tooltip: { fontSize: 12, borderRadius: 6 } },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            backgroundColor: mode === 'dark' ? '#e3e3e3' : '#303030',
            color: mode === 'dark' ? '#1f1f1f' : '#f2f2f2',
          },
        },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: 8, fontWeight: 500 } } },
      MuiOutlinedInput: {
        styleOverrides: { notchedOutline: { borderColor: t.outline } },
      },
    },
  });
}

// Tag colors (Google palette). `main` for dots/text, tinted backgrounds are derived.
export const TAG_COLORS = {
  blue: { label: 'Blue', light: '#1a73e8', dark: '#8ab4f8' },
  red: { label: 'Red', light: '#d93025', dark: '#f28b82' },
  green: { label: 'Green', light: '#188038', dark: '#81c995' },
  yellow: { label: 'Yellow', light: '#e37400', dark: '#fdd663' },
  orange: { label: 'Orange', light: '#e8710a', dark: '#fcad70' },
  purple: { label: 'Purple', light: '#9334e6', dark: '#d7aefb' },
  pink: { label: 'Pink', light: '#d01884', dark: '#ff8bcb' },
  teal: { label: 'Teal', light: '#12838f', dark: '#78d9ec' },
  indigo: { label: 'Indigo', light: '#3f51b5', dark: '#9fa8da' },
  brown: { label: 'Brown', light: '#795548', dark: '#bcaaa4' },
  grey: { label: 'Grey', light: '#5f6368', dark: '#bdc1c6' },
};

export function hexAlpha(hex, alpha) {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

export function tagColor(theme, key) {
  const c = TAG_COLORS[key] ?? TAG_COLORS.blue;
  const dark = theme.palette.mode === 'dark';
  const main = theme.tokens?.mono ? shade(theme, 1) : dark ? c.dark : c.light;
  return { main, bg: hexAlpha(main, dark ? 0.16 : 0.12), border: hexAlpha(main, dark ? 0.4 : 0.35) };
}

// Status colors used across summary widgets.
export function statusColors(theme) {
  const dark = theme.palette.mode === 'dark';
  if (theme.tokens?.mono) {
    return {
      done: shade(theme, 0), pending: shade(theme, 2), overdue: dark ? '#ff8a80' : '#c62828',
      cancelled: shade(theme, 3), postponed: shade(theme, 1), rate: shade(theme, 0),
    };
  }
  return {
    done: dark ? '#81c995' : '#188038',
    pending: dark ? '#8ab4f8' : '#1a73e8',
    overdue: dark ? '#f28b82' : '#d93025',
    cancelled: dark ? '#9aa0a6' : '#80868b',
    postponed: dark ? '#78d9ec' : '#12838f',
    rate: dark ? '#d7aefb' : '#9334e6',
  };
}

/** The colours of the "Today" heading: the theme's own, or the Google blue → purple → pink. */
export function titleGradient(theme) {
  const g = theme.tokens.gradient ?? (theme.palette.mode === 'dark' ? ['#8ab4f8', '#d7aefb', '#ff8bcb'] : ['#1a73e8', '#9334e6', '#d01884']);
  return `linear-gradient(90deg,${g[0]},${g[1]} 60%,${g[2]})`;
}

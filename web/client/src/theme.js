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
    carriedBg: '#fdf3f2',
    carriedBorder: '#f1b4ae',
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
    carriedBg: '#2a1d1c',
    carriedBorder: '#8c3b35',
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
    carriedBg: '#140807',
    carriedBorder: '#6e2e2a',
  },
  // Deep navy, after VS Code's Abyss.
  abyss: {
    primary: '#82aaff',
    onPrimary: '#00204f',
    primaryContainer: '#16336b',
    onPrimaryContainer: '#d8e2ff',
    bg: '#000c18',
    surface: '#000c18',
    surfaceHigh: '#060621',
    surfaceHighest: '#0e1b3a',
    text: '#d4dcf2',
    textMuted: '#8695bb',
    outline: '#22325a',
    divider: '#0f1d36',
    error: '#ff9e9e',
    success: '#7fdba0',
    warning: '#ffd580',
    carriedBg: '#1d0b1c',
    carriedBorder: '#7a3049',
  },
};

/** The themes people can pick. `v` is what's saved; null follows the system (Light or Midnight Black). */
export const THEMES = [
  { v: null, label: 'System', hint: 'Light or Midnight Black, following your device' },
  { v: 'light', label: 'Light', hint: 'Bright and clean' },
  { v: 'dim', label: 'Dark', hint: 'Soft dark grey' },
  { v: 'dark', label: 'Midnight Black', hint: 'True black, easy on OLED screens' },
  { v: 'abyss', label: 'Abyss', hint: 'Deep navy, like the VS Code theme' },
];

export const themeTokens = (name) => TOKENS[name] ?? TOKENS.light;
export const isThemeName = (v) => v === null || Object.prototype.hasOwnProperty.call(TOKENS, v);

export const PRIORITIES = [
  { value: 1, label: 'High', light: '#d93025', dark: '#f28b82' },
  { value: 2, label: 'Medium', light: '#e37400', dark: '#fdd663' },
  { value: 3, label: 'Low', light: '#1a73e8', dark: '#8ab4f8' },
  { value: 4, label: 'None', light: '#80868b', dark: '#80868b' },
];

export function priorityColor(theme, value) {
  const p = PRIORITIES.find((x) => x.value === value) ?? PRIORITIES[3];
  return theme.palette.mode === 'dark' ? p.dark : p.light;
}

export function makeTheme(name) {
  const t = themeTokens(name);
  const mode = name === 'light' || !TOKENS[name] ? 'light' : 'dark';
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
    tokens: t,
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
          body: { backgroundColor: t.bg, WebkitTapHighlightColor: 'transparent' },
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
        styleOverrides: { paper: { borderRadius: 28, backgroundColor: t.surfaceHigh } },
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
  const main = dark ? c.dark : c.light;
  return { main, bg: hexAlpha(main, dark ? 0.16 : 0.12), border: hexAlpha(main, dark ? 0.4 : 0.35) };
}

// Status colors used across summary widgets.
export function statusColors(theme) {
  const dark = theme.palette.mode === 'dark';
  return {
    done: dark ? '#81c995' : '#188038',
    pending: dark ? '#8ab4f8' : '#1a73e8',
    overdue: dark ? '#f28b82' : '#d93025',
    cancelled: dark ? '#9aa0a6' : '#80868b',
    postponed: dark ? '#78d9ec' : '#12838f',
    rate: dark ? '#d7aefb' : '#9334e6',
  };
}

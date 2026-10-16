import { createTheme } from '@mui/material/styles';

const FONT = '"Google Sans", "Roboto", system-ui, -apple-system, "Segoe UI", Arial, sans-serif';

// Google Material 3 palette. "dark" is true-black AMOLED.
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
  },
  dark: {
    primary: '#a8c7fa',
    onPrimary: '#062e6f',
    primaryContainer: '#0842a0',
    onPrimaryContainer: '#d3e3fd',
    bg: '#000000',
    surface: '#000000',
    surfaceHigh: '#0f1012',
    surfaceHighest: '#1b1c1e',
    text: '#e3e3e3',
    textMuted: '#a6a8ab',
    outline: '#3c3f43',
    divider: '#222426',
    error: '#f2b8b5',
    success: '#6dd58c',
    warning: '#fdd663',
  },
};

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

export function makeTheme(mode) {
  const t = TOKENS[mode];
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

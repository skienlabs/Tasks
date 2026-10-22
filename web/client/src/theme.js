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
  // Medium light grey, after VS Code's light theme: grey chrome, lighter raised panels, its blue.
  gray: {
    primary: '#005fb8',
    onPrimary: '#ffffff',
    primaryContainer: '#d2e3f6',
    onPrimaryContainer: '#002f5c',
    bg: '#e8e8ea',
    surface: '#efeff1',
    surfaceHigh: '#f7f7f8',
    surfaceHighest: '#ffffff',
    text: '#252526',
    textMuted: '#5b5b60',
    outline: '#bcbcc2',
    divider: '#d5d5da',
    error: '#c4314b',
    success: '#2e7d32',
    warning: '#9a6700',
    carriedBg: '#f5e6e6',
    carriedBorder: '#e2a6a6',
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
    carriedBg: '#230c1f',
    carriedBorder: '#8a3556',
    gradient: ['#6688cc', '#9966b8', '#ddbb88'],
    glow: 'radial-gradient(1100px 600px at 88% -10%, rgba(102,136,204,.24), transparent 62%), '
      + 'radial-gradient(900px 560px at -10% 110%, rgba(153,102,184,.18), transparent 60%)',
  },
  // Liquid glass on black: frosted, see-through panels floating over a slowly moving aurora.
  glass: {
    primary: '#9ec5ff',
    onPrimary: '#04224f',
    primaryContainer: 'rgba(120,170,255,.24)',
    onPrimaryContainer: '#e3edff',
    bg: '#05060b',
    surface: 'rgba(255,255,255,.035)',
    surfaceHigh: 'rgba(255,255,255,.07)',
    surfaceHighest: 'rgba(255,255,255,.12)',
    text: '#f4f6fb',
    textMuted: 'rgba(235,240,255,.66)',
    outline: 'rgba(255,255,255,.2)',
    divider: 'rgba(255,255,255,.1)',
    error: '#ff8a8a',
    success: '#74e3a0',
    warning: '#ffd479',
    carriedBg: 'rgba(255,90,90,.1)',
    carriedBorder: 'rgba(255,120,120,.55)',
    gradient: ['#8fb8ff', '#c49bff', '#ff9ad5'],
    glass: {
      blur: 'blur(28px) saturate(185%)',
      panel: 'rgba(22,24,34,.42)',
      menu: 'rgba(24,26,38,.8)',
      edge: 'rgba(255,255,255,.14)',
      shine: 'rgba(255,255,255,.28)',
      shadow: '0 10px 40px rgba(0,0,0,.45)',
      blobs: ['#3b5bff', '#9b3bff', '#00c2c7', '#ff3d9a', '#2a7bff'],
      blobOpacity: 0.55,
    },
  },
  // Liquid glass on white: milky panels over soft pastel light.
  glassLight: {
    primary: '#0a63e0',
    onPrimary: '#ffffff',
    primaryContainer: 'rgba(10,99,224,.14)',
    onPrimaryContainer: '#06306e',
    bg: '#eef1f8',
    surface: 'rgba(255,255,255,.4)',
    surfaceHigh: 'rgba(255,255,255,.58)',
    surfaceHighest: 'rgba(255,255,255,.78)',
    text: '#141821',
    textMuted: 'rgba(28,34,52,.68)',
    outline: 'rgba(30,40,70,.2)',
    divider: 'rgba(30,40,70,.1)',
    error: '#c62828',
    success: '#167a3c',
    warning: '#a35c00',
    carriedBg: 'rgba(217,48,37,.07)',
    carriedBorder: 'rgba(217,48,37,.45)',
    gradient: ['#2f6bff', '#8b3cf0', '#e0388f'],
    glass: {
      blur: 'blur(26px) saturate(170%)',
      panel: 'rgba(255,255,255,.5)',
      menu: 'rgba(255,255,255,.84)',
      edge: 'rgba(255,255,255,.75)',
      shine: 'rgba(255,255,255,.95)',
      shadow: '0 10px 36px rgba(40,60,120,.14)',
      blobs: ['#8fb3ff', '#ffb3d9', '#9ff0d8', '#ffd59e', '#c7b3ff'],
      blobOpacity: 0.75,
    },
  },
};

const LIGHT_THEMES = new Set(['light', 'gray', 'glassLight']);

/** The themes people can pick. `v` is what's saved; null follows the system (Light or Midnight Black). */
export const THEMES = [
  { v: null, label: 'System', hint: 'Light or Midnight Black, following your device' },
  { v: 'light', label: 'Light', hint: 'Bright and clean' },
  { v: 'gray', label: 'Light Gray', hint: 'Medium light grey, like VS Code\'s light theme' },
  { v: 'dim', label: 'Dark', hint: 'Soft dark grey' },
  { v: 'dark', label: 'Midnight Black', hint: 'True black, easy on OLED screens' },
  { v: 'abyss', label: 'Abyss', hint: 'Deep navy, like the VS Code theme' },
  { v: 'glass', label: 'Glass Black', hint: 'Liquid glass over a moving aurora, on black' },
  { v: 'glassLight', label: 'Glass White', hint: 'Liquid glass over soft pastel light' },
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
  const mode = LIGHT_THEMES.has(name) || !TOKENS[name] ? 'light' : 'dark';
  const g = t.glass;
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
          body: {
            // Glass: the page colour sits on <html>, so the moving light behind (z-index -1) shows through.
            backgroundColor: g ? 'transparent' : t.bg, WebkitTapHighlightColor: 'transparent',
            transition: 'background-color .5s ease',
            ...(t.glow && { backgroundImage: t.glow, backgroundAttachment: 'fixed', backgroundRepeat: 'no-repeat' }),
          },
          ...(g && GLASS_KEYFRAMES),
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: t.outline, borderRadius: 8, border: `3px solid ${g ? 'transparent' : t.bg}`, backgroundClip: g ? 'padding-box' : undefined,
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
          paper: {
            borderRadius: 28, backgroundColor: t.surfaceHigh,
            ...(g && { ...glassSurface(t, g.menu), animation: 'glassPop .42s cubic-bezier(.2,1.25,.35,1) both' }),
          },
          ...(g && { root: { '& .MuiBackdrop-root': { backgroundColor: mode === 'dark' ? 'rgba(0,0,0,.35)' : 'rgba(80,90,120,.18)', backdropFilter: 'blur(6px)' } } }),
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: 12, backgroundColor: t.surfaceHighest, border: `1px solid ${t.divider}`,
            ...(g && { ...glassSurface(t, g.menu), borderRadius: 18 }),
          },
        },
      },
      ...(g && {
        MuiPopover: { styleOverrides: { paper: { ...glassSurface(t, g.menu), borderRadius: 18 } } },
        MuiDrawer: { styleOverrides: { paper: { ...glassSurface(t, g.menu) } } },
      }),
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

const GLASS_KEYFRAMES = {
  '@keyframes glassPop': {
    from: { opacity: 0, transform: 'translateY(10px) scale(.96)', filter: 'blur(6px)' },
    to: { opacity: 1, transform: 'none', filter: 'none' },
  },
  '@keyframes glassIn': {
    from: { opacity: 0, transform: 'translateY(8px) scale(.985)' },
    to: { opacity: 1, transform: 'none' },
  },
  '@keyframes glassSheen': {
    from: { transform: 'translateX(-120%) skewX(-18deg)' },
    to: { transform: 'translateX(260%) skewX(-18deg)' },
  },
  '@keyframes blobDrift1': {
    '0%,100%': { transform: 'translate(0,0) scale(1)' },
    '33%': { transform: 'translate(18vw,12vh) scale(1.18)' },
    '66%': { transform: 'translate(-8vw,22vh) scale(.9)' },
  },
  '@keyframes blobDrift2': {
    '0%,100%': { transform: 'translate(0,0) scale(1)' },
    '40%': { transform: 'translate(-22vw,-10vh) scale(1.25)' },
    '75%': { transform: 'translate(-6vw,14vh) scale(.92)' },
  },
  '@keyframes blobDrift3': {
    '0%,100%': { transform: 'translate(0,0) rotate(0deg) scale(1)' },
    '50%': { transform: 'translate(14vw,-18vh) rotate(40deg) scale(1.15)' },
  },
  '@media (prefers-reduced-motion: reduce)': {
    '*, *::before, *::after': { animationDuration: '0.001ms !important', animationIterationCount: '1 !important' },
  },
};

/**
 * A liquid-glass panel: blurred and brightened see-through fill, a bright rim that catches
 * the light along the top edge, and a soft shadow underneath. Empty for non-glass themes.
 */
export function glassSurface(tokens, fill) {
  const g = tokens.glass;
  if (!g) return {};
  return {
    backgroundColor: fill ?? g.panel,
    backdropFilter: g.blur,
    WebkitBackdropFilter: g.blur,
    border: `1px solid ${g.edge}`,
    boxShadow: `inset 0 1px 0 ${g.shine}, inset 0 -1px 0 rgba(255,255,255,.04), ${g.shadow}`,
  };
}

/** glassSurface for a component's sx: `sx={(t) => ({ ..., ...glass(t) })}`. */
export const glass = (theme, fill) => glassSurface(theme.tokens, fill);
export const isGlass = (theme) => Boolean(theme.tokens.glass);

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

/** The colours of the "Today" heading: the theme's own, or the Google blue → purple → pink. */
export function titleGradient(theme) {
  const g = theme.tokens.gradient ?? (theme.palette.mode === 'dark' ? ['#8ab4f8', '#d7aefb', '#ff8bcb'] : ['#1a73e8', '#9334e6', '#d01884']);
  return `linear-gradient(90deg,${g[0]},${g[1]} 60%,${g[2]})`;
}

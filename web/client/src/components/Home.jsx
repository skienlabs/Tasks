import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, AppBar, Avatar, BottomNavigation, BottomNavigationAction, Box, Button, ButtonBase, Divider, Drawer, Fab,
  IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Paper, Toolbar, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import PaletteOutlined from '@mui/icons-material/PaletteOutlined';
import Logout from '@mui/icons-material/Logout';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import PrivacyTipOutlined from '@mui/icons-material/PrivacyTipOutlined';
import Add from '@mui/icons-material/Add';
import ViewDayOutlined from '@mui/icons-material/ViewDayOutlined';
import ViewDay from '@mui/icons-material/ViewDay';
import InsightsOutlined from '@mui/icons-material/InsightsOutlined';
import Insights from '@mui/icons-material/Insights';
import SellOutlined from '@mui/icons-material/SellOutlined';
import InstallDesktopOutlined from '@mui/icons-material/InstallDesktopOutlined';
import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined';
import AccountDialog from './AccountDialog.jsx';
import ThemePicker from './ThemePicker.jsx';

const SummaryView = lazy(() => import('./SummaryView.jsx'));
import Logo from './Logo.jsx';
import MiniCalendar from './MiniCalendar.jsx';
import DayView from './DayView.jsx';
import TaskDialog from './TaskDialog.jsx';
import TagManager from './TagManager.jsx';
import { TagAvatar } from './TagChip.jsx';
import Toast from './Toast.jsx';
import { addDays, formatDate, fromKey, isValidKey, monthGrid, startOfWeek, todayKey } from '../lib/dates.js';
import {
  areTagsLoaded, isDayLoaded, loadDay, loadSummary, loadTags, loadedDates, selectTag, selectTags, showToast, useStoreVersion,
} from '../lib/store.js';
import { startLive } from '../lib/live.js';
import { api } from '../lib/api.js';
import { signOut } from '../lib/auth.js';
import { isStandalone, useInstallPrompt } from '../lib/install.js';
import { readPref, writePref } from '../lib/prefs.js';
import { THEMES, tagColor } from '../theme.js';
import { APP_VERSION } from '../lib/version.js';

const DRAWER = 280;
const APPBAR = 64;

function useToday() {
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    let timer;
    const schedule = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
      timer = setTimeout(() => {
        setToday(todayKey());
        schedule();
      }, next - now);
    };
    schedule();
    const onVisible = () => !document.hidden && setToday(todayKey());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return today;
}

const params = () => new URLSearchParams(window.location.search);

function dateFromUrl(today) {
  const d = params().get('d');
  return isValidKey(d) ? d : today;
}

function NavItem({ icon, label, active, onClick, color, count }) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      sx={(t) => ({
        display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', height: 44, px: 2, borderRadius: 999,
        justifyContent: 'flex-start', fontSize: 14.5, fontWeight: active ? 600 : 500,
        color: active ? t.tokens.onPrimaryContainer : 'text.primary',
        bgcolor: active ? (color ? tagColor(t, color).bg : t.tokens.primaryContainer) : 'transparent',
        '&:hover': { bgcolor: active ? (color ? tagColor(t, color).bg : t.tokens.primaryContainer) : t.tokens.surfaceHighest },
      })}
    >
      {icon}
      <Box component="span" sx={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</Box>
      {count > 0 && <Typography variant="caption" color="text.secondary">{count}</Typography>}
    </ButtonBase>
  );
}

export default function Home({ user, profile, onProfile, mode, themePref, onThemeChange }) {
  useStoreVersion();
  const desktop = useMediaQuery((t) => t.breakpoints.up('md'));
  const large = useMediaQuery((t) => t.breakpoints.up('lg'));
  const today = useToday();
  const { canInstall, install } = useInstallPrompt();
  const [view, setView] = useState(() => (params().get('v') === 'summary' ? 'summary' : 'day'));
  const [date, setDate] = useState(() => dateFromUrl(todayKey()));
  const [month, setMonth] = useState(() => {
    const d = fromKey(dateFromUrl(todayKey()));
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const filterKey = `tasks.tagFilter.${profile.uid}`; // per account
  const [tagFilter, setTagFilterState] = useState(() => readPref(filterKey));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuEl, setMenuEl] = useState(null);
  const [themeEl, setThemeEl] = useState(null);
  const [selectedId, setSelectedId] = useState(null); // task shown in the details pane
  const [dialog, setDialog] = useState(() => (params().get('new') === '1' ? { date: todayKey() } : null));
  const [tagsOpen, setTagsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [hideVerify, setHideVerify] = useState(() => readPref('tasks.hideVerify') === profile.uid);
  const [blocked, setBlocked] = useState(null); // { kind: 'forbidden' | 'session', message }
  const [failed, setFailed] = useState(() => new Set()); // days whose load failed
  const addInputRef = useRef(null);
  const editTask = useCallback((task) => setDialog({ task }), []);
  const openTags = useCallback(() => setTagsOpen(true), []);
  const tags = selectTags();

  const setTagFilter = useCallback((id) => {
    setTagFilterState(id);
    writePref(filterKey, id);
  }, [filterKey]);

  // Drop a filter whose tag no longer exists.
  useEffect(() => {
    if (tagFilter && areTagsLoaded() && !selectTag(tagFilter)) setTagFilter(null);
  });

  // Follow the calendar when the day rolls over while looking at "today".
  const prevToday = useRef(today);
  useEffect(() => {
    const previous = prevToday.current;
    if (previous !== today) {
      prevToday.current = today;
      setDate((d) => (d === previous ? today : d));
      const f = fromKey(today);
      setMonth((m) => (m.y === fromKey(previous).getFullYear() && m.m === fromKey(previous).getMonth() ? { y: f.getFullYear(), m: f.getMonth() } : m));
    }
  }, [today]);

  const selectDate = useCallback((d) => {
    setDate(d);
    setSelectedId(null);
    setView('day');
    const f = fromKey(d);
    setMonth({ y: f.getFullYear(), m: f.getMonth() });
    setDrawerOpen(false);
  }, []);

  const goView = useCallback((v) => {
    setView(v);
    setSelectedId(null);
    setDrawerOpen(false);
    window.scrollTo({ top: 0 });
  }, []);

  // Keep view and day in the URL so a refresh lands in the same place.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('new');
    if (view === 'summary') url.searchParams.set('v', 'summary');
    else url.searchParams.delete('v');
    if (date === today || view === 'summary') url.searchParams.delete('d');
    else url.searchParams.set('d', date);
    window.history.replaceState(null, '', url);
  }, [date, today, view]);

  // Errors from loads. Never signs out by itself: Firebase reports real sign-outs,
  // and a server or network hiccup must not log anyone out.
  const handleError = useCallback((err, { quiet = false } = {}) => {
    if (err.status === 403) setBlocked({ kind: 'forbidden', message: err.message });
    else if (err.status === 401) setBlocked({ kind: 'session', message: 'Your session could not be confirmed' });
    else if (!quiet) showToast(err.message);
  }, []);

  useEffect(() => {
    loadTags().catch(handleError);
  }, [handleError]);

  const markFailed = useCallback((d, isFailed) => {
    setFailed((prev) => {
      if (prev.has(d) === isFailed) return prev;
      const next = new Set(prev);
      if (isFailed) next.add(d);
      else next.delete(d);
      return next;
    });
  }, []);

  /** Prefetches stay silent: only the day on screen shows errors / Retry. */
  const refreshDay = useCallback(
    (d, { prefetch = false } = {}) =>
      loadDay(d, today).then(
        () => markFailed(d, false),
        (err) => {
          if (!prefetch && !isDayLoaded(d)) markFailed(d, true);
          handleError(err, { quiet: prefetch });
        },
      ),
    [today, handleError, markFailed],
  );

  useEffect(() => {
    refreshDay(date);
    const prefetch = setTimeout(() => {
      for (const d of [addDays(date, 1), addDays(date, -1), today]) {
        if (d !== date && !isDayLoaded(d)) refreshDay(d, { prefetch: true });
      }
    }, 150);
    return () => clearTimeout(prefetch);
  }, [date, today, refreshDay]);

  const refreshSummary = useCallback(() => {
    const grid = monthGrid(month.y, month.m);
    const quiet = (err) => handleError(err, { quiet: true }); // dots are secondary; don't nag
    loadSummary(grid[0], grid[41]).catch(quiet);
    const ws = startOfWeek(date);
    if (ws < grid[0] || addDays(ws, 6) > grid[41]) loadSummary(ws, addDays(ws, 6)).catch(quiet);
  }, [month, date, handleError]);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  // Live sync: apply changes made on other devices (phone, other tabs) within a second.
  const liveRef = useRef(null);
  liveRef.current = { date, today, refreshDay, refreshSummary, onProfile };
  useEffect(() => {
    let pending = null;
    let timer = null;
    const flush = () => {
      const { date: d, today: t, refreshDay: rd, refreshSummary: rs, onProfile: op } = liveRef.current;
      const p = pending;
      pending = null;
      if (p.all || p.tags) loadTags().catch(() => {});
      if (p.all || p.profile) api('GET', '/api/me').then(op).catch(() => {});
      if (p.all || p.tasks) {
        const days = new Set([d, t]);
        if (!p.all) {
          const loaded = new Set(loadedDates());
          for (const x of p.dates) if (loaded.has(x)) days.add(x);
        }
        for (const x of days) rd(x, { prefetch: x !== d });
        rs();
      }
    };
    const queue = (patch) => {
      pending = pending || { dates: new Set() };
      Object.assign(pending, { ...patch, dates: pending.dates });
      for (const x of patch.dates || []) pending.dates.add(x);
      clearTimeout(timer);
      timer = setTimeout(flush, 150); // one refresh for a burst of changes
    };
    const stop = startLive({
      onChange: (c) => {
        if (c.type === 'tasks') queue({ tasks: true, dates: c.dates || [] });
        else if (c.type === 'tags') queue({ tags: true, ...(c.tasks ? { tasks: true } : {}) });
        else if (c.type === 'profile') queue({ profile: true });
      },
      onConnected: () => queue({ all: true }),
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, []);

  // Pick up changes made on other devices when coming back to the app.
  useEffect(() => {
    let last = Date.now();
    const onFocus = () => {
      if (document.hidden || Date.now() - last < 5000) return;
      last = Date.now();
      refreshDay(date);
      refreshSummary();
      loadTags().catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [date, refreshDay, refreshSummary]);

  // Keyboard: ← → change day, T today, N new task, S summary.
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      if (e.key === 'Escape') setSelectedId(null);
      else if (e.key === 'ArrowLeft' && view === 'day') selectDate(addDays(date, -1));
      else if (e.key === 'ArrowRight' && view === 'day') selectDate(addDays(date, 1));
      else if (e.key === 't' || e.key === 'T') selectDate(today);
      else if (e.key === 's' || e.key === 'S') goView('summary');
      else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        if (view !== 'day') setView('day');
        if (date < today) selectDate(today); // past days take no new tasks
        setTimeout(() => addInputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [date, today, view, selectDate, goView]);

  const doInstall = async () => {
    setMenuEl(null);
    if (await install()) showToast('Tasks installed. Pin it to your taskbar from the Start menu.');
  };

  if (blocked) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 3, textAlign: 'center' }}>
        <Box sx={{ display: 'grid', gap: 2, justifyItems: 'center', maxWidth: 420 }}>
          <Logo size={56} />
          <Typography variant="h6">{blocked.message}</Typography>
          <Typography color="text.secondary">
            {blocked.kind === 'session' ? 'Try again, or sign out and sign back in.' : `Signed in as ${user.email}`}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {blocked.kind === 'session' && (
              <Button variant="contained" onClick={() => window.location.reload()}>Try again</Button>
            )}
            <Button variant="outlined" onClick={() => signOut()}>
              {blocked.kind === 'session' ? 'Sign out' : 'Use another account'}
            </Button>
          </Box>
        </Box>
      </Box>
    );
  }

  const drawerContent = (
    <Box sx={{ px: 1.5, pt: desktop ? 1 : 2, pb: 2, display: 'flex', flexDirection: 'column', gap: 2, minHeight: desktop ? `calc(100dvh - ${APPBAR}px)` : '100%' }}>
      {!desktop && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1 }}>
          <Logo size={32} />
          <Typography variant="h6" sx={{ fontWeight: 400 }}>Tasks</Typography>
        </Box>
      )}
      {desktop && (
        <Box>
          <Button
            onClick={() => setDialog({ date: view === 'day' && date >= today ? date : today })}
            startIcon={<Add sx={{ fontSize: '28px !important' }} />}
            sx={(t) => ({
              height: 56, px: 2.5, borderRadius: 4, fontSize: 15, color: 'text.primary',
              bgcolor: t.palette.mode === 'dark' ? t.tokens.surfaceHighest : '#fff',
              boxShadow: t.palette.mode === 'dark' ? 'none' : '0 1px 3px rgba(0,0,0,.18), 0 4px 8px rgba(0,0,0,.08)',
              '&:hover': {
                bgcolor: t.palette.mode === 'dark' ? t.tokens.surfaceHigh : '#f6f9fe',
                boxShadow: t.palette.mode === 'dark' ? 'none' : '0 2px 4px rgba(0,0,0,.2), 0 6px 12px rgba(0,0,0,.1)',
              },
            })}
          >
            New task
          </Button>
        </Box>
      )}
      <Box sx={{ display: 'grid', gap: 0.25 }}>
        <NavItem
          icon={view === 'day' ? <ViewDay fontSize="small" /> : <ViewDayOutlined fontSize="small" />}
          label="Tasks"
          active={view === 'day'}
          onClick={() => goView('day')}
        />
        <NavItem
          icon={view === 'summary' ? <Insights fontSize="small" /> : <InsightsOutlined fontSize="small" />}
          label="Summary"
          active={view === 'summary'}
          onClick={() => goView('summary')}
        />
      </Box>
      <MiniCalendar month={month} onMonthChange={setMonth} selected={date} today={today} onSelect={selectDate} />

      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', pl: 2, pr: 0.5, mb: 0.5 }}>
          <Typography sx={{ flex: 1, fontSize: 14, fontWeight: 500 }}>Tags</Typography>
          <Tooltip title="Manage tags">
            <IconButton size="small" aria-label="Manage tags" onClick={openTags}><SellOutlined fontSize="small" /></IconButton>
          </Tooltip>
        </Box>
        {tags.length === 0 ? (
          <ButtonBase onClick={openTags} sx={{ px: 2, py: 1, borderRadius: 3, textAlign: 'left' }}>
            <Typography variant="body2" color="text.secondary">
              Create a tag for each company, with its logo.
            </Typography>
          </ButtonBase>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.25 }}>
            {tags.map((tag) => (
              <NavItem
                key={tag.id}
                icon={<TagAvatar tag={tag} size={22} />}
                label={tag.name}
                color={tag.color}
                active={tagFilter === tag.id && view === 'day'}
                onClick={() => {
                  setTagFilter(tagFilter === tag.id ? null : tag.id);
                  goView('day');
                }}
              />
            ))}
          </Box>
        )}
      </Box>

      {canInstall && !isStandalone() && (
        <Button variant="outlined" startIcon={<InstallDesktopOutlined />} onClick={doInstall} sx={{ justifySelf: 'start', ml: 1 }}>
          Install app
        </Button>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ px: 2, display: { xs: 'none', md: 'block' } }}>
        Shortcuts: ← → day · T today · N new · S summary · Esc close
      </Typography>
      <Box component="footer" sx={(t) => ({ mt: 'auto', mx: 1, pt: 1.5, borderTop: `1px solid ${t.palette.divider}` })}>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.6 }}>
          © 2026 Skien Software Lab
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.6 }}>
          Version {APP_VERSION}
          {' · '}
          <Box component="a" href="/privacypolicy.html" target="_blank" rel="noopener" sx={{ color: 'inherit' }}>Privacy</Box>
        </Typography>
      </Box>
    </Box>
  );

  const themeLabel = THEMES.find((o) => o.v === themePref)?.label ?? 'System';
  const firstName = (user.displayName || '').split(' ')[0];
  const since = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null;
  const dialogTag = view === 'day' ? tagFilter : null;

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      <AppBar
        position="fixed"
        elevation={0}
        color="inherit"
        sx={(t) => ({ bgcolor: 'background.default', borderBottom: `1px solid ${t.palette.divider}` })}
      >
        <Toolbar sx={{ minHeight: `${APPBAR}px !important`, gap: { xs: 0.5, sm: 1 }, px: { xs: 1, sm: 2 } }}>
          {!desktop && (
            <IconButton aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
              <MenuIcon />
            </IconButton>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, pr: { md: 5 }, width: { md: DRAWER - 16 } }}>
            <Logo size={36} />
            <Typography variant="h6" sx={{ fontWeight: 400, fontSize: 22, display: { xs: 'none', sm: 'block' } }}>
              Tasks
            </Typography>
          </Box>
          <Button
            variant="outlined"
            onClick={() => selectDate(today)}
            sx={(t) => ({ color: 'text.primary', borderColor: t.tokens.outline, ml: { xs: 0.5, md: 0 }, minWidth: 0 })}
          >
            Today
          </Button>
          {view === 'day' && (
            <>
              <Tooltip title="Previous day">
                <IconButton aria-label="Previous day" onClick={() => selectDate(addDays(date, -1))}>
                  <ChevronLeft />
                </IconButton>
              </Tooltip>
              <Tooltip title="Next day">
                <IconButton aria-label="Next day" onClick={() => selectDate(addDays(date, 1))} sx={{ ml: -1 }}>
                  <ChevronRight />
                </IconButton>
              </Tooltip>
              <Typography
                noWrap
                sx={{ fontSize: { xs: 18, sm: 22 }, fontWeight: 400, ml: 0.5, display: { xs: 'none', sm: 'block' } }}
              >
                {formatDate(date, { month: 'long', year: 'numeric' })}
              </Typography>
            </>
          )}
          <Box sx={{ flex: 1 }} />
          {canInstall && !isStandalone() && desktop && (
            <Tooltip title="Install Tasks as an app">
              <IconButton aria-label="Install app" onClick={doInstall}><InstallDesktopOutlined /></IconButton>
            </Tooltip>
          )}
          <Tooltip title={`Theme: ${themeLabel}`}>
            <IconButton aria-label="Theme" aria-haspopup="true" onClick={(e) => setThemeEl(e.currentTarget)}>
              <PaletteOutlined />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={themeEl}
            open={Boolean(themeEl)}
            onClose={() => setThemeEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { width: 420, maxWidth: 'calc(100vw - 24px)', mt: 1 } }, list: { sx: { p: 2 } } }}
          >
            <Typography sx={{ fontWeight: 500, mb: 0.25 }}>Theme</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {THEMES.find((o) => o.v === themePref)?.hint}
            </Typography>
            <ThemePicker value={themePref} onChange={onThemeChange} />
          </Menu>
          <IconButton aria-label="Account" onClick={(e) => setMenuEl(e.currentTarget)} sx={{ p: 0.5 }}>
            <Avatar
              src={user.photoURL || undefined}
              alt={user.displayName || ''}
              slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
              sx={{ width: 34, height: 34, bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: 16 }}
            >
              {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
            </Avatar>
          </IconButton>
          <Menu
            anchorEl={menuEl}
            open={Boolean(menuEl)}
            onClose={() => setMenuEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { width: 380, maxWidth: 'calc(100vw - 24px)', mt: 1, borderRadius: '24px' } }, list: { sx: { p: 1 } } }}
          >
            {/* Who's signed in */}
            <Box sx={{ display: 'grid', justifyItems: 'center', textAlign: 'center', px: 2, pt: 1.5, pb: 2 }}>
              <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: '100%' }}>{user.email}</Typography>
              <Avatar
                src={user.photoURL || undefined}
                alt=""
                slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
                sx={{ width: 72, height: 72, my: 1.5, fontSize: 30, bgcolor: 'primary.main', color: 'primary.contrastText' }}
              >
                {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
              </Avatar>
              <Typography sx={{ fontSize: 20, fontWeight: 400 }}>Hi, {firstName || 'there'}!</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>
                {profile.provider === 'google.com' ? 'Google account' : 'Email account'}
                {since ? ` · Member since ${since}` : ''}
              </Typography>
              <Button
                variant="outlined"
                onClick={() => {
                  setMenuEl(null);
                  setAccountOpen(true);
                }}
                sx={(t) => ({ mt: 1.5, color: 'primary.main', borderColor: t.tokens.outline })}
              >
                Manage your account
              </Button>
            </Box>

            {/* Shortcuts */}
            <Box sx={(t) => ({ bgcolor: t.tokens.surfaceHigh, borderRadius: '16px', overflow: 'hidden', '& .MuiMenuItem-root': { py: 1.25 } })}>
              <MenuItem
                onClick={() => {
                  setMenuEl(null);
                  openTags();
                }}
              >
                <ListItemIcon><SellOutlined fontSize="small" /></ListItemIcon>
                <ListItemText secondary={tags.length ? `${tags.length} tag${tags.length === 1 ? '' : 's'}` : 'One for each company'}>Manage tags</ListItemText>
                <ChevronRightRounded fontSize="small" sx={{ color: 'text.secondary' }} />
              </MenuItem>
              {canInstall && !isStandalone() && (
                <MenuItem onClick={doInstall}>
                  <ListItemIcon><InstallDesktopOutlined fontSize="small" /></ListItemIcon>
                  <ListItemText secondary="Open it like any other app">Install app</ListItemText>
                </MenuItem>
              )}
            </Box>

            {/* Leave */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, pt: 1.5, pb: 0.5 }}>
              <Button
                size="small"
                color="inherit"
                startIcon={<PrivacyTipOutlined fontSize="small" />}
                href="/privacypolicy.html"
                target="_blank"
                rel="noopener"
                sx={{ color: 'text.secondary' }}
              >
                Privacy
              </Button>
              <Box sx={{ flex: 1 }} />
              <Button
                variant="outlined"
                color="inherit"
                startIcon={<Logout fontSize="small" />}
                onClick={() => {
                  setMenuEl(null);
                  signOut();
                }}
                sx={(t) => ({ borderColor: t.tokens.outline })}
              >
                Sign out
              </Button>
            </Box>
            <Typography sx={{ fontSize: 11.5, color: 'text.secondary', textAlign: 'center', pt: 1, pb: 0.5 }}>
              Tasks {APP_VERSION} · © 2026 Skien Software Lab
            </Typography>
          </Menu>
        </Toolbar>
      </AppBar>

      {desktop ? (
        <Box
          component="nav"
          sx={{ width: DRAWER, flexShrink: 0, pt: `${APPBAR}px`, position: 'sticky', top: 0, alignSelf: 'flex-start', height: '100dvh', overflowY: 'auto' }}
        >
          {drawerContent}
        </Box>
      ) : (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          slotProps={{ paper: { sx: (t) => ({ width: DRAWER, bgcolor: t.tokens.surfaceHigh, borderRadius: '0 16px 16px 0' }) } }}
        >
          {drawerContent}
        </Drawer>
      )}

      <Box component="main" sx={{ flex: 1, minWidth: 0, pt: `${APPBAR}px` }}>
        {profile.provider === 'password' && !profile.emailVerified && !hideVerify && (
          <Box sx={{ maxWidth: 1140, mx: 'auto', px: { xs: 1.5, sm: 3 }, pt: 2 }}>
            <Alert
              severity="info"
              sx={{ borderRadius: 3 }}
              action={
                <>
                  <Button color="inherit" size="small" onClick={() => setAccountOpen(true)}>Verify</Button>
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => {
                      setHideVerify(true);
                      writePref('tasks.hideVerify', profile.uid);
                    }}
                  >
                    Later
                  </Button>
                </>
              }
            >
              Please verify your email ({profile.email}) so you can recover your account.
            </Alert>
          </Box>
        )}
        {view === 'day' ? (
          <DayView
            date={date}
            today={today}
            loading={!isDayLoaded(date) && !failed.has(date)}
            failed={failed.has(date) && !isDayLoaded(date)}
            onRetry={() => refreshDay(date)}
            onSelectDate={selectDate}
            selectedId={selectedId}
            onSelectTask={setSelectedId}
            onEditTask={editTask}
            addInputRef={addInputRef}
            tagFilter={tagFilter}
            onTagFilter={setTagFilter}
            onManageTags={openTags}
            onOpenSummary={() => goView('summary')}
            userName={user.displayName}
            wide={large}
          />
        ) : (
          <Suspense fallback={null}>
            <SummaryView today={today} onOpenDay={selectDate} />
          </Suspense>
        )}
      </Box>

      {!desktop && (
        <>
          <Fab
            color="primary"
            aria-label="New task"
            onClick={() => setDialog({ date: view === 'day' && date >= today ? date : today })}
            sx={{ position: 'fixed', right: 16, bottom: 'calc(96px + env(safe-area-inset-bottom))', borderRadius: 4, width: 56, height: 56 }}
          >
            <Add />
          </Fab>
          <Paper
            elevation={0}
            sx={(t) => ({
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: t.zIndex.appBar,
              borderTop: `1px solid ${t.palette.divider}`, bgcolor: t.palette.mode === 'dark' ? t.tokens.bg : t.tokens.surface,
              pb: 'env(safe-area-inset-bottom)',
            })}
          >
            <BottomNavigation
              value={view}
              onChange={(_, v) => (v === 'tags' ? openTags() : goView(v))}
              sx={(t) => ({
                bgcolor: 'transparent', height: 72,
                '& .MuiBottomNavigationAction-root': { gap: 0.5, color: 'text.secondary' },
                '& .Mui-selected': { color: 'text.primary' },
                '& .Mui-selected .nav-pill': { bgcolor: t.tokens.primaryContainer, color: t.tokens.onPrimaryContainer },
              })}
            >
              {[
                { v: 'day', label: 'Tasks', on: <ViewDay />, off: <ViewDayOutlined /> },
                { v: 'summary', label: 'Summary', on: <Insights />, off: <InsightsOutlined /> },
                { v: 'tags', label: 'Tags', on: <SellOutlined />, off: <SellOutlined /> },
              ].map((n) => (
                <BottomNavigationAction
                  key={n.v}
                  value={n.v}
                  label={n.label}
                  showLabel
                  icon={
                    <Box className="nav-pill" sx={{ width: 64, height: 32, borderRadius: 999, display: 'grid', placeItems: 'center', transition: 'background-color 150ms' }}>
                      {view === n.v ? n.on : n.off}
                    </Box>
                  }
                />
              ))}
            </BottomNavigation>
          </Paper>
        </>
      )}

      <TaskDialog
        open={Boolean(dialog)}
        task={dialog?.task}
        defaultDate={dialog?.date ?? date}
        defaultTagId={dialogTag}
        today={today}
        onClose={() => setDialog(null)}
        onManageTags={openTags}
      />
      <TagManager open={tagsOpen} onClose={() => setTagsOpen(false)} />
      <AccountDialog
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        profile={profile}
        photo={user.photoURL}
        onProfile={onProfile}
      />
      <Toast />
    </Box>
  );
}

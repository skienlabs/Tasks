import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppBar, Avatar, Box, Button, Divider, Drawer, Fab, IconButton, ListItemIcon, ListItemText, Menu, MenuItem,
  Toolbar, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import SettingsBrightnessOutlined from '@mui/icons-material/SettingsBrightnessOutlined';
import Logout from '@mui/icons-material/Logout';
import Check from '@mui/icons-material/Check';
import Add from '@mui/icons-material/Add';
import Logo from './Logo.jsx';
import MiniCalendar from './MiniCalendar.jsx';
import DayView from './DayView.jsx';
import TaskDialog from './TaskDialog.jsx';
import Toast from './Toast.jsx';
import { addDays, formatDate, fromKey, isValidKey, monthGrid, startOfWeek, todayKey } from '../lib/dates.js';
import { isDayLoaded, loadDay, loadSummary, showToast, useStoreVersion } from '../lib/store.js';
import { signOut } from '../lib/auth.js';

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

function dateFromUrl(today) {
  const d = new URLSearchParams(window.location.search).get('d');
  return isValidKey(d) ? d : today;
}

export default function Home({ user, mode, themePref, onThemeChange }) {
  useStoreVersion();
  const desktop = useMediaQuery((t) => t.breakpoints.up('md'));
  const today = useToday();
  const [date, setDate] = useState(() => dateFromUrl(todayKey()));
  const [month, setMonth] = useState(() => {
    const d = fromKey(dateFromUrl(todayKey()));
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuEl, setMenuEl] = useState(null);
  const [dialog, setDialog] = useState(null); // { task } | { date }
  const [blocked, setBlocked] = useState('');
  const addInputRef = useRef(null);
  const openTask = useCallback((task) => setDialog({ task }), []);

  // Follow the calendar when the day rolls over while looking at "today".
  const prevToday = useRef(today);
  useEffect(() => {
    if (prevToday.current !== today) {
      setDate((d) => (d === prevToday.current ? today : d));
      prevToday.current = today;
    }
  }, [today]);

  const selectDate = useCallback((d) => {
    setDate(d);
    const f = fromKey(d);
    setMonth({ y: f.getFullYear(), m: f.getMonth() });
    setDrawerOpen(false);
  }, []);

  // Keep the selected day in the URL so a refresh lands on the same day.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (date === today) url.searchParams.delete('d');
    else url.searchParams.set('d', date);
    window.history.replaceState(null, '', url);
  }, [date, today]);

  const [failed, setFailed] = useState(null); // date whose first load failed

  const handleError = useCallback((err) => {
    if (err.status === 403) setBlocked(err.message);
    else if (err.status === 401) signOut(); // session is no longer valid
    else showToast(err.message);
  }, []);

  const refreshDay = useCallback(
    (d) =>
      loadDay(d, today).then(
        () => setFailed((f) => (f === d ? null : f)),
        (err) => {
          if (!isDayLoaded(d)) setFailed(d);
          handleError(err);
        },
      ),
    [today, handleError],
  );

  useEffect(() => {
    refreshDay(date);
    const prefetch = setTimeout(() => {
      for (const d of [addDays(date, 1), addDays(date, -1), today]) if (!isDayLoaded(d)) refreshDay(d);
    }, 150);
    return () => clearTimeout(prefetch);
  }, [date, today, refreshDay]);

  const refreshSummary = useCallback(() => {
    const grid = monthGrid(month.y, month.m);
    loadSummary(grid[0], grid[41]).catch(handleError);
    const ws = startOfWeek(date);
    if (ws < grid[0] || addDays(ws, 6) > grid[41]) loadSummary(ws, addDays(ws, 6)).catch(handleError);
  }, [month, date, handleError]);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  // Pick up changes made on other devices when coming back to the tab.
  useEffect(() => {
    let last = Date.now();
    const onFocus = () => {
      if (document.hidden || Date.now() - last < 5000) return;
      last = Date.now();
      refreshDay(date);
      refreshSummary();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [date, refreshDay, refreshSummary]);

  // Keyboard: ← → change day, T today, N new task.
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      if (e.key === 'ArrowLeft') selectDate(addDays(date, -1));
      else if (e.key === 'ArrowRight') selectDate(addDays(date, 1));
      else if (e.key === 't' || e.key === 'T') selectDate(today);
      else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        addInputRef.current?.focus();
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [date, today, selectDate]);

  if (blocked) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 3, textAlign: 'center' }}>
        <Box sx={{ display: 'grid', gap: 2, justifyItems: 'center', maxWidth: 420 }}>
          <Logo size={56} />
          <Typography variant="h6">{blocked}</Typography>
          <Typography color="text.secondary">Signed in as {user.email}</Typography>
          <Button variant="outlined" onClick={() => signOut()}>Use another account</Button>
        </Box>
      </Box>
    );
  }

  const drawerContent = (
    <Box sx={{ px: 1.5, pt: desktop ? 1 : 2, pb: 2, display: 'grid', gap: 2, alignContent: 'start' }}>
      {!desktop && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1 }}>
          <Logo size={32} />
          <Typography variant="h6" sx={{ fontWeight: 400 }}>Tasks</Typography>
        </Box>
      )}
      <Box>
        <Button
          onClick={() => {
            setDrawerOpen(false);
            setDialog({ date });
          }}
          startIcon={<Add sx={{ fontSize: '28px !important' }} />}
          sx={(t) => ({
            height: 56, px: 2.5, borderRadius: 4, fontSize: 15, color: 'text.primary',
            bgcolor: t.palette.mode === 'dark' ? t.tokens.surfaceHighest : '#fff',
            boxShadow: t.palette.mode === 'dark' ? 'none' : '0 1px 3px rgba(0,0,0,.18), 0 4px 8px rgba(0,0,0,.08)',
            '&:hover': {
              bgcolor: t.palette.mode === 'dark' ? '#25272a' : '#f6f9fe',
              boxShadow: t.palette.mode === 'dark' ? 'none' : '0 2px 4px rgba(0,0,0,.2), 0 6px 12px rgba(0,0,0,.1)',
            },
          })}
        >
          New task
        </Button>
      </Box>
      <MiniCalendar
        month={month}
        onMonthChange={setMonth}
        selected={date}
        today={today}
        onSelect={selectDate}
      />
      <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, display: { xs: 'none', md: 'block' } }}>
        Shortcuts: ← → change day · T today · N new task
      </Typography>
    </Box>
  );

  const themeIcon = mode === 'dark' ? <LightModeOutlined /> : <DarkModeOutlined />;

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      <AppBar
        position="fixed"
        elevation={0}
        color="inherit"
        sx={(t) => ({ bgcolor: 'background.default', borderBottom: `1px solid ${t.palette.divider}`, zIndex: t.zIndex.drawer + 1 })}
      >
        <Toolbar sx={{ minHeight: `${APPBAR}px !important`, gap: { xs: 0.5, sm: 1 }, px: { xs: 1, sm: 2 } }}>
          {!desktop && (
            <IconButton aria-label="Open calendar" onClick={() => setDrawerOpen(true)}>
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
          <Box sx={{ flex: 1 }} />
          <Tooltip title={mode === 'dark' ? 'Light mode' : 'AMOLED dark mode'}>
            <IconButton aria-label="Toggle theme" onClick={() => onThemeChange(mode === 'dark' ? 'light' : 'dark')}>
              {themeIcon}
            </IconButton>
          </Tooltip>
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
            slotProps={{ paper: { sx: { minWidth: 260, mt: 1 } } }}
          >
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography sx={{ fontWeight: 500 }} noWrap>{user.displayName || 'Signed in'}</Typography>
              <Typography variant="body2" color="text.secondary" noWrap>{user.email}</Typography>
            </Box>
            <Divider />
            <Typography variant="caption" color="text.secondary" sx={{ px: 2, pt: 1.5, display: 'block' }}>
              Theme
            </Typography>
            {[
              { v: null, label: 'System default', icon: <SettingsBrightnessOutlined fontSize="small" /> },
              { v: 'light', label: 'Light', icon: <LightModeOutlined fontSize="small" /> },
              { v: 'dark', label: 'AMOLED dark', icon: <DarkModeOutlined fontSize="small" /> },
            ].map((o) => (
              <MenuItem key={String(o.v)} onClick={() => onThemeChange(o.v)} selected={themePref === o.v}>
                <ListItemIcon>{o.icon}</ListItemIcon>
                <ListItemText>{o.label}</ListItemText>
                {themePref === o.v && <Check fontSize="small" color="primary" />}
              </MenuItem>
            ))}
            <Divider />
            <MenuItem
              onClick={() => {
                setMenuEl(null);
                signOut();
              }}
            >
              <ListItemIcon><Logout fontSize="small" /></ListItemIcon>
              <ListItemText>Sign out</ListItemText>
            </MenuItem>
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
        <DayView
          date={date}
          today={today}
          loading={!isDayLoaded(date) && failed !== date}
          failed={failed === date && !isDayLoaded(date)}
          onRetry={() => refreshDay(date)}
          onSelectDate={selectDate}
          onOpenTask={openTask}
          addInputRef={addInputRef}
        />
      </Box>

      {!desktop && (
        <Fab
          color="primary"
          aria-label="New task"
          onClick={() => setDialog({ date })}
          sx={{ position: 'fixed', right: 16, bottom: 'calc(16px + env(safe-area-inset-bottom))', borderRadius: 4, width: 56, height: 56 }}
        >
          <Add />
        </Fab>
      )}

      <TaskDialog
        open={Boolean(dialog)}
        task={dialog?.task}
        defaultDate={dialog?.date ?? date}
        today={today}
        onClose={() => setDialog(null)}
      />
      <Toast />
    </Box>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppBar, Avatar, BottomNavigation, BottomNavigationAction, Box, Button, ButtonBase, Divider, Drawer, Fab,
  IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Paper, Toolbar, Tooltip, Typography, useMediaQuery,
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
import ViewDayOutlined from '@mui/icons-material/ViewDayOutlined';
import ViewDay from '@mui/icons-material/ViewDay';
import InsightsOutlined from '@mui/icons-material/InsightsOutlined';
import Insights from '@mui/icons-material/Insights';
import SellOutlined from '@mui/icons-material/SellOutlined';
import InstallDesktopOutlined from '@mui/icons-material/InstallDesktopOutlined';
import Logo from './Logo.jsx';
import MiniCalendar from './MiniCalendar.jsx';
import DayView from './DayView.jsx';
import SummaryView from './SummaryView.jsx';
import TaskDialog from './TaskDialog.jsx';
import TagManager from './TagManager.jsx';
import { TagAvatar } from './TagChip.jsx';
import Toast from './Toast.jsx';
import { addDays, formatDate, fromKey, isValidKey, monthGrid, startOfWeek, todayKey } from '../lib/dates.js';
import {
  areTagsLoaded, isDayLoaded, loadDay, loadSummary, loadTags, selectTag, selectTags, showToast, useStoreVersion,
} from '../lib/store.js';
import { signOut } from '../lib/auth.js';
import { isStandalone, useInstallPrompt } from '../lib/install.js';
import { readPref, writePref } from '../lib/prefs.js';
import { tagColor } from '../theme.js';

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

export default function Home({ user, mode, themePref, onThemeChange }) {
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
  const [tagFilter, setTagFilterState] = useState(() => readPref('tasks.tagFilter'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuEl, setMenuEl] = useState(null);
  const [dialog, setDialog] = useState(() => (params().get('new') === '1' ? { date: todayKey() } : null));
  const [tagsOpen, setTagsOpen] = useState(false);
  const [blocked, setBlocked] = useState('');
  const [failed, setFailed] = useState(null);
  const addInputRef = useRef(null);
  const openTask = useCallback((task) => setDialog({ task }), []);
  const openTags = useCallback(() => setTagsOpen(true), []);
  const tags = selectTags();

  const setTagFilter = useCallback((id) => {
    setTagFilterState(id);
    writePref('tasks.tagFilter', id);
  }, []);

  // Drop a filter whose tag no longer exists.
  useEffect(() => {
    if (tagFilter && areTagsLoaded() && !selectTag(tagFilter)) setTagFilter(null);
  });

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
    setView('day');
    const f = fromKey(d);
    setMonth({ y: f.getFullYear(), m: f.getMonth() });
    setDrawerOpen(false);
  }, []);

  const goView = useCallback((v) => {
    setView(v);
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

  const handleError = useCallback((err) => {
    if (err.status === 403) setBlocked(err.message);
    else if (err.status === 401) signOut(); // session is no longer valid
    else showToast(err.message);
  }, []);

  useEffect(() => {
    loadTags().catch(handleError);
  }, [handleError]);

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
      if (e.key === 'ArrowLeft' && view === 'day') selectDate(addDays(date, -1));
      else if (e.key === 'ArrowRight' && view === 'day') selectDate(addDays(date, 1));
      else if (e.key === 't' || e.key === 'T') selectDate(today);
      else if (e.key === 's' || e.key === 'S') goView('summary');
      else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        if (view !== 'day') setView('day');
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
      {desktop && (
        <Box>
          <Button
            onClick={() => setDialog({ date: view === 'day' ? date : today })}
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
        Shortcuts: ← → day · T today · N new · S summary
      </Typography>
    </Box>
  );

  const themeIcon = mode === 'dark' ? <LightModeOutlined /> : <DarkModeOutlined />;
  const dialogTag = view === 'day' ? tagFilter : null;

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
            <MenuItem
              onClick={() => {
                setMenuEl(null);
                openTags();
              }}
            >
              <ListItemIcon><SellOutlined fontSize="small" /></ListItemIcon>
              <ListItemText>Manage tags</ListItemText>
            </MenuItem>
            {canInstall && !isStandalone() && (
              <MenuItem onClick={doInstall}>
                <ListItemIcon><InstallDesktopOutlined fontSize="small" /></ListItemIcon>
                <ListItemText>Install app</ListItemText>
              </MenuItem>
            )}
            <Divider />
            <Typography variant="caption" color="text.secondary" sx={{ px: 2, pt: 1, display: 'block' }}>
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
        {view === 'day' ? (
          <DayView
            date={date}
            today={today}
            loading={!isDayLoaded(date) && failed !== date}
            failed={failed === date && !isDayLoaded(date)}
            onRetry={() => refreshDay(date)}
            onSelectDate={selectDate}
            onOpenTask={openTask}
            addInputRef={addInputRef}
            tagFilter={tagFilter}
            onTagFilter={setTagFilter}
            onManageTags={openTags}
            onOpenSummary={() => goView('summary')}
            userName={user.displayName}
            wide={large}
          />
        ) : (
          <SummaryView today={today} onOpenDay={selectDate} />
        )}
      </Box>

      {!desktop && (
        <>
          <Fab
            color="primary"
            aria-label="New task"
            onClick={() => setDialog({ date: view === 'day' ? date : today })}
            sx={{ position: 'fixed', right: 16, bottom: 'calc(96px + env(safe-area-inset-bottom))', borderRadius: 4, width: 56, height: 56 }}
          >
            <Add />
          </Fab>
          <Paper
            elevation={0}
            sx={(t) => ({
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: t.zIndex.appBar,
              borderTop: `1px solid ${t.palette.divider}`, bgcolor: t.palette.mode === 'dark' ? '#000' : t.tokens.surface,
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
      <Toast />
    </Box>
  );
}

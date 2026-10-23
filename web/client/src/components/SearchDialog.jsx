import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, ButtonBase, CircularProgress, Dialog, IconButton, InputBase, Typography, useMediaQuery,
} from '@mui/material';
import SearchRounded from '@mui/icons-material/SearchRounded';
import Close from '@mui/icons-material/Close';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import NorthWestRounded from '@mui/icons-material/NorthWestRounded';
import CheckCircle from '@mui/icons-material/CheckCircle';
import BlockOutlined from '@mui/icons-material/BlockOutlined';
import ChecklistRounded from '@mui/icons-material/ChecklistRounded';
import NotesRounded from '@mui/icons-material/NotesRounded';
import KeyboardReturnRounded from '@mui/icons-material/KeyboardReturnRounded';
import { api } from '../lib/api.js';
import { shortLabel } from '../lib/dates.js';
import { readPref, writePref } from '../lib/prefs.js';
import { allTasks, selectTags } from '../lib/store.js';
import { hasFilters, parseQuery, searchTasks, suggest } from '../lib/search.js';
import { tagsOf } from '../lib/order.js';
import { priorityColor, tagColor } from '../theme.js';
import { TagAvatar } from './TagChip.jsx';

const QUICK = [
  { q: 'is:open', label: 'Open' },
  { q: 'is:late', label: 'From earlier days' },
  { q: 'p:high', label: 'High priority' },
  { q: 'date:week', label: 'This week' },
  { q: 'has:steps', label: 'With steps' },
  { q: 'is:done', label: 'Done' },
];

/** The server's search, run on this device's copy (same answer shape as /api/search). */
function searchHere(text, today) {
  const tasks = allTasks();
  const tags = selectTags();
  const parsed = parseQuery(text, today);
  const suggestions = suggest(text, tasks, tags);
  if (!parsed.terms.length && !parsed.phrases.length && !hasFilters(parsed)) {
    return { results: [], total: 0, fuzzy: false, terms: [], suggestions };
  }
  const found = searchTasks(tasks, tags, parsed, today, 40);
  return { results: found.results.map((r) => ({ ...r.task, match: r.match })), total: found.total, fuzzy: found.fuzzy, terms: found.terms, suggestions };
}

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Wraps the parts of `text` that match any of `terms` in <mark>. */
function Highlight({ text, terms }) {
  const parts = useMemo(() => {
    const t = String(text ?? '');
    const f = fold(t);
    const hits = [];
    for (const term of terms) {
      if (!term) continue;
      let i = f.indexOf(term);
      while (i >= 0) {
        hits.push([i, i + term.length]);
        i = f.indexOf(term, i + term.length);
      }
    }
    hits.sort((a, b) => a[0] - b[0]);
    const out = [];
    let at = 0;
    for (const [s, e] of hits) {
      if (s < at) continue;
      if (s > at) out.push([t.slice(at, s), false]);
      out.push([t.slice(s, e), true]);
      at = e;
    }
    if (at < t.length) out.push([t.slice(at), false]);
    return out;
  }, [text, terms]);
  return parts.map(([p, hit], i) => (hit ? (
    <Box key={i} component="mark" sx={(th) => ({ bgcolor: th.tokens.primaryContainer, color: th.tokens.onPrimaryContainer, borderRadius: '4px', px: '1px' })}>{p}</Box>
  ) : <Fragment key={i}>{p}</Fragment>));
}

function StatusIcon({ task }) {
  if (task.status === 'done') return <CheckCircle sx={{ fontSize: 22, color: 'primary.main' }} />;
  if (task.status === 'cancelled') return <BlockOutlined sx={{ fontSize: 21, color: 'text.secondary' }} />;
  return <Box sx={(t) => ({ width: 18, height: 18, m: '2px', borderRadius: '50%', border: `2px solid ${priorityColor(t, task.priority)}` })} />;
}

function Chip({ children, onClick, icon, active }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={(t) => ({
        display: 'inline-flex', alignItems: 'center', gap: 0.75, height: 32, px: 1.5, borderRadius: 999, flexShrink: 0,
        fontSize: 13.5, fontWeight: 500, border: `1px solid ${active ? 'transparent' : t.tokens.outline}`,
        bgcolor: active ? t.tokens.primaryContainer : 'transparent', color: active ? t.tokens.onPrimaryContainer : 'text.primary',
        '&:hover': { bgcolor: active ? t.tokens.primaryContainer : t.tokens.surfaceHighest },
      })}
    >
      {icon}
      {children}
    </ButtonBase>
  );
}

/**
 * Search across every task: type words, or filters like #tag, is:done, p:high, date:week.
 * Suggestions complete the word being typed; Enter opens the highlighted task.
 */
export default function SearchDialog({ open, onClose, onOpenTask, today, uid }) {
  const fullScreen = useMediaQuery((t) => t.breakpoints.down('sm'));
  const recentKey = `tasks.recentSearches.${uid}`;
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null); // { results, total, fuzzy, terms, suggestions, q }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState(() => {
    try { return JSON.parse(readPref(recentKey) || '[]'); } catch { return []; }
  });
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const tags = selectTags();

  // Reopening keeps the last search, selected so typing replaces it (unless typing already began).
  const qRef = useRef(q);
  qRef.current = q;
  useEffect(() => {
    if (!open) return;
    setActive(0);
    const before = qRef.current;
    setTimeout(() => {
      const el = inputRef.current;
      if (el && before && el.value === before) el.select();
    }, 30);
  }, [open]);

  // Live results, debounced; an answer to an older query is ignored.
  const seq = useRef(0);
  useEffect(() => {
    if (!open) return undefined;
    const text = q;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      if (!text.trim()) {
        setRes(null);
        setBusy(false);
        setError('');
        return;
      }
      setBusy(true);
      try {
        const r = await api('GET', `/api/search?q=${encodeURIComponent(text)}&today=${today}&limit=40`);
        if (mine !== seq.current) return;
        setRes({ ...r, q: text });
        setError('');
        setActive(0);
      } catch (err) {
        if (mine !== seq.current) return;
        if (err.status === 0) {
          // Offline: the same search over the copy saved on this device.
          setRes({ ...searchHere(text, today), q: text, offline: true });
          setError('');
          setActive(0);
        } else setError(err.message || 'Search failed');
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    }, 140);
    return () => clearTimeout(timer);
  }, [q, open, today]);

  const remember = useCallback((text) => {
    const v = text.trim();
    if (!v) return;
    const next = [v, ...recent.filter((x) => x !== v)].slice(0, 8);
    setRecent(next);
    writePref(recentKey, JSON.stringify(next));
  }, [recent, recentKey]);

  // Shown grouped (open first), so keyboard order follows the screen, not the raw ranking.
  // Results for an older query stay on screen while the new ones load, but Enter waits for them.
  const fresh = Boolean(res && res.q === q);
  const raw = res?.results ?? [];
  const openList = raw.filter((t) => t.status === 'pending');
  const closedList = raw.filter((t) => t.status !== 'pending');
  const results = [...openList, ...closedList];
  const openResult = (task) => {
    remember(q);
    onOpenTask(task);
    onClose();
  };

  /** Replaces the word being typed with a suggestion (or adds a filter) and keeps typing. */
  const apply = (insert, replaceLast = true) => {
    const parts = q.split(/\s+/);
    if (replaceLast && !/\s$/.test(q) && parts.length) parts.pop();
    const next = `${[...parts.filter(Boolean), insert].join(' ')} `;
    setQ(next);
    inputRef.current?.focus();
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (fresh && results[active]) openResult(results[active]);
    } else if (e.key === 'Tab' && res?.suggestions?.length && !e.shiftKey) {
      e.preventDefault();
      apply(res.suggestions[0].insert);
    }
  };

  // Keep the highlighted row in view.
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const terms = res?.terms ?? [];

  const row = (task) => {
    const i = results.indexOf(task);
    const taskTags = tagsOf(task, tags);
    const company = taskTags[0];
    return (
      <ButtonBase
        key={task.id}
        data-index={i}
        onClick={() => openResult(task)}
        onMouseMove={() => i !== active && setActive(i)}
        sx={(t) => ({
          display: 'flex', alignItems: 'flex-start', gap: 1.5, width: '100%', textAlign: 'left', px: 1.5, py: 1.25, borderRadius: '14px',
          bgcolor: i === active ? t.tokens.surfaceHighest : 'transparent',
        })}
      >
        <Box sx={{ pt: '1px' }}><StatusIcon task={task} /></Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: 15, lineHeight: 1.35, wordBreak: 'break-word',
              textDecoration: task.status === 'pending' ? 'none' : 'line-through',
              color: task.status === 'pending' ? 'text.primary' : 'text.secondary',
            }}
          >
            <Highlight text={task.title} terms={terms} />
          </Typography>
          {task.match && (
            <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25, minWidth: 0 }} noWrap>
              {task.match.field === 'step' ? <ChecklistRounded sx={{ fontSize: 15 }} /> : <NotesRounded sx={{ fontSize: 15 }} />}
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}><Highlight text={task.match.text} terms={terms} /></Box>
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5, flexShrink: 0 }}>
          <Typography variant="caption" color={task.date === today ? 'primary.main' : 'text.secondary'} sx={{ fontWeight: task.date === today ? 600 : 400 }}>
            {shortLabel(task.date, today)}
          </Typography>
          {company && (
            <Box sx={(t) => ({ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 12, fontWeight: 600, color: tagColor(t, company.color).main })}>
              <TagAvatar tag={company} size={16} />
              {company.name}
            </Box>
          )}
        </Box>
        {i === active && <KeyboardReturnRounded sx={{ fontSize: 18, color: 'text.secondary', alignSelf: 'center', display: { xs: 'none', sm: 'block' } }} />}
      </ButtonBase>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="md"
      slotProps={{ paper: { sx: { alignSelf: 'flex-start', mt: fullScreen ? 0 : '8vh', maxHeight: fullScreen ? '100%' : '78vh', borderRadius: fullScreen ? 0 : '24px' } } }}
    >
      <Box sx={(t) => ({ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, borderBottom: `1px solid ${t.palette.divider}` })}>
        {fullScreen && <IconButton aria-label="Close search" onClick={onClose} sx={{ ml: -1 }}><ArrowBackRounded /></IconButton>}
        {busy ? <CircularProgress size={22} thickness={5} sx={{ m: '1px', flexShrink: 0 }} /> : !fullScreen && <SearchRounded sx={{ color: 'text.secondary' }} />}
        <InputBase
          inputRef={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          autoFocus
          placeholder="Search tasks, steps, notes, #tags…"
          fullWidth
          inputProps={{ 'aria-label': 'Search tasks', spellCheck: false, autoComplete: 'off', enterKeyHint: 'search' }}
          sx={{ fontSize: 18, py: 0.5 }}
        />
        {q && <IconButton size="small" aria-label="Clear" onClick={() => { setQ(''); inputRef.current?.focus(); }}><Close fontSize="small" /></IconButton>}
        <Box component="kbd" sx={(t) => ({ display: { xs: 'none', sm: 'inline-block' }, px: 0.75, py: 0.25, borderRadius: 1, fontSize: 11.5, border: `1px solid ${t.tokens.outline}`, color: 'text.secondary', fontFamily: 'inherit' })}>Esc</Box>
      </Box>

      {/* Suggestions for the word being typed */}
      {res?.suggestions?.length > 0 && q === res.q && (
        <Box sx={{ display: 'flex', gap: 1, px: 2, pt: 1.5, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {res.suggestions.map((s) => {
            const tag = s.tagId && tags.find((t) => t.id === s.tagId);
            return (
              <Chip key={s.insert} onClick={() => apply(s.insert)} icon={tag ? <TagAvatar tag={tag} size={18} /> : <NorthWestRounded sx={{ fontSize: 15, color: 'text.secondary' }} />}>
                {s.label ?? s.insert}
              </Chip>
            );
          })}
        </Box>
      )}

      <Box ref={listRef} sx={{ overflowY: 'auto', px: 1, py: 1.5, minHeight: 120 }}>
        {!q.trim() && (
          <Box sx={{ px: 1, display: 'grid', gap: 2.5 }}>
            {recent.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Recent</Typography>
                <Box sx={{ display: 'grid', mt: 0.5 }}>
                  {recent.map((r) => (
                    <ButtonBase key={r} onClick={() => setQ(r)} sx={(t) => ({ justifyContent: 'flex-start', gap: 1.5, px: 1, py: 1, borderRadius: '12px', '&:hover': { bgcolor: t.tokens.surfaceHighest } })}>
                      <HistoryRounded sx={{ fontSize: 19, color: 'text.secondary' }} />
                      <Typography sx={{ fontSize: 14.5 }}>{r}</Typography>
                    </ButtonBase>
                  ))}
                </Box>
              </Box>
            )}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Filters</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                {QUICK.map((f) => <Chip key={f.q} onClick={() => apply(f.q, false)}>{f.label}</Chip>)}
              </Box>
            </Box>
            {tags.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Companies</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                  {tags.map((tg) => (
                    <Chip key={tg.id} icon={<TagAvatar tag={tg} size={18} />} onClick={() => apply(`#${fold(tg.name).replace(/\s+/g, '')}`, false)}>{tg.name}</Chip>
                  ))}
                </Box>
              </Box>
            )}
            <Typography variant="caption" color="text.secondary">
              Tip: combine words and filters, like <b>invoice #softop is:open</b>. Quotes find exact phrases.
            </Typography>
          </Box>
        )}

        {q.trim() && res && q === res.q && results.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 5, color: 'text.secondary' }}>
            <SearchRounded sx={{ fontSize: 40, opacity: 0.4 }} />
            <Typography sx={{ mt: 1 }}>No tasks match “{q.trim()}”</Typography>
          </Box>
        )}
        {error && <Typography color="error" sx={{ px: 2, py: 1 }}>{error}</Typography>}

        {results.length > 0 && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1.5, pb: 0.5 }}>
              {res.offline ? 'Offline: searching this device · ' : ''}
              {res.fuzzy ? `No exact matches. Showing close ones (${res.total})` : `${res.total} result${res.total === 1 ? '' : 's'}`}
              {res.total > results.length ? ` · showing ${results.length}` : ''}
            </Typography>
            {openList.length > 0 && (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1.5, pt: 1, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Open</Typography>
                {openList.map(row)}
              </>
            )}
            {closedList.length > 0 && (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1.5, pt: 1.5, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Done & cancelled</Typography>
                {closedList.map(row)}
              </>
            )}
          </>
        )}
      </Box>
    </Dialog>
  );
}

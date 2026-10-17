// Animated feature showcase for the sign-in screen. Five small scenes, each a tiny
// moment from using Tasks, cycle on their own (paused on hover/focus, and not at
// all when the system asks for reduced motion). Pure CSS + HTML, no images.
import { useEffect, useRef, useState } from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import Logo from './Logo.jsx';

const INK = '#0a1430';
const PAPER = '#eaf0ff';
const MUTED = '#9fb0d9';
const C = { blue: '#4c8df6', red: '#f2675a', yellow: '#fbbc04', green: '#34c27a', violet: '#a868ff', teal: '#2bc4c4', orange: '#ff9a3c' };

export const SCENES = [
  { key: 'day', title: 'Your day, one list', text: 'Add what has to happen today. Tick it off, push it to tomorrow, or cancel it.' },
  { key: 'steps', title: 'Big jobs, small steps', text: 'Break a task into nested steps. It completes itself when the last one is done.' },
  { key: 'tags', title: 'One colour per company', text: 'Tag tasks by company or project, with its logo, and filter the day by it.' },
  { key: 'sync', title: 'Laptop and phone, in sync', text: 'A change on one shows up on the other within a second.' },
  { key: 'nudge', title: 'A nudge before the day ends', text: 'The Android app tells you what is still open, high priority first.' },
];

const CSS = `
.wa-stage { position: relative; width: 340px; height: 290px; max-width: 100%; }
.wa-card { position: absolute; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
  border-radius: 18px; backdrop-filter: blur(2px); }
.wa-row { display: flex; align-items: center; gap: 12px; height: 46px; padding: 0 16px; color: ${PAPER}; font-size: 15px; }
.wa-ring { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--c); flex-shrink: 0; position: relative; }
.wa-ring.wa-open::after { display: none; }
.wa-ring::after { content: ''; position: absolute; inset: -2px; border-radius: 50%; background: var(--c);
  transform: scale(0); animation: wa-pop .35s cubic-bezier(.3,1.6,.5,1) forwards; animation-delay: var(--d); }
.wa-tick { position: absolute; inset: 0; z-index: 1; opacity: 0; animation: wa-fade .2s forwards; animation-delay: calc(var(--d) + .15s); }
.wa-label { position: relative; white-space: nowrap; }
.wa-label::after { content: ''; position: absolute; left: 0; top: 52%; height: 1.5px; width: 100%; background: ${MUTED};
  transform: scaleX(0); transform-origin: left; animation: wa-strike .35s ease-out forwards; animation-delay: calc(var(--d) + .1s); }
.wa-dim { animation: wa-dim .3s forwards; animation-delay: calc(var(--d) + .2s); }
.wa-chip { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px 0 5px; border-radius: 99px;
  font-size: 13px; font-weight: 500; color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); }
.wa-chip i { width: 18px; height: 18px; border-radius: 50%; background: var(--c); color: ${INK}; font-style: normal;
  font-size: 10.5px; font-weight: 700; display: grid; place-items: center; }
.wa-drop { opacity: 0; transform: translateY(-26px) scale(.9); animation: wa-drop .5s cubic-bezier(.2,1.4,.4,1) forwards; animation-delay: var(--d); }
.wa-stripe { position: absolute; left: 0; top: 10px; bottom: 10px; width: 4px; border-radius: 2px; background: var(--c);
  transform: scaleY(0); animation: wa-grow .3s forwards; animation-delay: var(--d); }
.wa-thread { position: absolute; width: 2px; background: rgba(255,255,255,0.18); border-radius: 1px; }
.wa-bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.12); overflow: hidden; }
.wa-bar > div { height: 100%; width: 0; background: ${C.green}; border-radius: 3px; animation: wa-fill var(--t) steps(var(--n), end) forwards; animation-delay: var(--d); }
.wa-ringsvg circle.p { stroke-dasharray: 251; stroke-dashoffset: 251; animation: wa-dash75 2.2s cubic-bezier(.6,0,.2,1) forwards .3s; }
.wa-pulse { position: absolute; width: 10px; height: 10px; border-radius: 50%; background: ${C.yellow};
  box-shadow: 0 0 0 6px color-mix(in srgb, ${C.yellow} 25%, transparent); offset-rotate: 0deg;
  offset-path: path('M 150 120 C 205 60, 245 70, 262 132'); offset-distance: 0%; opacity: 0;
  animation: wa-travel 1.1s ease-in-out forwards .9s; }
.wa-appear { opacity: 0; transform: translateY(6px); animation: wa-appear .4s ease-out forwards; animation-delay: var(--d); }
.wa-notif { opacity: 0; transform: translateY(-40px); animation: wa-slide .6s cubic-bezier(.2,1.2,.4,1) forwards .4s; }
@keyframes wa-pop { to { transform: scale(1); } }
@keyframes wa-fade { to { opacity: 1; } }
@keyframes wa-strike { to { transform: scaleX(1); } }
@keyframes wa-dim { to { color: ${MUTED}; } }
@keyframes wa-drop { to { opacity: 1; transform: none; } }
@keyframes wa-grow { to { transform: scaleY(1); } }
@keyframes wa-fill { to { width: 100%; } }
@keyframes wa-dash75 { to { stroke-dashoffset: 63; } }
@keyframes wa-travel { 0% { opacity: 0; offset-distance: 0%; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; offset-distance: 100%; } }
@keyframes wa-appear { to { opacity: 1; transform: none; } }
@keyframes wa-slide { to { opacity: 1; transform: none; } }
@keyframes wa-scene { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .wa-stage *, .wa-stage *::after { animation-duration: 0.01ms !important; animation-delay: 0s !important; }
}
`;

const Tick = () => (
  <svg className="wa-tick" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M5.5 10.5l3 3 6-6.5" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Check({ color, delay }) {
  return (
    <span className="wa-ring" style={{ '--c': color, '--d': `${delay}s` }}>
      <Tick />
    </span>
  );
}

const Open = ({ color, size }) => <span className="wa-ring wa-open" style={{ '--c': color, ...(size ? { width: size, height: size } : {}) }} />;

function Task({ label, color, delay, done = true }) {
  return (
    <div className="wa-row">
      {done ? <Check color={color} delay={delay} /> : <Open color={color} />}
      <span className={done ? 'wa-label wa-dim' : undefined} style={{ '--d': `${delay}s` }}>{label}</span>
    </div>
  );
}

function DayScene() {
  return (
    <div className="wa-stage">
      <div className="wa-card" style={{ left: 0, top: 30, width: 250, padding: '8px 0' }}>
        <Task label="Stand-up notes" color={C.blue} delay={0.5} />
        <Task label="Send the invoice" color={C.red} delay={1.2} />
        <Task label="Review pull request" color={C.yellow} delay={1.9} />
        <Task label="Call the bank" color={C.blue} delay={0} done={false} />
      </div>
      <svg className="wa-ringsvg" width="110" height="110" viewBox="0 0 100 100" style={{ position: 'absolute', right: 0, top: 0 }} aria-hidden="true">
        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="9" />
        <circle className="p" cx="50" cy="50" r="40" fill="none" stroke={C.green} strokeWidth="9" strokeLinecap="round" transform="rotate(-90 50 50)" />
        <text x="50" y="57" textAnchor="middle" fill={PAPER} fontSize="20" fontWeight="500">3/4</text>
      </svg>
    </div>
  );
}

function StepsScene() {
  const rows = [
    { label: 'Mail server', depth: 0, parent: true },
    { label: 'Set up the server', depth: 1, d: 0.6 },
    { label: 'Open ports', depth: 1, parent: true, d: 1.9 },
    { label: '25 and 587', depth: 2, d: 1.2 },
    { label: '993 for IMAP', depth: 2, d: 1.8 },
  ];
  return (
    <div className="wa-stage">
      <div className="wa-card" style={{ left: 10, top: 18, width: 300, padding: '10px 0 14px' }}>
        <div style={{ position: 'relative' }}>
          <span className="wa-thread" style={{ left: 25, top: 46, height: 184 }} />
          <span className="wa-thread" style={{ left: 49, top: 138, height: 92 }} />
          {rows.map((r) => (
            <div key={r.label} className="wa-row" style={{ paddingLeft: 16 + r.depth * 24, fontWeight: r.depth ? 400 : 500 }}>
              {r.depth === 0
                ? <Check color={C.green} delay={2.4} />
                : <Check color={r.parent ? C.violet : C.blue} delay={r.d} />}
              <span>{r.label}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px 0', color: MUTED, fontSize: 13 }}>
          <div className="wa-bar" style={{ flex: 1 }}>
            <div style={{ '--t': '1.4s', '--n': 3, '--d': '0.5s' }} />
          </div>
          <span>3 steps</span>
        </div>
      </div>
    </div>
  );
}

function TagsScene() {
  const rows = [
    { label: 'Quarterly report', c: C.blue, tag: 'Skien Labs', d: 0.4 },
    { label: 'Client demo', c: C.orange, tag: 'Softop', d: 1.0 },
    { label: 'Book flights', c: C.teal, tag: 'Personal', d: 1.6 },
  ];
  return (
    <div className="wa-stage">
      <div style={{ position: 'absolute', left: 0, top: 0, display: 'flex', gap: 8, flexWrap: 'wrap', width: 340 }}>
        {rows.map((r) => (
          <span key={r.tag} className="wa-chip wa-appear" style={{ '--c': r.c, '--d': `${r.d - 0.3}s` }}>
            <i>{r.tag[0]}</i>{r.tag}
          </span>
        ))}
      </div>
      <div className="wa-card" style={{ left: 0, top: 52, width: 320, padding: '6px 0' }}>
        {rows.map((r) => (
          <div key={r.label} style={{ position: 'relative', padding: '6px 0 8px' }}>
            <span className="wa-stripe" style={{ '--c': r.c, '--d': `${r.d + 0.35}s` }} />
            <div className="wa-row" style={{ height: 30 }}>
              <Open color={MUTED} />
              <span>{r.label}</span>
            </div>
            <div style={{ paddingLeft: 48 }}>
              <span className="wa-chip wa-drop" style={{ '--c': r.c, '--d': `${r.d}s`, height: 22, fontSize: 12 }}>
                <i style={{ width: 14, height: 14, fontSize: 9 }}>{r.tag[0]}</i>{r.tag}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SyncScene() {
  return (
    <div className="wa-stage">
      {/* laptop */}
      <div style={{ position: 'absolute', left: 0, top: 70, width: 190, height: 124, borderRadius: 12, border: `2px solid ${MUTED}`, padding: 12 }}>
        <div className="wa-row wa-appear" style={{ height: 30, padding: 0, fontSize: 13, '--d': '0.3s' }}>
          <Open color={C.red} size={14} />Pay electricity bill
        </div>
        <div style={{ height: 8, width: '70%', borderRadius: 4, background: 'rgba(255,255,255,0.1)', marginTop: 10 }} />
        <div style={{ height: 8, width: '50%', borderRadius: 4, background: 'rgba(255,255,255,0.1)', marginTop: 10 }} />
      </div>
      <div style={{ position: 'absolute', left: -14, top: 196, width: 218, height: 10, borderRadius: '0 0 10px 10px', background: MUTED, opacity: 0.6 }} />
      {/* phone */}
      <div style={{ position: 'absolute', left: 240, top: 40, width: 96, height: 180, borderRadius: 18, border: `2px solid ${MUTED}`, padding: '20px 8px' }}>
        <div className="wa-row wa-appear" style={{ height: 'auto', padding: 0, fontSize: 11.5, gap: 6, alignItems: 'flex-start', '--d': '2.0s' }}>
          <Open color={C.red} size={12} />Pay electricity bill
        </div>
        <div style={{ height: 6, width: '80%', borderRadius: 3, background: 'rgba(255,255,255,0.1)', marginTop: 12 }} />
        <div style={{ height: 6, width: '60%', borderRadius: 3, background: 'rgba(255,255,255,0.1)', marginTop: 8 }} />
      </div>
      <span className="wa-pulse" />
    </div>
  );
}

function NudgeScene() {
  return (
    <div className="wa-stage">
      <div style={{ position: 'absolute', left: 40, top: 0, width: 230, height: 280, borderRadius: 30, border: `2px solid ${MUTED}`, overflow: 'hidden' }}>
        <div style={{ textAlign: 'center', color: PAPER, fontSize: 42, fontWeight: 300, marginTop: 34, letterSpacing: '-0.02em' }}>21:00</div>
        <div style={{ textAlign: 'center', color: MUTED, fontSize: 12 }}>Saturday</div>
        <div className="wa-card wa-notif" style={{ left: 12, right: 12, top: 118, padding: '12px 14px', background: 'rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: MUTED, fontSize: 11 }}>
            <Logo size={14} /> Tasks
          </div>
          <div style={{ color: PAPER, fontSize: 14, fontWeight: 500, marginTop: 6 }}>2 tasks still open</div>
          <div style={{ color: MUTED, fontSize: 12, marginTop: 2, lineHeight: 1.35 }}>You completed 5 of 7 today. High priority: Send the invoice</div>
        </div>
      </div>
    </div>
  );
}

const ACCENTS = [C.blue, C.violet, C.orange, C.green, C.yellow];

/**
 * The day dial: a 24-hour clock face drawn large behind the scenes. Each feature owns
 * an arc of the day; the dial turns to bring the current one into view.
 */
function Dial({ active, reduced }) {
  const R = 300;
  const ticks = Array.from({ length: 96 }, (_, k) => {
    const a = (k / 96) * Math.PI * 2;
    const long = k % 4 === 0;
    const r1 = R - (long ? 26 : 14);
    return { x1: Math.cos(a) * r1, y1: Math.sin(a) * r1, x2: Math.cos(a) * (R - 4), y2: Math.sin(a) * (R - 4), long };
  });
  const arc = (from, to, r) => {
    const p = (t) => [Math.cos(t * Math.PI * 2 - Math.PI / 2) * r, Math.sin(t * Math.PI * 2 - Math.PI / 2) * r];
    const [x1, y1] = p(from);
    const [x2, y2] = p(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute', right: { xs: -300, md: -330 }, bottom: { xs: -340, md: -360 }, width: 680, height: 680,
        pointerEvents: 'none', opacity: 0.9,
        // Turn the dial so the current feature's arc faces the visible (upper-left) part.
        transform: `rotate(${315 - (active + 0.5) * 72}deg)`,
        transition: reduced ? 'none' : 'transform 1.1s cubic-bezier(.5,0,.2,1)',
      }}
    >
      <svg width="680" height="680" viewBox="-340 -340 680 680">
        <circle r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <circle r={R - 60} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        {ticks.map((t, k) => (
          <line key={k} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="rgba(255,255,255,0.14)" strokeWidth={t.long ? 2 : 1} strokeLinecap="round" />
        ))}
        {ACCENTS.map((c, k) => {
          const from = k / 5 + 0.012;
          const to = (k + 1) / 5 - 0.012;
          const on = k === active;
          return (
            <path
              key={c}
              d={arc(from, to, R - 42)}
              fill="none"
              stroke={c}
              strokeWidth={on ? 18 : 6}
              strokeLinecap="round"
              opacity={on ? 1 : 0.35}
              style={{ transition: 'stroke-width 600ms cubic-bezier(.3,1.4,.5,1), opacity 600ms' }}
            />
          );
        })}
      </svg>
    </Box>
  );
}

const VIEWS = { day: DayScene, steps: StepsScene, tags: TagsScene, sync: SyncScene, nudge: NudgeScene };

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const m = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!m) return undefined;
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** The art panel. `compact` is the short band shown above the form on phones. */
export default function WelcomeArt({ compact = false }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const root = useRef(null);
  useEffect(() => {
    if (paused || reduced) return undefined;
    const t = setTimeout(() => setI((n) => (n + 1) % SCENES.length), 5200);
    return () => clearTimeout(t);
  }, [i, paused, reduced]);
  const scene = SCENES[i];
  const View = VIEWS[scene.key];

  return (
    <Box
      ref={root}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => !root.current?.contains(e.relatedTarget) && setPaused(false)}
      sx={{
        position: 'relative', overflow: 'hidden', bgcolor: INK, color: PAPER, colorScheme: 'dark',
        display: 'flex', flexDirection: 'column',
        px: { xs: 3, md: 7 }, py: { xs: 3, md: 6 },
        minHeight: compact ? 0 : '100%',
        // Faint dot grid: the page of a planner.
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1.2px)',
        backgroundSize: '22px 22px',
      }}
    >
      <style>{CSS}</style>
      {!compact && <Dial active={i} reduced={reduced} />}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, position: 'relative' }}>
        <Logo size={compact ? 28 : 34} />
        <Typography sx={{ fontSize: compact ? 20 : 22, fontWeight: 500, color: PAPER }}>Tasks</Typography>
      </Box>

      <Box sx={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', py: compact ? 2 : 4, minHeight: compact ? 0 : 420 }}>
        <Box
          key={scene.key}
          aria-hidden
          sx={{
            display: 'flex', justifyContent: { xs: 'center', md: 'flex-start' },
            height: compact ? 210 : { md: 340, lg: 430 }, alignItems: 'center',
            '& .wa-stage': compact
              ? { transform: 'scale(0.72)', transformOrigin: 'center' }
              : { transform: { md: 'scale(1.1)', lg: 'scale(1.32)' }, transformOrigin: 'left center' },
            animation: reduced ? 'none' : 'wa-scene .45s ease-out',
          }}
        >
          <View />
        </Box>
        <Box sx={{ maxWidth: 440, mt: compact ? 0 : 3, textAlign: { xs: compact ? 'center' : 'left', md: 'left' }, mx: { xs: compact ? 'auto' : 0, md: 0 } }} aria-live="polite">
          <Typography
            component="h2"
            sx={{ fontSize: compact ? 22 : { md: 40, lg: 46 }, lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.02em', color: PAPER, textWrap: 'balance' }}
          >
            {scene.title}
          </Typography>
          <Typography sx={{ mt: 1.25, color: MUTED, fontSize: compact ? 14 : 17, lineHeight: 1.5 }}>{scene.text}</Typography>
        </Box>
      </Box>

      <Box sx={{ position: 'relative', display: 'flex', gap: 1, justifyContent: { xs: compact ? 'center' : 'flex-start', md: 'flex-start' } }} role="tablist" aria-label="Features">
        {SCENES.map((s, n) => (
          <ButtonBase
            key={s.key}
            role="tab"
            aria-selected={n === i}
            aria-label={s.title}
            onClick={() => setI(n)}
            sx={{
              height: 8, width: n === i ? 28 : 8, borderRadius: 4, transition: 'width 250ms, background-color 250ms',
              bgcolor: n === i ? ACCENTS[n] : 'rgba(255,255,255,0.25)',
              '&.Mui-focusVisible': { outline: `2px solid ${PAPER}`, outlineOffset: 3 },
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

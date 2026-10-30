import { useEffect, useRef, useState } from 'react';
import { Badge, Box, Button, ButtonBase, IconButton, Popover, Tooltip, Typography } from '@mui/material';
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded';
import NotificationsRounded from '@mui/icons-material/NotificationsRounded';
import AssignmentIndOutlined from '@mui/icons-material/AssignmentIndOutlined';
import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import VerifiedRounded from '@mui/icons-material/VerifiedRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import InsightsOutlined from '@mui/icons-material/InsightsOutlined';
import GroupAddOutlined from '@mui/icons-material/GroupAddOutlined';
import WbSunnyOutlined from '@mui/icons-material/WbSunnyOutlined';
import { hexAlpha } from '../theme.js';
import { loadNotifications, markNotificationsRead, selectNotifications, selectTeam, useStoreVersion } from '../lib/store.js';
import { TeamAvatar } from './teams/parts.jsx';

const ICON = {
  given: AssignmentIndOutlined, changed: AssignmentIndOutlined, comment: ChatBubbleOutlineRounded, done: TaskAltRounded, closed: TaskAltRounded,
  review: VerifiedRounded, approved: VerifiedRounded, returned: UndoRounded, nudge: NotificationsActiveOutlined, late: ScheduleRounded,
  weekly: InsightsOutlined, digest: WbSunnyOutlined, request: GroupAddOutlined, invite: GroupAddOutlined, joined: GroupAddOutlined, role: GroupAddOutlined,
};

const ago = (ms) => {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/** Shows a system notification while the tab is in the background (if the person allowed it). */
function osNotify(list) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) return;
  for (const n of list.slice(0, 3)) {
    try {
      const note = new Notification(n.title, { body: n.body || '', tag: `tasks-${n.id}`, icon: '/icon-192.png' });
      note.onclick = () => {
        window.focus();
        note.close();
      };
    } catch {
      /* some browsers only allow this from a service worker */
    }
  }
}

/** Fetches notifications now, on live events (see Home) and every minute while the tab is hidden. */
export function useNotificationsPolling(onNew) {
  const cb = useRef(onNew);
  cb.current = onNew;
  useEffect(() => {
    const check = () => loadNotifications().then((fresh) => {
      if (fresh?.length) {
        osNotify(fresh);
        cb.current?.(fresh);
      }
    }).catch(() => {});
    check();
    const timer = setInterval(() => {
      if (document.hidden) check(); // the live stream sleeps while hidden
    }, 60_000);
    const onVisible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}

export default function NotificationsButton({ onOpen }) {
  useStoreVersion();
  const { list, unread } = selectNotifications();
  const [el, setEl] = useState(null);
  const [perm, setPerm] = useState(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));
  const close = () => {
    setEl(null);
    if (unread) markNotificationsRead().catch(() => {});
  };
  return (
    <>
      <Tooltip title="Notifications">
        <IconButton aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'} onClick={(e) => setEl(e.currentTarget)}>
          <Badge badgeContent={unread} color="error" max={99}>
            {unread ? <NotificationsRounded /> : <NotificationsNoneRounded />}
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(el)}
        anchorEl={el}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 400, maxWidth: 'calc(100vw - 24px)', maxHeight: 'min(560px, calc(100dvh - 96px))', mt: 1, borderRadius: '20px', display: 'flex', flexDirection: 'column' } } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, pt: 1.75, pb: 1 }}>
          <Typography sx={{ fontWeight: 600, flex: 1 }}>Notifications</Typography>
          {unread > 0 && <Button size="small" onClick={() => markNotificationsRead().catch(() => {})}>Mark all read</Button>}
        </Box>
        {perm === 'default' && (
          <Box sx={(t) => ({ mx: 1.5, mb: 1, p: 1.25, borderRadius: '14px', bgcolor: t.tokens.surfaceHighest, display: 'flex', gap: 1, alignItems: 'center' })}>
            <Typography variant="body2" sx={{ flex: 1 }}>Get a desktop alert when you&apos;re in another tab.</Typography>
            <Button size="small" variant="contained" onClick={() => Notification.requestPermission().then(setPerm).catch(() => {})}>Turn on</Button>
          </Box>
        )}
        <Box sx={{ overflowY: 'auto', px: 1, pb: 1 }}>
          {list.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 3, textAlign: 'center' }}>
              Nothing yet. Team news shows up here: new tasks, comments, reviews and reminders.
            </Typography>
          )}
          {list.map((n) => {
            const Icon = ICON[n.kind] ?? NotificationsNoneRounded;
            const team = n.teamId ? selectTeam(n.teamId) : null;
            return (
              <ButtonBase
                key={n.id}
                onClick={() => {
                  setEl(null);
                  markNotificationsRead(n.read ? undefined : n.id).catch(() => {});
                  onOpen?.(n);
                }}
                sx={(t) => ({
                  width: '100%', display: 'flex', gap: 1.25, alignItems: 'flex-start', justifyContent: 'flex-start', textAlign: 'left',
                  p: 1.25, borderRadius: '14px', bgcolor: n.read ? 'transparent' : hexAlpha(t.palette.primary.main, 0.07),
                  '&:hover': { bgcolor: t.tokens.cardHover },
                })}
              >
                <Box sx={{ position: 'relative', flexShrink: 0 }}>
                  {team ? <TeamAvatar team={team} size={36} /> : (
                    <Box sx={(t) => ({ width: 36, height: 36, borderRadius: '10px', bgcolor: t.tokens.chip, display: 'grid', placeItems: 'center' })}><Icon fontSize="small" /></Box>
                  )}
                  {team && (
                    <Box sx={(t) => ({ position: 'absolute', right: -5, bottom: -5, width: 20, height: 20, borderRadius: '50%', bgcolor: t.tokens.surfaceHighest, border: `2px solid ${t.palette.background.paper}`, display: 'grid', placeItems: 'center', '& svg': { fontSize: 12 } })}>
                      <Icon />
                    </Box>
                  )}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: n.read ? 400 : 600, lineHeight: 1.35 }}>{n.title}</Typography>
                  {n.body && <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>{n.body}</Typography>}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{ago(n.createdAt)}</Typography>
              </ButtonBase>
            );
          })}
        </Box>
      </Popover>
    </>
  );
}

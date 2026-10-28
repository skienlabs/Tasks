import { Box, FormControlLabel, Switch, TextField, Tooltip, Typography } from '@mui/material';
import TimerOutlined from '@mui/icons-material/TimerOutlined';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import { hexAlpha, tagColor } from '../theme.js';
import { defaultDue, describeDue, isValidDue, parseDue, useNow } from '../lib/due.js';
import { MAX_DATE } from '../lib/dates.js';
import { memberName, selectTeam } from '../lib/store.js';

/** The countdown pill: "Fri 5:00 PM · 2d left", amber within a day, red once it has passed. */
export function DueChip({ task, size = 'small' }) {
  const now = useNow();
  const info = describeDue(task.dueAt, now, { done: task.status === 'done', completedAt: task.completedAt });
  if (!info) return null;
  const muted = task.status !== 'pending';
  return (
    <Tooltip title={`Time limit: ${info.full}`}>
      <Box
        component="span"
        sx={(t) => {
          const c = muted
            ? t.palette.text.secondary
            : info.tone === 'over' ? t.palette.error.main : info.tone === 'soon' ? t.palette.warning.main : t.palette.text.secondary;
          const strong = !muted && (info.tone === 'over' || info.tone === 'soon');
          return {
            display: 'inline-flex', alignItems: 'center', gap: 0.5, height: size === 'small' ? 22 : 26, pl: 0.75, pr: 1, borderRadius: 999,
            fontSize: size === 'small' ? 12 : 13, fontWeight: 600, whiteSpace: 'nowrap',
            color: strong ? c : 'text.secondary',
            bgcolor: strong ? hexAlpha(c, t.palette.mode === 'dark' ? 0.16 : 0.11) : t.tokens.chip,
            '& svg': { color: c },
          };
        }}
      >
        <TimerOutlined sx={{ fontSize: size === 'small' ? 14 : 16 }} />
        {info.label}
        {task.status !== 'cancelled' && <Box component="span" sx={{ fontWeight: 500, opacity: 0.9 }}>· {info.left}</Box>}
      </Box>
    </Tooltip>
  );
}

/** "Acme · from Boss": a task someone in a team gave you (or that you gave). */
export function TeamBadge({ task }) {
  const team = selectTeam(task.teamId);
  if (!task.teamId) return null;
  const by = memberName(task.teamId, task.assignedBy);
  const label = team ? team.name : 'Team task';
  return (
    <Tooltip title={by ? `Given to you by ${by === 'you' ? 'yourself' : by}${team ? ` in ${team.name}` : ''}` : 'A task from your team'}>
      <Box
        component="span"
        sx={(t) => {
          const c = tagColor(t, team?.color ?? 'grey');
          return {
            display: 'inline-flex', alignItems: 'center', gap: 0.5, height: 22, pl: 0.75, pr: 1, borderRadius: 999, maxWidth: 260,
            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', color: 'text.secondary', bgcolor: t.tokens.chip,
            '& svg': { color: c.main },
          };
        }}
      >
        <GroupsRounded sx={{ fontSize: 15 }} />
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
          {by && by !== 'you' && <Box component="span" sx={{ fontWeight: 500 }}> · from {by.split(' ')[0]}</Box>}
        </Box>
      </Box>
    </Tooltip>
  );
}

/**
 * The optional time limit: off by default. Switched on, it asks for a date and a time
 * (shown as a countdown on the task).
 */
export function TimeLimitField({ value, onChange, date, disabled = false }) {
  const on = value !== null;
  const valid = !on || isValidDue(value);
  return (
    <Box sx={{ display: 'grid', justifyItems: 'start' }}>
      <FormControlLabel
        control={(
          <Switch
            checked={on}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? defaultDue(date) : null)}
          />
        )}
        label={(
          <Box>
            <Typography sx={{ fontSize: 15 }}>Time limit</Typography>
            <Typography variant="body2" color="text.secondary">
              {disabled ? 'Set by the team’s admins' : on ? 'A countdown shows on the task' : 'Finish by a date and time'}
            </Typography>
          </Box>
        )}
        sx={{ ml: -1, mr: 0, alignItems: 'center' }}
      />
      {on && (
        <TextField
          label="Finish by"
          type="datetime-local"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.slice(0, 16))}
          error={!valid}
          helperText={!valid ? 'Pick a date and time' : parseDue(value) < new Date() ? 'This time has already passed' : ' '}
          sx={{ mt: 1.5, minWidth: 240 }}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: `${MAX_DATE}T23:59`, step: 300 } }}
        />
      )}
    </Box>
  );
}

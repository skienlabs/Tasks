import { useRef, useState } from 'react';
import { Box, ButtonBase, Checkbox, IconButton, InputBase, LinearProgress, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SubdirectoryArrowRightRounded from '@mui/icons-material/SubdirectoryArrowRightRounded';
import ChecklistRounded from '@mui/icons-material/ChecklistRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { MAX_DEPTH, MAX_STEPS, add, depthOf, flatten, progress, remove, rename, toggle } from '../lib/subtasks.js';
import { toggleStep } from '../lib/store.js';

const INDENT = 22;

/** Thread lines on the left, one per nesting level (Reddit-style). */
function Threads({ depth }) {
  return Array.from({ length: depth }, (_, i) => (
    <Box
      key={i}
      aria-hidden
      sx={(t) => ({
        position: 'absolute', top: 0, bottom: 0, left: 13 + i * INDENT, width: '2px', borderRadius: 1,
        bgcolor: t.tokens.outline, opacity: 0.7,
      })}
    />
  ));
}

/** "2/5" with a small bar; toggles the inline list. */
export function StepsProgress({ steps, open, onToggle }) {
  const p = progress(steps);
  if (!p.total) return null;
  const complete = p.done === p.total;
  return (
    <ButtonBase
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-expanded={open}
      aria-label={`${p.done} of ${p.total} steps done. ${open ? 'Hide' : 'Show'} steps`}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, borderRadius: 2, px: 0.5, py: 0.25, ml: -0.5 }}
    >
      <ChecklistRounded sx={{ fontSize: 15, color: complete ? 'success.main' : 'text.secondary' }} />
      <Typography component="span" sx={{ fontSize: 12.5, color: complete ? 'success.main' : 'text.secondary', fontWeight: 500 }}>
        {p.done}/{p.total}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={(p.done / p.total) * 100}
        color={complete ? 'success' : 'primary'}
        sx={{ width: 44, height: 4, borderRadius: 2 }}
      />
      <ExpandMoreRounded sx={{ fontSize: 16, color: 'text.secondary', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
    </ButtonBase>
  );
}

/** Steps under a task card; ticking here saves right away. */
export function StepsInline({ task, disabled }) {
  const rows = flatten(task.subtasks ?? []);
  return (
    <Box role="list" onClick={(e) => e.stopPropagation()} sx={{ mt: 0.5, mb: 0.25 }}>
      {rows.map(({ step, depth }) => (
        <Box key={step.id} role="listitem" sx={{ position: 'relative', display: 'flex', alignItems: 'center', minHeight: 34, pl: `${depth * INDENT}px` }}>
          <Threads depth={depth} />
          <Checkbox
            size="small"
            checked={step.done}
            disabled={disabled}
            onChange={() => toggleStep(task.id, step.id)}
            slotProps={{ input: { 'aria-label': `${step.done ? 'Untick' : 'Tick'} step "${step.title}"` } }}
            sx={{ p: 0.5, mr: 0.5 }}
          />
          <Typography
            sx={{
              fontSize: 14, lineHeight: 1.35, wordBreak: 'break-word', py: 0.5,
              color: step.done ? 'text.secondary' : 'text.primary',
              textDecoration: step.done ? 'line-through' : 'none',
            }}
          >
            {step.title}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/** Editable step tree for the task form. Changes are kept in the form until Save. */
export function StepsEditor({ value, onChange }) {
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState(null); // step id the next step goes under
  const inputRef = useRef(null);
  const rows = flatten(value);
  const p = progress(value);
  const full = value.length >= MAX_STEPS;

  const replyStep = replyTo ? value.find((s) => s.id === replyTo) : null;
  const submit = () => {
    const t = draft.trim();
    if (!t) return;
    const next = add(value, t, replyStep ? replyTo : null);
    if (next !== value) {
      onChange(next);
      setDraft('');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          Steps{p.total ? ` · ${p.done}/${p.total} done` : ''}
        </Typography>
      </Box>
      {p.total > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          The task is completed when every step is ticked.
        </Typography>
      )}
      <Box role="list">
        {rows.map(({ step, depth }) => (
          <Box
            key={step.id}
            role="listitem"
            sx={(t) => ({
              position: 'relative', display: 'flex', alignItems: 'center', minHeight: 40, pl: `${depth * INDENT}px`, borderRadius: 2,
              bgcolor: replyTo === step.id ? t.tokens.surfaceHigh : 'transparent',
              '& .step-actions': { opacity: { xs: 1, md: 0.35 } },
              '&:hover .step-actions, &:focus-within .step-actions': { opacity: 1 },
            })}
          >
            <Threads depth={depth} />
            <Checkbox
              size="small"
              checked={step.done}
              onChange={() => onChange(toggle(value, step.id))}
              slotProps={{ input: { 'aria-label': `${step.done ? 'Untick' : 'Tick'} step "${step.title}"` } }}
              sx={{ p: 0.5, mr: 0.5 }}
            />
            <InputBase
              defaultValue={step.title}
              key={`${step.id}:${step.title}`}
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (!t) e.target.value = step.title;
                else if (t !== step.title) onChange(rename(value, step.id, t));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              inputProps={{ maxLength: 300, 'aria-label': 'Step title' }}
              sx={{
                flex: 1, fontSize: 14.5,
                textDecoration: step.done ? 'line-through' : 'none',
                color: step.done ? 'text.secondary' : 'text.primary',
              }}
            />
            <Box className="step-actions" sx={{ display: 'flex', transition: 'opacity 120ms' }}>
              {depthOf(value, step.id) < MAX_DEPTH && (
                <Tooltip title="Add a sub-step">
                  <IconButton
                    size="small"
                    aria-label={`Add a sub-step under "${step.title}"`}
                    onClick={() => {
                      setReplyTo(step.id);
                      inputRef.current?.focus();
                    }}
                  >
                    <SubdirectoryArrowRightRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Remove step">
                <IconButton
                  size="small"
                  aria-label={`Remove step "${step.title}"`}
                  onClick={() => {
                    onChange(remove(value, step.id));
                  }}
                >
                  <CloseRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        ))}
      </Box>
      <Box
        sx={(t) => ({
          display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, pl: 1, pr: 0.5, minHeight: 40,
          borderRadius: 2, border: `1px dashed ${t.tokens.outline}`,
        })}
      >
        <AddRounded fontSize="small" color="primary" />
        <InputBase
          inputRef={inputRef}
          value={draft}
          disabled={full}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              submit();
            } else if (e.key === 'Escape' && replyTo) {
              e.stopPropagation();
              setReplyTo(null);
            }
          }}
          placeholder={full ? `Up to ${MAX_STEPS} steps` : replyStep ? `Sub-step of "${replyStep.title}"` : 'Add a step'}
          inputProps={{ maxLength: 300, 'aria-label': 'New step' }}
          sx={{ flex: 1, fontSize: 14.5 }}
        />
        {replyStep && (
          <Tooltip title="Add at the top level instead">
            <IconButton size="small" aria-label="Stop adding sub-steps" onClick={() => setReplyTo(null)}>
              <CloseRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {draft.trim() && (
          <IconButton size="small" color="primary" aria-label="Add step" onClick={submit}>
            <AddRounded fontSize="small" />
          </IconButton>
        )}
      </Box>
    </Box>
  );
}

import { Button, IconButton, Snackbar } from '@mui/material';
import Close from '@mui/icons-material/Close';
import { closeToast, useToast } from '../lib/store.js';

export default function Toast() {
  const toast = useToast();
  return (
    <Snackbar
      key={toast?.key}
      open={Boolean(toast)}
      autoHideDuration={toast?.undo ? 5000 : 4000}
      onClose={(_, reason) => reason !== 'clickaway' && closeToast()}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      message={toast?.message}
      // On phones: above the bottom bar and left of the + button, so neither is covered.
      sx={{ bottom: { xs: 'calc(88px + env(safe-area-inset-bottom))', md: 24 }, right: { xs: 88, md: 'auto' } }}
      action={
        <>
          {toast?.undo && (
            <Button
              size="small"
              onClick={() => {
                const undo = toast.undo;
                closeToast();
                undo();
              }}
              sx={(t) => ({ color: t.palette.mode === 'dark' ? '#0b57d0' : '#a8c7fa', fontWeight: 600 })}
            >
              {toast.actionLabel || 'Undo'}
            </Button>
          )}
          <IconButton size="small" aria-label="Dismiss" onClick={closeToast} sx={{ color: 'inherit' }}>
            <Close fontSize="small" />
          </IconButton>
        </>
      }
    />
  );
}

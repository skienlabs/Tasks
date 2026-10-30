import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, Typography } from '@mui/material';
import HourglassTopRounded from '@mui/icons-material/HourglassTopRounded';
import { lookupJoin, requestJoin } from '../lib/store.js';
import { TeamAvatar } from './teams/parts.jsx';

/** The token in a /join/<token> address (an invite link or its QR code), or null. */
export function joinToken() {
  const m = window.location.pathname.match(/^\/join\/([A-Za-z0-9_-]{16,64})\/?$/);
  return m ? m[1] : null;
}

/** Someone opened a team's invite link: show the team and let them ask to join. */
export default function JoinDialog({ token, onClose, onOpenTeam }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    lookupJoin(token).then(setInfo, (err) => setError(err.status === 0 ? 'You appear to be offline. Try the link again when you are connected.' : err.message));
  }, [token]);
  const ask = async () => {
    setBusy(true);
    try {
      const res = await requestJoin(token);
      setInfo((i) => ({ ...i, status: res.status }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const team = info?.team;
  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogContent sx={{ display: 'grid', gap: 1.5, justifyItems: 'center', textAlign: 'center', pt: 4 }}>
        {!info && !error && <CircularProgress />}
        {error && <Alert severity="error" sx={{ borderRadius: 3, width: '100%', textAlign: 'left' }}>{error}</Alert>}
        {team && (
          <>
            <TeamAvatar team={team} size={72} />
            <Typography sx={{ fontSize: 22, fontWeight: 500 }}>{team.name}</Typography>
            <Typography color="text.secondary">{team.memberCount} {team.memberCount === 1 ? 'person' : 'people'}</Typography>
            {info.status === 'none' && (
              <Typography color="text.secondary" variant="body2">
                You were sent an invite link to this team. Ask to join and one of its admins lets you in.
              </Typography>
            )}
            {info.status === 'requested' && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', color: 'text.secondary' }}>
                <HourglassTopRounded fontSize="small" />
                <Typography variant="body2">Request sent. You&apos;ll be told when an admin lets you in.</Typography>
              </Box>
            )}
            {info.status === 'member' && <Typography color="text.secondary" variant="body2">You&apos;re already in this team.</Typography>}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: 'center' }}>
        {info?.status === 'none' ? (
          <>
            <Button onClick={onClose} disabled={busy}>Not now</Button>
            <Button variant="contained" onClick={ask} disabled={busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}>Ask to join</Button>
          </>
        ) : info?.status === 'member' ? (
          <Button variant="contained" onClick={() => onOpenTeam(team.id)}>Open team</Button>
        ) : (
          <Button variant="contained" onClick={onClose}>Done</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

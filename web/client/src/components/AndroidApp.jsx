import { Box, ButtonBase, Typography } from '@mui/material';
import AndroidRounded from '@mui/icons-material/AndroidRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import { ANDROID_DOWNLOAD_URL, androidApp, formatSize } from '../lib/config.js';

/**
 * "Get the Android app": downloads the APK this server offers (nothing shows when it has none).
 * Android asks to allow installs from the browser the first time; the hint says so.
 */
export default function AndroidApp({ sx }) {
  const app = androidApp();
  if (!app) return null;
  return (
    <ButtonBase
      component="a"
      href={ANDROID_DOWNLOAD_URL}
      download="Tasks.apk"
      sx={[
        (t) => ({
          display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', textAlign: 'left',
          px: 1.75, py: 1.25, borderRadius: 3, border: `1px solid ${t.tokens.outline}`, color: 'text.primary',
          transition: 'background-color 120ms, border-color 120ms',
          '&:hover': { bgcolor: t.tokens.cardHover, borderColor: t.palette.primary.main },
          '&.Mui-focusVisible': { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 2 },
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box sx={(t) => ({ width: 36, height: 36, borderRadius: 2, display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: t.tokens.chip, color: '#3ddc84' })}>
        <AndroidRounded />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14.5, fontWeight: 500, lineHeight: 1.3 }}>Get the Android app</Typography>
        <Typography color="text.secondary" sx={{ fontSize: 12.5, lineHeight: 1.35 }}>
          Tasks.apk · {formatSize(app.size)} · allow installs from your browser when asked
        </Typography>
      </Box>
      <DownloadRounded sx={{ color: 'text.secondary' }} />
    </ButtonBase>
  );
}

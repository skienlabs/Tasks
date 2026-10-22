import { Box } from '@mui/material';

// Where each light sits and how it moves (positions in % of the screen, size in vmax).
const BLOBS = [
  { top: '-18%', left: '-12%', size: 62, anim: 'blobDrift1 26s ease-in-out infinite' },
  { top: '30%', left: '58%', size: 58, anim: 'blobDrift2 31s ease-in-out infinite' },
  { top: '62%', left: '-6%', size: 54, anim: 'blobDrift3 36s ease-in-out infinite' },
  { top: '-24%', left: '62%', size: 46, anim: 'blobDrift3 29s ease-in-out infinite reverse' },
  { top: '78%', left: '48%', size: 50, anim: 'blobDrift1 40s ease-in-out infinite reverse' },
];

/**
 * The light behind the Glass themes: soft coloured lights drifting slowly under the panels,
 * so the frosted surfaces always have something to refract. Sits behind everything.
 */
export default function GlassBackdrop({ tokens, dark }) {
  const g = tokens.glass;
  return (
    <Box aria-hidden sx={{ position: 'fixed', inset: 0, zIndex: -1, overflow: 'hidden', pointerEvents: 'none', bgcolor: tokens.bg }}>
      {BLOBS.map((b, i) => (
        <Box
          key={i}
          sx={{
            position: 'absolute', top: b.top, left: b.left, width: `${b.size}vmax`, height: `${b.size}vmax`, borderRadius: '50%',
            background: `radial-gradient(circle at 50% 50%, ${g.blobs[i]} 0%, transparent 66%)`,
            opacity: g.blobOpacity, filter: 'blur(40px)', animation: b.anim, willChange: 'transform',
            mixBlendMode: dark ? 'screen' : 'multiply',
          }}
        />
      ))}
      {/* A faint slow caustic sweep, like light moving through water. */}
      <Box
        sx={{
          position: 'absolute', inset: '-50%',
          background: `conic-gradient(from 0deg at 50% 50%, transparent 0deg, ${dark ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.35)'} 40deg, transparent 90deg, transparent 180deg, ${dark ? 'rgba(255,255,255,.025)' : 'rgba(255,255,255,.25)'} 230deg, transparent 280deg)`,
          animation: 'glassSpin 90s linear infinite',
          '@keyframes glassSpin': { to: { transform: 'rotate(360deg)' } },
        }}
      />
      {/* Darken (or lighten) the edges a touch so text near them stays readable. */}
      <Box sx={{ position: 'absolute', inset: 0, background: dark ? 'radial-gradient(ellipse at 50% 40%, transparent 40%, rgba(0,0,0,.55) 100%)' : 'radial-gradient(ellipse at 50% 40%, transparent 45%, rgba(255,255,255,.5) 100%)' }} />
    </Box>
  );
}

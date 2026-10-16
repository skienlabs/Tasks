export default function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id="tasks-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4c8df6" />
          <stop offset="1" stopColor="#0b57d0" />
        </linearGradient>
      </defs>
      <rect x="4" y="7" width="40" height="37" rx="11" fill="url(#tasks-logo-g)" />
      <rect x="14" y="3" width="4" height="9" rx="2" fill="#0b57d0" />
      <rect x="30" y="3" width="4" height="9" rx="2" fill="#0b57d0" />
      <path d="M15 26.5l6 6 12-12.5" fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

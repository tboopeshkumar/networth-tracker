/** The app mark: the home-screen icon's rising line, as a small rounded tile. Keep in step with public/icon.svg. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg className="block flex-none rounded-lg" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="#2a78d6" />
      <polyline
        points="6.5,22 10.5,19 14,20.5 18,14.5 22,16 25.5,9.5"
        fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx="25.5" cy="9.5" r="2.2" fill="#fff" />
    </svg>
  );
}

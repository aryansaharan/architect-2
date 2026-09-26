/** Small SVG glyphs for the Signal concept. Pure markup, no client state. */

export function Mark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="2.4" fill="#f1f4ea" />
      <ellipse cx="16" cy="16" rx="13" ry="5.2" stroke="#f1f4ea" strokeOpacity="0.55" />
      <ellipse cx="16" cy="16" rx="8" ry="3.2" stroke="#f1f4ea" strokeOpacity="0.3" />
      <circle cx="27.4" cy="13.6" r="2" fill="#d4ff3f" />
      <path d="M16 3v4M16 25v4" stroke="#f1f4ea" strokeOpacity="0.4" />
    </svg>
  );
}

export function Arrow({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 10h13M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}

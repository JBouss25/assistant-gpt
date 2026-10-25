export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <defs>
          <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--brand)" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#logo-g)" />
        <circle cx="11.5" cy="16" r="4.5" fill="white" fillOpacity="0.95" />
        <circle cx="20.5" cy="16" r="4.5" fill="white" fillOpacity="0.6" />
      </svg>
      <span className="text-lg">Mentora</span>
    </span>
  );
}

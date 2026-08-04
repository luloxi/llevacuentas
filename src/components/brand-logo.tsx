import { cn } from "@/lib/utils";

/** Monogram mark: stacked cards + coin — LC mark for LlevaCuentas. */
export function BrandLogo({
  className,
  size = 40,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="lc-grad" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34D399" />
          <stop offset="0.55" stopColor="#059669" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
        <linearGradient id="lc-shine" x1="18" y1="12" x2="48" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* rounded square base */}
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#lc-grad)" />
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#lc-shine)" />
      {/* back card */}
      <rect
        x="16"
        y="14"
        width="28"
        height="20"
        rx="4"
        transform="rotate(-12 30 24)"
        fill="#ECFDF5"
        fillOpacity="0.35"
      />
      {/* front card */}
      <rect x="18" y="22" width="28" height="20" rx="4" fill="#ECFDF5" />
      <rect x="22" y="27" width="12" height="2.5" rx="1" fill="#059669" fillOpacity="0.55" />
      <rect x="22" y="32" width="18" height="2.5" rx="1" fill="#059669" fillOpacity="0.35" />
      {/* coin */}
      <circle cx="42" cy="44" r="10" fill="#A7F3D0" />
      <circle cx="42" cy="44" r="7.5" fill="#6EE7B7" />
      <path
        d="M40.2 40.5c.5-.9 1.5-1.4 2.7-1.4 1.6 0 2.7.8 2.7 2 0 1-.5 1.5-1.7 1.9l-1.5.5c-.7.2-1 .5-1 .9 0 .5.5.8 1.2.8.7 0 1.2-.3 1.5-.8l1.5.8c-.5 1.1-1.6 1.8-3.1 1.8-1.8 0-3-1-3-2.3 0-1.1.6-1.8 1.8-2.2l1.5-.5c.6-.2.9-.4.9-.8 0-.4-.4-.7-1-.7-.6 0-1 .3-1.2.7l-1.5-.7z"
        fill="#047857"
      />
    </svg>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <BrandLogo size={32} />
      <span>LlevaCuentas</span>
    </span>
  );
}

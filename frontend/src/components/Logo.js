import Link from "next/link";

export function LogoMark({ className = "size-8" }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c5cff" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0d1220" />
      <rect x="2" y="2" width="60" height="60" rx="14" fill="none" stroke="url(#logo-g)" strokeWidth="2.5" />
      <path d="M22 22 L13 32 L22 42" fill="none" stroke="url(#logo-g)" strokeWidth="5" strokeLinecap="round"
        strokeLinejoin="round" />
      <path d="M42 22 L51 32 L42 42" fill="none" stroke="url(#logo-g)" strokeWidth="5" strokeLinecap="round"
        strokeLinejoin="round" />
      <path d="M27 34 L31 38 L38 27" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round"
        strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ href = "/" }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-[15px] leading-none font-semibold tracking-tight">
        Programming <span className="gradient-text">Haven</span>
      </span>
    </Link>
  );
}

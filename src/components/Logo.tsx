import Link from "next/link";

/** The mark (a W that reads as a price line) plus the wordmark. Same drawing as app/icon.svg. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 font-display text-[17px] font-medium ${className}`}>
      <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden>
        <rect width="32" height="32" rx="7" fill="#14F195" />
        <path d="M6.5 10 L11 23 L16 14.5 L21 23 L25.5 10" fill="none" stroke="#07080d" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>Wrapped <span className="text-fg-3">Onchain</span></span>
    </Link>
  );
}

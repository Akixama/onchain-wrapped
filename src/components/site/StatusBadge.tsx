// Small status indicators used across the site. Only "live" and "running" move; the rest are still.
type Kind = "live" | "running" | "done" | "waiting";

export function StatusBadge({ kind, className = "" }: { kind: Kind; className?: string }) {
  if (kind === "live") {
    return (
      <span className={`relative inline-flex h-3 w-3 items-center justify-center ${className}`} aria-hidden>
        <span className="absolute h-3 w-3 rounded-full bg-accent-ink/40 motion-safe:animate-[radar_1.8s_cubic-bezier(0.22,1,0.36,1)_infinite]" />
        <span className="relative h-1.5 w-1.5 rounded-full bg-accent-ink" />
      </span>
    );
  }
  if (kind === "running") {
    return (
      <svg viewBox="0 0 14 14" className={`h-3.5 w-3.5 motion-safe:animate-spin ${className}`} aria-hidden>
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
        <path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "done") {
    // The signature shape: a tiny ribbon loop closed with a tick.
    return (
      <svg viewBox="0 0 14 14" className={`h-3.5 w-3.5 text-accent-ink ${className}`} aria-hidden>
        <circle cx="7" cy="7" r="5.75" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.25" />
        <path d="M4.4 7.2l1.8 1.8 3.4-3.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="[stroke-dasharray:10] motion-safe:animate-[draw_500ms_cubic-bezier(0.22,1,0.36,1)_both]" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 14 14" className={`h-3.5 w-3.5 ${className}`} aria-hidden>
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" />
    </svg>
  );
}

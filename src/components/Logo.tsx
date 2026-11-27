import Link from "next/link";

/** The ribbon mark plus the wordmark. Same artwork as app/icon.png. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 font-display text-[17px] font-medium ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-96.png" alt="" width={28} height={28} className="h-7 w-7" />
      <span>Wrapped <span className="text-fg-3">Onchain</span></span>
    </Link>
  );
}

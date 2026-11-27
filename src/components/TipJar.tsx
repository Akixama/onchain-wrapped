"use client";
// A small "Tip the dev" link that opens a box: any amount of SOL, sent from the visitor's own wallet.
// The site never touches funds: it shows the address, a QR code and a payment link the wallet app opens.
import { X } from "lucide-react";
import QRCode from "qrcode";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { TIP_ADDRESS } from "@/lib/site";

/** Solana Pay transfer link: wallet apps open it with the address (and amount, if given) filled in. */
const payLink = (amount: string) => {
  const q = new URLSearchParams({ label: "Wrapped Onchain", message: "Thanks for the tip!" });
  if (amount) q.set("amount", amount);
  return `solana:${TIP_ADDRESS}?${q}`;
};

export function TipJar({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={`text-xs text-fg-3 underline-offset-4 transition-colors hover:text-fg hover:underline ${className}`}>
        <CupIcon className="mr-1 inline h-4 w-4 align-[-3px]" />Enjoying this? Tip the dev
      </button>
      <AnimatePresence>{open && <TipBox onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}

/**
 * Floating tip button, fixed to the bottom-right corner. Placed on the home, compare and chart
 * game pages (not the story or chat: their own buttons sit in that corner).
 */
export function TipFab() {
  const [open, setOpen] = useState(false);
  // Never cover the page: when anything sits under the button's spot, it tucks into a small tab at
  // the right edge (still tappable) and slides back out once the spot is clear.
  const [tucked, setTucked] = useState(false);
  const [margin, setMargin] = useState(16); // the corner gap (16px on phones, 24px from sm up)
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const b = ref.current;
      if (!b) return;
      // Measure where the full button sits (its untucked spot), not where it is drawn right now.
      const w = b.offsetWidth, h = b.offsetHeight, m = innerWidth >= 640 ? 24 : 16;
      setMargin(m);
      const r = { left: innerWidth - m - w, top: innerHeight - m - h, right: innerWidth - m, bottom: innerHeight - m };
      const pts: [number, number][] = [[r.left + 4, r.top + 4], [r.right - 4, r.top + 4], [r.left + 4, r.bottom - 4], [r.right - 4, r.bottom - 4], [(r.left + r.right) / 2, (r.top + r.bottom) / 2]];
      const covers = pts.some(([x, y]) => document.elementsFromPoint(x, y).some((el) => {
        if (el === b || b.contains(el) || el === document.body || el === document.documentElement) return false;
        if (el.closest("[aria-hidden='true']")) return false; // background glows
        const er = el.getBoundingClientRect();
        // Page-sized wrappers aren't content; cards, text, buttons and inputs are.
        return !(er.width >= innerWidth * 0.9 && er.height >= innerHeight * 0.6) && !(er.width >= innerWidth * 0.9 && el.children.length > 1 && !el.textContent?.trim());
      }));
      setTucked(covers);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(check); };
    schedule();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    const t = setInterval(schedule, 800); // content that moves on its own (animations, loading)
    return () => { removeEventListener("scroll", schedule); removeEventListener("resize", schedule); clearInterval(t); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return (
    <>
      <button ref={ref} onClick={() => setOpen(true)} aria-label="Tip the dev"
        // Tucked: only a 12px sliver shows, inside the page's side margin, so it covers nothing.
        style={{ transform: tucked ? `translateX(calc(100% + ${margin}px - 12px))` : undefined }}
        className={`fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-xl border border-line bg-ink-3 p-3 text-sm font-medium text-fg shadow-[0_8px_24px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] transition-[transform,opacity,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[#232837] hover:!translate-x-0 active:scale-[0.97] sm:bottom-6 sm:right-6 sm:px-5 ${tucked ? "opacity-80" : ""}`}>
        <CupIcon className="h-[18px] w-[18px] text-accent" />
        <span className="hidden text-sm sm:inline">Tip the dev</span>
      </button>
      <AnimatePresence>{open && <TipBox onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}

function TipBox({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  // Only plain positive numbers go into the link (up to 9 decimals, SOL's smallest unit).
  const clean = /^\d*\.?\d{0,9}$/.test(amount) && Number(amount) > 0 ? String(Number(amount)) : "";
  const link = payLink(clean);

  useEffect(() => {
    let live = true;
    QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#07080d", light: "#ffffff" } })
      .then((svg) => { if (live) setQr(svg); }).catch(() => {});
    return () => { live = false; };
  }, [link]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label="Tip the dev" className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-ink-2 p-5 text-fg shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-display text-xl font-medium"><CupIcon className="h-5 w-5 text-accent" />Tip the dev</div>
            <p className="mt-1 text-sm text-fg-2">Wrapped Onchain is free. If it made you laugh (or cry), send any amount of SOL.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-fg-3 transition-colors hover:bg-ink-3 hover:text-fg"><X className="h-4 w-4" strokeWidth={1.5} /></button>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs text-fg-2">Amount in SOL (optional)</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="Any amount"
            className="h-12 w-full rounded-xl border border-line bg-ink-1 px-4 font-mono text-lg outline-none placeholder:text-fg-3 focus:border-[rgb(20_241_149/0.5)]" />
        </label>

        <div className="flex items-center gap-4">
          <div className="h-32 w-32 shrink-0 overflow-hidden rounded-lg bg-white p-1" aria-label="QR code to pay with a phone wallet"
            dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="text-sm text-fg-2">Scan with Phantom, Solflare or any Solana wallet{clean ? <> — <b className="text-white">{clean} SOL</b> is filled in</> : ""}. You confirm it in your wallet.</p>
        </div>

        <a href={link} className="block rounded-xl bg-accent py-3 text-center font-display font-medium text-ink-0 transition-[transform,background-color] duration-150 hover:bg-[#3df5a9] active:scale-[0.98]">
          Open in my wallet{clean ? ` · ${clean} SOL` : ""}
        </a>
        <div className="space-y-1.5">
          <div className="text-xs text-fg-2">Or send to this address</div>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-ink-1 p-2 pl-3">
            <code className="min-w-0 flex-1 break-all font-mono text-xs text-fg">{TIP_ADDRESS}</code>
            <button onClick={async () => { await navigator.clipboard.writeText(TIP_ADDRESS); setCopied(true); }}
              className="shrink-0 rounded-lg bg-ink-3 px-3 py-2 text-xs font-medium transition-colors hover:bg-[#232837]">{copied ? "Copied" : "Copy"}</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Coffee cup (emoji ☕ renders as a grey blob on some Windows fonts). */
function CupIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M17 8h1a4 4 0 0 1 0 8h-1" /><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
      <path d="M6 2v2" /><path d="M10 2v2" /><path d="M14 2v2" />
    </svg>
  );
}

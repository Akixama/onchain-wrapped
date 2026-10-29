"use client";
// A small "Tip the dev" link that opens a box: any amount of SOL, sent from the visitor's own wallet.
// The site never touches funds: it shows the address, a QR code and a payment link the wallet app opens.
import QRCode from "qrcode";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { TIP_ADDRESS } from "@/lib/site";

/** Solana Pay transfer link: wallet apps open it with the address (and amount, if given) filled in. */
const payLink = (amount: string) => {
  const q = new URLSearchParams({ label: "Onchain Wrapped", message: "Thanks for the tip!" });
  if (amount) q.set("amount", amount);
  return `solana:${TIP_ADDRESS}?${q}`;
};

export function TipJar({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={`text-xs text-white/55 underline-offset-4 hover:text-white hover:underline ${className}`}>
        <CupIcon className="mr-1 inline h-4 w-4 align-[-3px]" />Enjoying this? Tip the dev
      </button>
      <AnimatePresence>{open && <TipBox onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}

/**
 * Floating tip button, fixed to the bottom-right corner. Placed on the home, compare, quiz and chart
 * game pages (not the story or chat: their own buttons sit in that corner).
 */
export function TipFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Tip the dev"
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-gradient-to-br from-[#14F195] to-[#9945FF] p-3.5 font-semibold text-black shadow-[0_8px_30px_rgba(20,241,149,0.35)] transition hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6 sm:px-5">
        <CupIcon />
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
    QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0B0820", light: "#ffffff" } })
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
        role="dialog" aria-label="Tip the dev" className="w-full max-w-sm space-y-4 rounded-3xl border border-white/10 bg-[#141028] p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-display text-xl font-bold"><CupIcon className="h-5 w-5" />Tip the dev</div>
            <p className="mt-1 text-sm text-white/65">Onchain Wrapped is free. If it made you laugh (or cry), send any amount of SOL.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 px-2.5 py-1 text-sm hover:bg-white/20">✕</button>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-white/55">Amount (SOL, optional)</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="Any amount"
            className="w-full rounded-2xl border border-white/20 bg-white/[0.06] px-4 py-3 text-lg outline-none placeholder:text-white/35 focus:border-white/50" />
        </label>

        <div className="flex items-center gap-4">
          <div className="h-32 w-32 shrink-0 overflow-hidden rounded-xl bg-white p-1" aria-label="QR code to pay with a phone wallet"
            dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="text-sm text-white/65">Scan with Phantom, Solflare or any Solana wallet{clean ? <> — <b className="text-white">{clean} SOL</b> is filled in</> : ""}. You confirm it in your wallet.</p>
        </div>

        <a href={link} className="block rounded-2xl bg-white py-3 text-center font-display font-bold text-black active:scale-[0.98]">
          Open in my wallet{clean ? ` · ${clean} SOL` : ""}
        </a>
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-white/55">Or send to this address</div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-black/30 p-2 pl-3">
            <code className="min-w-0 flex-1 break-all text-xs text-white/85">{TIP_ADDRESS}</code>
            <button onClick={async () => { await navigator.clipboard.writeText(TIP_ADDRESS); setCopied(true); }}
              className="shrink-0 rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/25">{copied ? "Copied" : "Copy"}</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Coffee cup (emoji ☕ renders as a grey blob on some Windows fonts). */
function CupIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M17 8h1a4 4 0 0 1 0 8h-1" /><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
      <path d="M6 2v2" /><path d="M10 2v2" /><path d="M14 2v2" />
    </svg>
  );
}

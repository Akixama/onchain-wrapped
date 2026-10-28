"use client";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EVM_ENABLED } from "@/lib/site";
import type { Timeframe } from "@/lib/core/types";
import { TIMEFRAME_LABEL } from "@/components/format";

const MAX = 6;
const SOLANA_ONLY_MSG = "Only Solana wallets work here. Paste a Solana address or .sol name.";
const looksValid = (s: string) =>
  EVM_ENABLED
    ? /^0x[a-fA-F0-9]{40}$/.test(s) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s) || /^[^\s]+\.[a-z0-9]+$/i.test(s)
    : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s) || /^[a-z0-9-_.]+\.(sol|sns)$/i.test(s);

export function LandingForm() {
  const router = useRouter();
  const [wallets, setWallets] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [timeframe, setTimeframe] = useState<Timeframe>("12m");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<{ key: string; checking?: boolean; needed?: number; capacity?: number; fits?: boolean } | null>(null);

  // Before the lookup: is this a bot-flooded wallet too big for today's free data budget?
  const candidates = [...new Set([...wallets, ...draft.split(/[\s,;]+/).filter(Boolean)])].filter(looksValid).slice(0, MAX);
  const sizeKey = `${timeframe}|${candidates.join(",")}`;
  useEffect(() => {
    if (!candidates.length) return;
    let live = true;
    const t = setTimeout(async () => {
      setSize({ key: sizeKey, checking: true });
      try {
        const r = await fetch("/api/estimate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: candidates, timeframe }) });
        const j = await r.json();
        if (live) setSize(typeof j.needed === "number" ? { key: sizeKey, needed: j.needed, capacity: j.capacity, fits: j.fits } : null);
      } catch {
        if (live) setSize(null);
      }
    }, 700);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizeKey]);

  const addFrom = (text: string) => {
    const parts = text.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return;
    setWallets((w) => [...new Set([...w, ...parts])].slice(0, MAX));
    setDraft("");
    setError(null);
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const all = [...new Set([...wallets, ...draft.split(/[\s,;]+/).filter(Boolean)])].slice(0, MAX);
    if (!all.length) return setError(EVM_ENABLED ? "Paste a wallet address, ENS or .sol name." : "Paste a Solana wallet address or .sol name.");
    const bad = all.find((w) => !looksValid(w));
    if (bad) return setError(!EVM_ENABLED && (/^0x/i.test(bad) || /\.eth$/i.test(bad)) ? SOLANA_ONLY_MSG : `"${bad}" doesn't look like a wallet.`);
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/wrapped", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: all, timeframe }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Something went wrong.");
      router.push(`/w/${j.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="rounded-3xl border border-white/15 bg-white/[0.06] p-2 backdrop-blur focus-within:border-white/40">
        {wallets.length > 0 && (
          <div className="flex flex-wrap gap-2 p-2">
            {wallets.map((w) => (
              <motion.span key={w} layout initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="inline-flex max-w-full items-center gap-2 rounded-full bg-white/15 py-1 pl-3 pr-1 text-sm">
                <span className="truncate">{w.length > 16 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w}</span>
                <button type="button" aria-label={`Remove ${w}`} onClick={() => setWallets((x) => x.filter((y) => y !== w))}
                  className="grid h-6 w-6 place-items-center rounded-full bg-white/15 text-xs hover:bg-white/30">✕</button>
              </motion.span>
            ))}
          </div>
        )}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => { const t = e.clipboardData.getData("text"); if (/[\s,;]/.test(t.trim())) { e.preventDefault(); addFrom(t); } }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" && draft.trim() && wallets.length) || e.key === "," || e.key === " ") { e.preventDefault(); addFrom(draft); }
            if (e.key === "Backspace" && !draft && wallets.length) setWallets((w) => w.slice(0, -1));
          }}
          onBlur={() => draft.trim() && addFrom(draft)}
          placeholder={wallets.length ? "Add another wallet (optional)" : (EVM_ENABLED ? "Wallet address, vitalik.eth or toly.sol" : "Solana wallet address or toly.sol")}
          aria-label="Wallet address or name"
          autoComplete="off" autoCapitalize="off" spellCheck={false}
          className="w-full bg-transparent px-4 py-3.5 text-base outline-none placeholder:text-white/40"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap rounded-full bg-white/10 p-1 text-sm font-semibold" role="radiogroup" aria-label="Timeframe">
          {([["1m", "1M"], ["3m", "3M"], ["6m", "6M"], ["12m", "1Y"], ["all", "All"]] as const).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={timeframe === v} aria-label={TIMEFRAME_LABEL[v]} onClick={() => setTimeframe(v)}
              className={`rounded-full px-3 py-2 transition sm:px-4 ${timeframe === v ? "bg-white text-black" : "text-white/70"}`}>{l}</button>
          ))}
        </div>
        <span className="text-xs text-white/50">{wallets.length}/{MAX} wallets</span>
      </div>
      {size?.key === sizeKey && size.checking && <p className="text-center text-xs text-white/50">Checking wallet size…</p>}
      {size?.key === sizeKey && !size.checking && size.fits === false && (
        <p role="status" className="rounded-2xl bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          {size.capacity! < 1000
            ? <>This wallet is flooded with bot transactions and today&apos;s free data is used up. Try again tomorrow for a full result.</>
            : <>Big wallet: it has more transactions in this period than today&apos;s free data can read (about {Math.round(size.capacity! / 1000).toLocaleString()}k). Pick a shorter period to get it all now, or the result will be partial.</>}
        </p>
      )}
      <button disabled={busy} className="w-full rounded-2xl bg-white py-4 font-display text-lg font-bold text-black transition active:scale-[0.98] disabled:opacity-60">
        {busy ? "Starting…" : timeframe === "12m" ? "Wrap my year" : timeframe === "all" ? "Wrap my whole history" : `Wrap my ${TIMEFRAME_LABEL[timeframe].toLowerCase()}`}
      </button>
      {error && <p role="alert" className="text-center text-sm text-rose-300">{error}</p>}
      <p className="text-center text-xs text-white/50">Got more than one wallet? Add them all. Transfers between your own wallets don&apos;t count as trades.</p>
    </form>
  );
}

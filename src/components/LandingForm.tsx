"use client";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const MAX = 6;
const looksValid = (s: string) =>
  /^0x[a-fA-F0-9]{40}$/.test(s) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s) || /^[^\s]+\.[a-z0-9]+$/i.test(s);

export function LandingForm() {
  const router = useRouter();
  const [wallets, setWallets] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [timeframe, setTimeframe] = useState<"12m" | "all">("12m");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!all.length) return setError("Paste a wallet address, ENS or .sol name.");
    const bad = all.find((w) => !looksValid(w));
    if (bad) return setError(`"${bad}" doesn't look like a wallet.`);
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
          placeholder={wallets.length ? "Add another wallet (optional)" : "Wallet address, vitalik.eth or toly.sol"}
          aria-label="Wallet address or name"
          autoComplete="off" autoCapitalize="off" spellCheck={false}
          className="w-full bg-transparent px-4 py-3.5 text-base outline-none placeholder:text-white/40"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex rounded-full bg-white/10 p-1 text-sm font-semibold" role="radiogroup" aria-label="Timeframe">
          {([["12m", "Last 12 months"], ["all", "All time"]] as const).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={timeframe === v} onClick={() => setTimeframe(v)}
              className={`rounded-full px-4 py-2 transition ${timeframe === v ? "bg-white text-black" : "text-white/70"}`}>{l}</button>
          ))}
        </div>
        <span className="text-xs text-white/50">{wallets.length}/{MAX} wallets</span>
      </div>
      <button disabled={busy} className="w-full rounded-2xl bg-white py-4 font-display text-lg font-bold text-black transition active:scale-[0.98] disabled:opacity-60">
        {busy ? "Starting…" : "Wrap my year"}
      </button>
      {error && <p role="alert" className="text-center text-sm text-rose-300">{error}</p>}
      <p className="text-center text-xs text-white/50">Got more than one wallet? Add them all. Transfers between your own wallets don&apos;t count as trades.</p>
    </form>
  );
}

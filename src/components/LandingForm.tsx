"use client";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
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
  // What to open when it's ready: the full story, or just the Pump.fun Wrapped page. Same lookup either way.
  const [view, setView] = useState<"all" | "pump">("all");
  // Custom range ("YYYY-MM-DD"). Filled when Custom is picked: the page is pre-rendered, where "today" isn't available.
  const [range, setRange] = useState<{ from: string; to: string; min: string; max: string } | null>(null);
  const pickCustom = () => {
    const day = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().slice(0, 10);
    setRange((r) => r ?? { from: day(90 * 864e5), to: day(0), min: day(365 * 864e5), max: day(0) });
    setTimeframe("custom");
  };
  const rangeBody = timeframe === "custom" && range ? { from: range.from, to: range.to } : {};
  const [busy, setBusy] = useState(false);
  // "Starting…" while the request runs and the story page loads. A transition ends by itself once
  // we've navigated, so coming back to this page (kept alive in the background) shows the button again.
  const [navigating, startNav] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<{ key: string; checking?: boolean; needed?: number; capacity?: number; fits?: boolean } | null>(null);

  // Before the lookup: is this a bot-flooded wallet too big for today's free data budget?
  const candidates = [...new Set([...wallets, ...draft.split(/[\s,;]+/).filter(Boolean)])].filter(looksValid).slice(0, MAX);
  const sizeKey = `${timeframe}${timeframe === "custom" && range ? `:${range.from}:${range.to}` : ""}|${candidates.join(",")}`;
  useEffect(() => {
    if (!candidates.length) return;
    let live = true;
    const t = setTimeout(async () => {
      setSize({ key: sizeKey, checking: true });
      try {
        const r = await fetch("/api/estimate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: candidates, timeframe, ...rangeBody }) });
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
    if (timeframe === "custom" && (!range || range.from > range.to)) return setError("Pick a start date on or before the end date.");
    if (timeframe === "custom" && range && (range.from < range.min || range.to > range.max)) return setError("Pick dates within the last 12 months.");
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/wrapped", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: all, timeframe, ...rangeBody }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Something went wrong.");
      setBusy(false);
      startNav(() => router.push(view === "pump" ? `/w/${j.id}?view=pump` : `/w/${j.id}`));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const seg = (on: boolean) =>
    `rounded-lg transition-colors duration-150 ${on ? "bg-ink-3 text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" : "text-fg-2 hover:text-fg"}`;
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-ink-0 p-1 text-sm" role="radiogroup" aria-label="What to see">
        {([["all", "Full Wrapped", "Everything you traded"], ["pump", "Pump.fun Wrapped", "Just your pump.fun coins"]] as const).map(([v, label, hint]) => (
          <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} className={`${seg(view === v)} px-3 py-2 text-left`}>
            <span className="block font-medium leading-5">{label}</span>
            <span className="block text-xs leading-4 text-fg-3">{hint}</span>
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-line bg-ink-2 transition-colors duration-150 focus-within:border-[rgb(20_241_149/0.5)]">
        {wallets.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {wallets.map((w) => (
              <span key={w} className="inline-flex max-w-full items-center gap-1 rounded-md bg-ink-3 py-1 pl-2 pr-1 font-mono text-xs">
                <span className="truncate">{w.length > 16 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w}</span>
                <button type="button" aria-label={`Remove ${w}`} onClick={() => setWallets((x) => x.filter((y) => y !== w))}
                  className="grid h-5 w-5 place-items-center rounded text-fg-3 transition-colors hover:bg-ink-2 hover:text-fg"><X className="h-3.5 w-3.5" strokeWidth={1.5} /></button>
              </span>
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
          className="h-12 w-full bg-transparent px-4 text-base outline-none placeholder:text-fg-3"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-ink-0 p-1 text-sm" role="radiogroup" aria-label="Timeframe">
          {([["1m", "1M"], ["3m", "3M"], ["6m", "6M"], ["12m", "1Y"]] as const).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={timeframe === v} aria-label={TIMEFRAME_LABEL[v]} onClick={() => setTimeframe(v)}
              className={`${seg(timeframe === v)} h-8 px-3 font-mono text-xs sm:px-4`}>{l}</button>
          ))}
          <button type="button" role="radio" aria-checked={timeframe === "custom"} aria-label="Custom dates" onClick={pickCustom}
            className={`${seg(timeframe === "custom")} h-8 px-3 text-xs sm:px-4`}>Custom</button>
        </div>
        <span className="font-mono text-xs text-fg-3">{wallets.length}/{MAX} wallets</span>
      </div>
      {timeframe === "custom" && range && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          {(["from", "to"] as const).map((k) => (
            <label key={k} className="space-y-1">
              <span className="block text-xs text-fg-2">{k === "from" ? "From" : "To"}</span>
              <input type="date" value={range[k]} min={range.min} max={range.max} required
                onChange={(e) => setRange({ ...range, [k]: e.target.value })}
                className="h-10 w-full rounded-lg border border-line bg-ink-2 px-3 font-mono text-fg [color-scheme:dark]" />
            </label>
          ))}
        </div>
      )}
      {size?.key === sizeKey && size.checking && <p className="text-center text-xs text-fg-3">Checking wallet size…</p>}
      {size?.key === sizeKey && !size.checking && size.fits === false && (
        <p role="status" className="rounded-xl border border-[rgb(229_180_84/0.2)] bg-[rgb(229_180_84/0.08)] px-4 py-3 text-sm text-[#e5c07b]">
          {size.capacity! < 1000
            ? <>This wallet is flooded with bot transactions and today&apos;s free data is used up. Try again tomorrow for a full result.</>
            : <>Big wallet: it has more transactions in this period than today&apos;s free data can read (about {Math.round(size.capacity! / 1000).toLocaleString()}k). Pick a shorter period to get it all now, or the result will be partial.</>}
        </p>
      )}
      <button disabled={busy || navigating}
        className="h-12 w-full rounded-xl bg-accent font-display text-[17px] font-medium text-ink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] transition-[transform,opacity,background-color] duration-150 hover:bg-[#3df5a9] active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        {busy || navigating ? "Starting…" : (view === "pump" ? "Wrap my pump.fun " : "Wrap my ") + (timeframe === "12m" ? "year" : timeframe === "custom" ? "dates" : TIMEFRAME_LABEL[timeframe].toLowerCase())}
      </button>
      {error && <p role="alert" className="text-center text-sm text-neg">{error}</p>}
      <p className="text-xs leading-5 text-fg-3">Got more than one wallet? Add them all. Transfers between your own wallets don&apos;t count as trades.</p>
    </form>
  );
}

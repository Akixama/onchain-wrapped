// Pump.fun Wrapped: the slice of the year spent on coins launched on pump.fun.
// A pump.fun coin is one whose mint address ends in "pump" (pump.fun gives every coin it launches that suffix).
// Graduation comes from pump.fun's own bonding-curve account on the chain: its "complete" flag flips when the
// coin graduates. (DexScreener can't tell: it drops coins that graduated and then died.) Whether a graduated
// coin still trades comes from its best pool's size today.
import { PublicKey } from "@solana/web3.js";
import type { UnifiedEvent } from "../core/types";
import type { PriceBook } from "../prices/pricebook";
import type { Position } from "./pnl";
import type { SniperStats } from "../launch";
import { rpc } from "../chains/solana-rpc";

export interface PumpCoin { symbol: string; address: string; icon?: string; pnlUsd: number; costUsd: number; proceedsUsd: number }

export interface PumpStats {
  /** Pump.fun coins traded, and their share of every coin traded. */
  coins: number;
  share: number;
  trades: number;
  volumeUsd: number;
  /** Result on pump.fun coins, and on everything else, with the same PnL rules as the main total. */
  pnlUsd: number;
  otherPnlUsd: number;
  wins: number;
  losses: number;
  /** What became of the pump.fun coins they bought, read from the chain. */
  graduated: number;
  /** Of the graduated ones: still trading today (a pool worth $1k+). */
  graduatedAlive: number;
  neverGraduated: number;
  unchecked: number;
  best: PumpCoin | null;
  worst: PumpCoin | null;
  /** Coins they launched themselves (from the launch check; absent when it didn't run). */
  launched?: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
export const isPumpMint = (address: string) => address.endsWith("pump");
const MIN_RESULT = 5; // $: smaller results are noise, not wins or losses
const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const COMPLETE_OFFSET = 48; // 8-byte discriminator + five u64 reserves/supply fields, then `complete: bool`

/** Graduated or not, per mint (null = no curve account / couldn't read). */
export async function graduation(mints: string[], stopAt?: number): Promise<Map<string, boolean | null>> {
  const out = new Map<string, boolean | null>();
  const curves = mints.map((m) => { try { return PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), new PublicKey(m).toBuffer()], PUMP_PROGRAM)[0].toBase58(); } catch { return null; } });
  for (let i = 0; i < mints.length; i += 100) {
    if (stopAt && Date.now() > stopAt) break;
    const batch = curves.slice(i, i + 100);
    try {
      const r = await rpc<{ value: ({ data: [string, string] } | null)[] }>("getMultipleAccounts", [batch.map((c) => c ?? PUMP_PROGRAM.toBase58()), { encoding: "base64", dataSlice: { offset: COMPLETE_OFFSET, length: 1 } }]);
      r.value.forEach((a, j) => {
        const m = mints[i + j];
        if (!batch[j] || !a) { out.set(m, null); return; }
        out.set(m, Buffer.from(a.data[0], "base64")[0] === 1);
      });
    } catch { /* this batch stays unknown */ }
  }
  return out;
}

export async function pumpStats(positions: Position[], events: UnifiedEvent[], pb: PriceBook, sniper?: SniperStats, stopAt?: number): Promise<PumpStats | undefined> {
  const coins = positions.filter((p) => p.chain === "solana" && p.token.address !== "native" && p.buys.length > 0);
  const pump = coins.filter((p) => isPumpMint(p.token.address));
  if (!pump.length) return undefined;
  const isPumpEvent = (e: UnifiedEvent) => [...e.in, ...e.out].some((l) => l.token.chain === "solana" && isPumpMint(l.token.address));
  const swaps = events.filter((e) => e.type === "swap" && !e.spam && !e.ownTransfer && isPumpEvent(e));
  const volume = swaps.reduce((s, e) => s + Math.max(
    e.in.filter((l) => !isPumpMint(l.token.address)).reduce((a, l) => a + (l.usd ?? 0), 0),
    e.out.filter((l) => !isPumpMint(l.token.address)).reduce((a, l) => a + (l.usd ?? 0), 0)), 0);

  const grad = await graduation(pump.map((p) => p.token.address), stopAt).catch(() => new Map<string, boolean | null>());
  let graduated = 0, graduatedAlive = 0, neverGraduated = 0, unchecked = 0;
  for (const p of pump) {
    const g = grad.get(p.token.address);
    if (g == null) { unchecked++; continue; }
    if (!g) { neverGraduated++; continue; }
    graduated++;
    if ((pb.liquidity(p.key) ?? 0) >= 1000) graduatedAlive++;
  }
  const coin = (p: Position): PumpCoin => ({ symbol: p.token.symbol, address: p.token.address, icon: p.token.icon, pnlUsd: r2(p.pnl), costUsd: r2(p.costIn), proceedsUsd: r2(p.proceeds) });
  const byPnl = [...pump].sort((a, b) => b.pnl - a.pnl);
  const best = byPnl[0] && byPnl[0].pnl > 0 ? coin(byPnl[0]) : null;
  const worst = byPnl.at(-1) && byPnl.at(-1)!.pnl < 0 ? coin(byPnl.at(-1)!) : null;
  const sum = (ps: Position[]) => ps.reduce((s, p) => s + p.pnl, 0);
  return {
    coins: pump.length,
    share: coins.length ? Math.round((pump.length / coins.length) * 1000) / 1000 : 0,
    trades: swaps.length,
    volumeUsd: r2(volume),
    pnlUsd: r2(sum(pump)),
    otherPnlUsd: r2(sum(coins.filter((p) => !isPumpMint(p.token.address)))),
    wins: pump.filter((p) => p.pnl >= MIN_RESULT).length,
    losses: pump.filter((p) => p.pnl <= -MIN_RESULT).length,
    graduated, graduatedAlive, neverGraduated, unchecked,
    best, worst,
    launched: sniper && !sniper.sampled ? sniper.launched : undefined,
  };
}

// Round trip with vs without real price peaks, on saved events (no provider re-fetch).
//   node --env-file=.env.local --import tsx scripts/test-peaks.mts out/<name>.events.json [12m|all]
import { readFileSync } from "node:fs";
import type { UnifiedEvent } from "../src/lib/core/types";
import { isEvmAddress } from "../src/lib/core/identity";
import { analyze } from "../src/lib/pipeline";

const [file, tf = "all"] = process.argv.slice(2);
const load = (): UnifiedEvent[] => JSON.parse(readFileSync(file, "utf8"));
const wallets = [...new Set(load().map((e) => e.wallet))];
const resolved = wallets.map((address) => ({ address, family: (isEvmAddress(address) ? "evm" : "solana") as "evm" | "solana" }));
const now = Math.floor(Date.now() / 1000);
const sinceTs = tf === "12m" ? now - 365 * 86400 : 0;
const run = async (candidates: string) => {
  process.env.PEAK_CANDIDATES = candidates;
  const t0 = Date.now();
  const s = await analyze({ events: load(), resolved, timeframe: tf as "12m" | "all", sinceTs, coverageStart: sinceTs, truncated: false, cap: 0 });
  const rt = s.roundTrip;
  return { secs: ((Date.now() - t0) / 1000).toFixed(1), roundTrip: rt ? `${rt.symbol}: peaked +$${rt.peakGainUsd} (${new Date(rt.peakTs * 1000).toISOString().slice(0, 10)}), ended ${rt.endedWithUsd >= 0 ? "+" : ""}$${rt.endedWithUsd}` : "none", rugs: s.rugs.count, paper: s.paperHands?.symbol ?? "none" };
};
// console.log("without real peaks:", await run("0"));
console.log("with real peaks:   ", await run("10"));

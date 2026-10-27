// Turn saved runs in out/*.events.json into demo results with the CURRENT engine, without calling
// Zerion (only free price + Solana RPC calls).   npm run seed
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { UnifiedEvent } from "../src/lib/core/types";
import { isEvmAddress } from "../src/lib/core/identity";
import { analyze } from "../src/lib/pipeline";
import { putJob, lookupKey, rememberKey } from "../src/lib/store";
import { storyCards } from "../src/lib/engine/stats";
import { cannedRoast } from "../src/lib/roast";
import { usingRedis } from "../src/lib/infra/kv";
import { isMoney } from "../src/lib/core/assets";
import { verifySolanaTransfers } from "../src/lib/chains/solana-rpc";

console.log(`Seeding demo results into ${usingRedis() ? "Upstash Redis" : "local files (.data/)"}`);

// Demo ids are neutral on purpose: public leaderboards disagree on who owns which wallet.
const DEMOS: { id: string; file: string; wallets: string[]; names?: Record<string, string>; label: string }[] = [
  { id: "sol-sniper", file: "cented", label: "Solana sniper", wallets: ["CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o"] },
  {
    id: "sol-cluster", file: "cented-merged", label: "Solana sniper (3 wallets)",
    wallets: ["CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o", "n62QUDHwXWCnZyArC9KsP3PqeBzf7WwAMqRLtwUgR7z", "6RE3SxJ7a1GrDEA3t1otHs1kiQyeGp6VdxYdo8y9s6NZ"],
  },
  { id: "sol-memes", file: "gucci", label: "Solana memecoin trader", wallets: ["YvEsBWpHK5PJ6Q8m4YrocwKeWys1NG67pbgi73UPnuX"] },
  {
    id: "machi", file: "machi", label: "machibigbrother.eth", wallets: ["0x020ca66c30bec2c4fe3861a94e4db4a498a35872"],
    names: { "0x020ca66c30bec2c4fe3861a94e4db4a498a35872": "machibigbrother.eth" },
  },
  { id: "defi-whale", file: "tetranode", label: "DeFi whale", wallets: ["0x9c5083dd4838e120dbeac44c052179692aa5dac5"] },
];

// Optional: npm run seed -- sol-memes   (only re-seed the demos named)
const only = process.argv.slice(2);
for (const d of DEMOS) {
  if (only.length && !only.includes(d.id)) continue;
  // Big runs are kept gzipped in git (GitHub warns above 50MB).
  const path = `out/${d.file}.events.json`;
  const gz = `${path}.gz`;
  if (!existsSync(path) && !existsSync(gz)) { console.log(`skip ${d.id}: no ${path}`); continue; }
  const raw = existsSync(path) ? readFileSync(path, "utf8") : gunzipSync(readFileSync(gz)).toString("utf8");
  const events: UnifiedEvent[] = JSON.parse(raw);
  const old = JSON.parse(readFileSync(`out/${d.file}.json`, "utf8"));
  // Saved events already went through identity + pricing once; let the current rules decide again.
  for (const e of events) {
    e.ownTransfer = false;
    for (const l of [...e.in, ...e.out]) if (isMoney(l.token)) l.usd = null; // re-price with hourly majors
  }
  // Same blockchain double-check new lookups get: fix sells the provider labeled as transfers.
  const v = await verifySolanaTransfers(events, isMoney);
  if (v.checked) console.log(`  ${d.id}: checked ${v.checked} Solana transfers on-chain, corrected ${v.fixed}`);
  const notes = [...(old.meta.notes ?? []).filter((n: string) => !/Corrected .* Solana trades/.test(n))];
  if (v.fixed) notes.push(`Corrected ${v.fixed} Solana trades the data provider had labeled as plain transfers.`);
  const sinceTs = Math.floor(Date.now() / 1000) - 365 * 86400;
  const stats = await analyze({
    events,
    resolved: d.wallets.map((address) => ({ address, family: isEvmAddress(address) ? "evm" : "solana", name: d.names?.[address] })),
    timeframe: "12m",
    sinceTs,
    // Capped runs only cover back to their oldest saved event.
    coverageStart: old.meta.truncated ? Math.min(...events.map((e) => e.timestamp)) : sinceTs,
    truncated: !!old.meta.truncated,
    cap: old.meta.txCap ?? 1000,
    notes,
  });
  stats.meta.names = d.names ?? {};
  // Demos use the free built-in roast (seeding never spends API money).
  stats.roast = { text: cannedRoast(stats, d.id), source: "canned" };
  stats.cards = storyCards(stats);
  await putJob({
    id: d.id, status: "done", inputs: d.wallets, wallets: d.wallets, names: d.names ?? {}, timeframe: "12m",
    createdAt: Date.now(), updatedAt: Date.now(), stats, demo: true,
    progress: { stage: "done", message: "Done", fetched: events.length },
  });
  await rememberKey(lookupKey(d.wallets, "12m"), d.id, 365 * 86400);
  console.log(`${d.id.padEnd(15)} trades ${String(stats.overview.totalTrades).padStart(4)}  pnl ${stats.pnl.totalUsd}  cards ${stats.cards.length}  journey ${stats.bridges.journey.join(">") || "-"}`);
}

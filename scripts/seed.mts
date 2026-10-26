// Turn saved runs in out/*.events.json into demo results with the CURRENT engine, without calling
// Zerion (only free price + Solana RPC calls).   npm run seed
import { readFileSync, existsSync } from "node:fs";
import type { UnifiedEvent } from "../src/lib/core/types";
import { isEvmAddress } from "../src/lib/core/identity";
import { analyze } from "../src/lib/pipeline";
import { putJob, lookupKey, rememberKey } from "../src/lib/store";
import { storyCards } from "../src/lib/engine/stats";
import { cannedRoast } from "../src/lib/roast";
import { usingRedis } from "../src/lib/infra/kv";

console.log(`Seeding demo results into ${usingRedis() ? "Upstash Redis" : "local files (.data/)"}`);

const DEMOS: { id: string; file: string; wallets: string[]; names?: Record<string, string>; label: string }[] = [
  { id: "cented", file: "cented", label: "Cented", wallets: ["CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o"] },
  {
    id: "cented-cluster", file: "cented-merged", label: "Cented (3 wallets)",
    wallets: ["CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o", "n62QUDHwXWCnZyArC9KsP3PqeBzf7WwAMqRLtwUgR7z", "6RE3SxJ7a1GrDEA3t1otHs1kiQyeGp6VdxYdo8y9s6NZ"],
  },
  { id: "gucci", file: "gucci", label: "Gucci", wallets: ["YvEsBWpHK5PJ6Q8m4YrocwKeWys1NG67pbgi73UPnuX"] },
  {
    id: "machi", file: "machi", label: "machibigbrother.eth", wallets: ["0x020ca66c30bec2c4fe3861a94e4db4a498a35872"],
    names: { "0x020ca66c30bec2c4fe3861a94e4db4a498a35872": "machibigbrother.eth" },
  },
  { id: "tetranode", file: "tetranode", label: "Tetranode", wallets: ["0x9c5083dd4838e120dbeac44c052179692aa5dac5"] },
];

for (const d of DEMOS) {
  const path = `out/${d.file}.events.json`;
  if (!existsSync(path)) { console.log(`skip ${d.id}: no ${path}`); continue; }
  const events: UnifiedEvent[] = JSON.parse(readFileSync(path, "utf8"));
  const old = JSON.parse(readFileSync(`out/${d.file}.json`, "utf8"));
  // Saved events already went through identity once; let the current rules decide again.
  for (const e of events) e.ownTransfer = false;
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
    notes: old.meta.notes ?? [],
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

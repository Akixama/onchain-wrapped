// Forget everything saved for a wallet's 1-year lookup, so the next run starts from scratch (used to time a cold run).
//   node --env-file=.env.local --import tsx scripts/clear-wallet.mts <wallet>
import { clearBlob } from "../src/lib/infra/blob";
import { kv } from "../src/lib/infra/kv";
import { lookupKey } from "../src/lib/store";
const w = process.argv[2];
const idx = `idx:${lookupKey([w], "12m")}`;
console.log("saved result:", (await kv().get(idx)) ?? "none");
await kv().set(idx, "", 1);
for (const k of [`ver:solana:${w}`, `zres:solana:${w}:12m`]) {
  console.log(k, "clearing");
  await clearBlob(k);
}
process.exit(0);

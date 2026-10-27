// Batch double-check (Helius) vs one-by-one (RPC) on the same deliberately mislabeled trades.
//   node --env-file=.env.local --import tsx scripts/test-verify.mts <events.json> [n]
import { readFileSync } from "node:fs";
import type { UnifiedEvent } from "../src/lib/core/types";
import { isMoney } from "../src/lib/core/assets";
import { verifySolanaTransfers } from "../src/lib/chains/solana-rpc";
import { verifyTransfersHelius } from "../src/lib/chains/solana-helius";

const [file, nStr] = process.argv.slice(2);
const all: UnifiedEvent[] = JSON.parse(readFileSync(file, "utf8"));
const swaps = all.filter((e) => e.chain === "solana" && e.type === "swap" && e.out.some((l) => !isMoney(l.token))).slice(0, Number(nStr ?? 150));
// Mislabel like Zerion does: a sell shown as a plain transfer of the token only.
const mislabel = (e: UnifiedEvent): UnifiedEvent => ({ ...structuredClone(e), type: "transfer_out", in: [], verified: undefined });
const a = swaps.map(mislabel), b = swaps.map(mislabel);
let t0 = Date.now();
const ra = await verifySolanaTransfers(a, isMoney);
const ta = Date.now() - t0;
t0 = Date.now();
const rb = await verifyTransfersHelius(b, isMoney);
const tb = Date.now() - t0;
const key = (e: UnifiedEvent) => [e.type, ...[...e.in.map((l) => "+" + l.token.address + ":" + l.amount.toPrecision(9)), ...e.out.map((l) => "-" + l.token.address + ":" + l.amount.toPrecision(9))].sort()].join(" ");
let same = 0;
const diffs: string[] = [];
a.forEach((e, i) => (key(e) === key(b[i]) ? same++ : diffs.push(`${e.txHash.slice(0, 10)}\n  rpc   ${key(e)}\n  batch ${key(b[i])}`)));
console.log(`one-by-one: fixed ${ra.fixed}/${a.length} in ${(ta / 1000).toFixed(1)}s | batch: fixed ${rb.fixed}/${b.length} in ${(tb / 1000).toFixed(1)}s | identical results: ${same}/${a.length}`);
console.log(diffs.slice(0, 5).join("\n"));

// Compare two saved runs token by token (same wallet, different data source).
import { readFileSync } from "node:fs";
import type { UnifiedEvent } from "../src/lib/core/types";
import { isMoney } from "../src/lib/core/assets";
const load = (f: string): UnifiedEvent[] => JSON.parse(readFileSync(f, "utf8"));
const [A, B] = [load(process.argv[2]), load(process.argv[3])];
const per = (evs: UnifiedEvent[]) => {
  const m = new Map<string, { sym: string; solIn: number; solOut: number; tokIn: number; tokOut: number; n: number; types: Set<string>; txs: Set<string> }>();
  for (const e of evs) for (const l of [...e.in, ...e.out]) {
    if (isMoney(l.token)) continue;
    const r = m.get(l.token.address) ?? { sym: l.token.symbol, solIn: 0, solOut: 0, tokIn: 0, tokOut: 0, n: 0, types: new Set(), txs: new Set() };
    r.n++; r.types.add(e.type + (e.ownTransfer ? "(own)" : "")); r.txs.add(e.txHash);
    if (e.in.includes(l)) r.tokIn += l.amount; else r.tokOut += l.amount;
    if (e.type === "swap") { for (const x of e.in) if (isMoney(x.token)) r.solIn += x.amount; for (const x of e.out) if (isMoney(x.token)) r.solOut += x.amount; }
    m.set(l.token.address, r);
  }
  return m;
};
const a = per(A), b = per(B);
const keys = new Set([...a.keys(), ...b.keys()]);
const rows = [];
for (const k of keys) {
  const x = a.get(k), y = b.get(k);
  const dx = (x?.solIn ?? 0) - (x?.solOut ?? 0), dy = (y?.solIn ?? 0) - (y?.solOut ?? 0);
  const tokDiff = Math.abs((x?.tokIn ?? 0) - (y?.tokIn ?? 0)) + Math.abs((x?.tokOut ?? 0) - (y?.tokOut ?? 0));
  if (Math.abs(dx - dy) > 0.002 || tokDiff > 1) rows.push({ sym: x?.sym ?? y?.sym, k, zerionNetSol: dx.toFixed(4), heliusNetSol: dy.toFixed(4), zTypes: [...(x?.types ?? [])].join(","), hTypes: [...(y?.types ?? [])].join(","), onlyIn: [...(y?.txs ?? [])].filter((t) => !x?.txs.has(t)).map((t) => t.slice(0, 10)).join(",") || "-", onlyZ: [...(x?.txs ?? [])].filter((t) => !y?.txs.has(t)).map((t) => t.slice(0, 10)).join(",") || "-" });
}
console.table(rows);
const txA = new Set(A.map((e) => e.txHash)), txB = new Set(B.map((e) => e.txHash));
console.log("txs only in first:", [...txA].filter((t) => !txB.has(t)).length, " only in second:", [...txB].filter((t) => !txA.has(t)).length);

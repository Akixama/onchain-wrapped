// Every transaction of the wallets in the period, straight from the chain: any that moved a coin
// (not SOL alone) but isn't in the site's data?
//   node --env-file=.env.local --import tsx scripts/check-missing.mts 1m <wallet> [...]
import { runWrapped } from "../src/lib/pipeline";
import { TIMEFRAME_DAYS } from "../src/lib/core/types";
const [tf, ...wallets] = process.argv.slice(2);
const r = await runWrapped({ addresses: wallets, timeframe: tf as "1m" });
if (r.partial) throw new Error("partial");
const known = new Set(r.events.map((e) => e.txHash));
const since = Math.floor(Date.now() / 1000) - TIMEFRAME_DAYS[tf as "1m"] * 86400;
const rpc = async (method: string, params: unknown[]) => (await (await fetch(process.env.SOLANA_RPC_URL!, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json()).result;
const WSOL = "So11111111111111111111111111111111111111112";
let total = 0, coinMoves = 0, missing = 0;
for (const w of wallets) {
  const sigs: string[] = [];
  let before: string | undefined;
  for (;;) {
    const page: { signature: string; blockTime: number; err: unknown }[] = await rpc("getSignaturesForAddress", [w, { limit: 1000, ...(before ? { before } : {}) }]);
    const inRange = page.filter((s) => s.blockTime >= since);
    sigs.push(...inRange.filter((s) => !s.err).map((s) => s.signature));
    if (page.length < 1000 || inRange.length < page.length) break;
    before = page[page.length - 1].signature;
  }
  for (let i = 0; i < sigs.length; i += 100) {
    const res = await fetch(`https://api-mainnet.helius-rpc.com/v0/transactions?api-key=${process.env.HELIUS_API_KEY}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactions: sigs.slice(i, i + 100) }) });
    for (const t of (await res.json()) as { signature: string; type: string; accountData?: { tokenBalanceChanges?: { userAccount: string; mint: string; rawTokenAmount: { tokenAmount: string } }[] }[] }[]) {
      total++;
      const moved = (t.accountData ?? []).some((a) => (a.tokenBalanceChanges ?? []).some((b) => b.userAccount === w && b.mint !== WSOL && Number(b.rawTokenAmount.tokenAmount) !== 0));
      if (!moved) continue;
      coinMoves++;
      if (!known.has(t.signature)) { missing++; console.log("MISSING", w.slice(0, 4), t.signature.slice(0, 16), t.type); }
    }
  }
}
console.log(`${total} transactions on chain in the period, ${coinMoves} moved a coin, ${missing} of those missing from the site's data`);
process.exit(0);

// Re-read a wallet's trades for given mints straight from the chain and compare with the engine.
//   node --env-file=.env.local scripts/verify-trades.mjs <wallet> <events.json> <mint> [<mint>...]
import fs from "node:fs";
const [W, file, ...mints] = process.argv.slice(2);
const ev = JSON.parse(fs.readFileSync(file, "utf8"));
const rpc = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
for (const mint of mints) {
  const txs = ev.filter((e) => [...e.in, ...e.out].some((l) => l.token.address === mint));
  console.log("\n== mint", mint, txs.length, "txs");
  for (const e of txs) {
    const r = await (await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [e.txHash, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 }] }) })).json();
    if (!r.result) { console.log("rpc error", JSON.stringify(r.error)); continue; }
    const tx = r.result, keys = tx.transaction.message.accountKeys.map((k) => k.pubkey), i = keys.indexOf(W);
    const sol = (tx.meta.postBalances[i] - tx.meta.preBalances[i]) / 1e9;
    const tok = (b) => (b || []).filter((x) => x.owner === W && x.mint === mint).reduce((s, x) => s + Number(x.uiTokenAmount.uiAmount || 0), 0);
    const progs = [...new Set(tx.transaction.message.instructions.map((x) => x.programId))].map((p) => p.slice(0, 6));
    const legs = (ls) => ls.map((l) => `${l.amount.toFixed(4)} ${l.token.symbol || l.token.address.slice(0, 4)} ($${l.usd?.toFixed(2)})`).join(",");
    console.log(new Date(tx.blockTime * 1000).toISOString(), "signer", keys[0] === W, "walletSOL", sol.toFixed(5), "fee", tx.meta.fee / 1e9,
      "tokenΔ", (tok(tx.meta.postTokenBalances) - tok(tx.meta.preTokenBalances)).toFixed(0), "| engine in", legs(e.in), "out", legs(e.out), "|", progs.join(" "), e.txHash);
  }
}

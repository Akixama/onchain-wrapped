// Every token balance change in one transaction, by owner.
//   node --env-file=.env.local scripts/trace-tokens.mjs <signature>
const [sig] = process.argv.slice(2);
const r = await (await fetch(process.env.SOLANA_RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 }] }) })).json();
const t = r.result;
const keys = t.transaction.message.accountKeys.map((k) => k.pubkey);
const d = new Map();
for (const [arr, s] of [[t.meta.preTokenBalances, -1], [t.meta.postTokenBalances, 1]]) for (const b of arr ?? []) {
  const k = `${keys[b.accountIndex].slice(0, 8)} owner ${b.owner?.slice(0, 8)} mint ${b.mint.slice(0, 8)}`;
  d.set(k, (d.get(k) ?? 0) + s * Number(b.uiTokenAmount.amount) / 10 ** b.uiTokenAmount.decimals);
}
for (const [k, v] of d) console.log(k, v);
console.log("signer", keys[0].slice(0, 8));

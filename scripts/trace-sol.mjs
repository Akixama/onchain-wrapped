// Every SOL balance change in one transaction (and whose token account it is).
//   node --env-file=.env.local scripts/trace-sol.mjs <signature>
const [sig] = process.argv.slice(2);
const r = await (await fetch(process.env.SOLANA_RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 }] }) })).json();
const t = r.result;
const tb = [...(t.meta.preTokenBalances ?? []), ...(t.meta.postTokenBalances ?? [])];
t.transaction.message.accountKeys.forEach((a, i) => {
  const d = (t.meta.postBalances[i] - t.meta.preBalances[i]) / 1e9;
  if (Math.abs(d) < 1e-7) return;
  const b = tb.find((x) => x.accountIndex === i);
  console.log(a.pubkey, d.toFixed(6), b ? `token account of ${b.owner.slice(0, 8)} for ${b.mint.slice(0, 8)}` : "");
});
console.log("fee", t.meta.fee / 1e9);

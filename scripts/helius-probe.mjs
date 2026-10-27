// How much of a wallet's Helius history actually touches its balances (vs junk that only references it).
const K = process.env.HELIUS_API_KEY, W = process.argv[2], pages = Number(process.argv[3] ?? 5);
let before, total = 0, moving = 0;
for (let p = 0; p < pages; p++) {
  const u = `https://api-mainnet.helius-rpc.com/v0/addresses/${W}/transactions?api-key=${K}&limit=100&token-accounts=balanceChanged${before ? `&before-signature=${before}` : ""}`;
  const j = await (await fetch(u)).json();
  if (!Array.isArray(j) || !j.length) { console.log("end", JSON.stringify(j).slice(0, 120)); break; }
  const c = {}; let m = 0;
  for (const t of j) {
    c[`${t.type}/${t.source}`] = (c[`${t.type}/${t.source}`] ?? 0) + 1;
    if ((t.accountData ?? []).some((a) => (a.account === W && a.nativeBalanceChange && t.feePayer !== W) || (a.tokenBalanceChanges ?? []).some((b) => b.userAccount === W))) m++;
  }
  total += j.length; moving += m;
  console.log(`page ${p + 1}: ${new Date(j[0].timestamp * 1000).toISOString().slice(0, 16)} → ${new Date(j.at(-1).timestamp * 1000).toISOString().slice(0, 16)} | ${m}/${j.length} move this wallet's tokens/SOL | ${JSON.stringify(c).slice(0, 160)}`);
  before = j.at(-1).signature;
}
console.log(`total ${moving}/${total} real`);

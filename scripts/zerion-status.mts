// Ask Zerion for each key's plan and what's left today, and save it for the size check.
//   node --env-file=.env.local --import tsx scripts/zerion-status.mts
import { keyTag, zerionAuth, zerionHeaders, zerionKeys, zerionRequestsLeft } from "../src/lib/chains/zerion-keys";

for (const k of zerionKeys()) {
  const res = await fetch("https://api.zerion.io/v1/wallets/YvEsBWpHK5PJ6Q8m4YrocwKeWys1NG67pbgi73UPnuX/transactions/?page%5Bsize%5D=1&filter%5Bchain_ids%5D=solana", {
    headers: { authorization: zerionAuth(k), accept: "application/json" },
  });
  zerionHeaders(k)(res.headers);
  const h = (n: string) => res.headers.get(`ratelimit-org-${n}`);
  console.log(keyTag(k), h("tier"), `${h("day-remaining")}/${h("day-limit")} left today, ${h("second-limit")}/s`);
}
await new Promise((r) => setTimeout(r, 3000)); // let the saves finish
console.log("requests left today:", await zerionRequestsLeft());
process.exit(0);

// Check Helius key rotation: first key used up -> the request moves to the next key.
//   UPSTASH_REDIS_REST_URL= node --env-file=.env.local --import tsx scripts/test-helius-keys.mts
import { fetchJson, HttpError, QuotaError } from "../src/lib/infra/http";
import { heliusKey, loadHeliusKeys } from "../src/lib/chains/helius-keys";
const real = process.env.HELIUS_API_KEY!;
process.env.HELIUS_API_KEYS = `${real},not-a-real-key`;
await loadHeliusKeys();
console.log("start key is the real one:", heliusKey() === real);
const url = () => `https://api-mainnet.helius-rpc.com/v0/addresses/suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK/transactions?api-key=${heliusKey()}&limit=1`;
try { await fetchJson("helius", url(), {}, 0); console.log("first key worked (not spent?)"); }
catch (e) { console.log("after 'max usage':", e instanceof HttpError ? `moved on, next key got HTTP ${e.status}` : e instanceof QuotaError ? "QuotaError (no next key)" : String(e)); }
console.log("now using the second key:", heliusKey() === "not-a-real-key");
process.env.HELIUS_API_KEYS = real; // only the spent key: should say all keys are used up
await loadHeliusKeys();
try { await fetchJson("helius", url(), {}, 0); } catch (e) { console.log("all spent ->", e instanceof QuotaError ? `QuotaError(${e.provider})` : String(e)); }
process.exit(0);

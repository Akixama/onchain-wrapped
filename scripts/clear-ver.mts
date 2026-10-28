// Delete a wallet's saved on-chain check results (forces a full re-check on its next lookup).
//   node --env-file=.env.local --import tsx scripts/clear-ver.mts <wallet>
import { clearBlob, loadBlob } from "../src/lib/infra/blob";
const key = `ver:solana:${process.argv[2]}`;
const b = await loadBlob<{ until: number; fixes: Record<string, unknown> }>(key);
console.log("saved:", b ? `${Object.keys(b.fixes).length} fixes up to ${new Date(b.until * 1000).toISOString().slice(0, 10)}` : "none");
await clearBlob(key);
console.log("after:", (await loadBlob(key)) ? "still there" : "deleted");
process.exit(0);

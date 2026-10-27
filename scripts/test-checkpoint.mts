// Round-trip a large checkpoint through the store (Upstash in production config), then clear it.
//   node --env-file=.env.local --import tsx scripts/test-checkpoint.mts
import { clearCheckpoint, loadCheckpoint, saveCheckpoint } from "../src/lib/store";
import { randomBytes } from "node:crypto";

const id = "ckpt-test-" + randomBytes(3).toString("hex");
// Hard-to-compress payload so it spans several pieces.
const data = { events: Array.from({ length: 30000 }, (_, i) => ({ i, sig: randomBytes(32).toString("base64"), t: 1790000000 + i })) };
let t0 = Date.now();
try { console.log("saved", (await saveCheckpoint(id, data)).toLocaleString(), "bytes in", Date.now() - t0, "ms"); }
catch (e) { console.log("save failed after", Date.now() - t0, "ms", String(e).slice(0, 100)); process.exit(1); }
t0 = Date.now();
try {
  const back = await loadCheckpoint<typeof data>(id);
  console.log("loaded in", Date.now() - t0, "ms; equal:", JSON.stringify(back) === JSON.stringify(data));
} catch (e) { console.log("load failed after", Date.now() - t0, "ms", String(e).slice(0, 100)); }
await clearCheckpoint(id);
console.log("after clear:", await loadCheckpoint(id));

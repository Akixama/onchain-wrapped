import { runWrapped } from "../src/lib/pipeline";
const [w, tf] = process.argv.slice(2);
const r = await runWrapped({ addresses: [w], timeframe: tf as "3m" });
if (r.partial) { console.log("partial"); process.exit(0); }
const ph = r.stats.paperHands;
console.log(tf, "trades", r.stats.overview.totalTrades, "ph", ph && `${ph.symbol} missed ${ph.missedUsd}`);
process.exit(0);

import { getSiteStats } from "../src/lib/sitestats";
const s = await getSiteStats();
console.log({ ...s, recent: s.recent.slice(0, 5).map((r) => `${new Date(r.t).toISOString()} ${r.title} ${r.trades}t ${r.pnl} ${r.tf}`) });

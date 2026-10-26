const s=require(require("path").resolve(process.argv[2]));const c=x=>x&&`${x.symbol} (${x.chain}) pnl $${x.pnlUsd} | cost $${x.costUsd} proceeds $${x.proceedsUsd} held $${x.holdingValueUsd}${x.partialHistory?" [partial]":""}`;
console.log(JSON.stringify(s.meta));console.log("ARCHETYPE:",s.archetype.title);console.log("OVERVIEW:",JSON.stringify(s.overview));console.log("PNL:",JSON.stringify(s.pnl));
console.log("best:",c(s.bestTrade));console.log("worst:",c(s.worstTrade));
console.log("roundtrip:",s.roundTrip&&c(s.roundTrip)+` peakGain $${s.roundTrip.peakGainUsd}`);
console.log("paper:",s.paperHands&&c(s.paperHands)+` sold@${s.paperHands.soldAt} laterPeak ${s.paperHands.laterPeak} missed $${s.paperHands.missedUsd}`);
console.log("diamond:",s.diamondHands&&c(s.diamondHands)+` ${s.diamondHands.daysHeld}d`);
console.log("COUNTERFACTUAL:",JSON.stringify(s.counterfactual));console.log("GAS:",JSON.stringify(s.gas));console.log("RUGS:",JSON.stringify(s.rugs));console.log("AIRDROPS:",JSON.stringify(s.airdrops));
console.log("sleep: hourUTC",s.sleep.peakHourUtc,"x",s.sleep.peakHourCount,"| minute",s.sleep.topMinuteUtc,"x",s.sleep.topMinuteCount);console.log("bridges:",JSON.stringify(s.bridges.journey),s.bridges.hops.length,"hops $"+s.bridges.totalUsd);

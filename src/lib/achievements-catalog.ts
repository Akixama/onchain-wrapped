// Every badge a wallet can earn. Plain data, safe to import in the browser; detection lives in engine/achievements.ts.

export type Tier = "common" | "rare" | "epic" | "legendary";
export const TIER_ORDER: Record<Tier, number> = { legendary: 0, epic: 1, rare: 2, common: 3 };
export const TIER_LABEL: Record<Tier, string> = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };

export interface AchievementDef { id: string; name: string; desc: string; emoji: string; tier: Tier }

export const ACHIEVEMENTS: AchievementDef[] = [
  // Trading results
  { id: "green_year", name: "In the Green", desc: "Ended the period in profit", emoji: "🟢", tier: "common" },
  { id: "six_figures", name: "Six-Figure Year", desc: "Made $100k+ profit", emoji: "🏆", tier: "legendary" },
  { id: "sharpshooter", name: "Sharpshooter", desc: "Won 60%+ of 50+ closed trades", emoji: "🎯", tier: "epic" },
  { id: "ten_bagger", name: "Ten Bagger", desc: "Sold a coin for 10x what you put in", emoji: "🔟", tier: "rare" },
  { id: "moonshot", name: "Moonshot", desc: "Sold a coin for 100x what you put in", emoji: "🌕", tier: "legendary" },
  { id: "comeback_kid", name: "Comeback Kid", desc: "Held through a 90% drop and sold back above your entry", emoji: "🧟", tier: "epic" },
  { id: "diamond_hands", name: "Diamond Hands", desc: "Held a winner for 6+ months", emoji: "💎", tier: "epic" },
  // Pain
  { id: "paper_hands", name: "Paper Hands", desc: "Sold right before a coin did 10x", emoji: "🧻", tier: "rare" },
  { id: "top_blaster", name: "Top Blaster", desc: "Bought within 1% of a coin's peak, then watched it halve", emoji: "📉", tier: "rare" },
  { id: "round_tripper", name: "Round Tripper", desc: "Was up $1k+ on a coin and gave it all back", emoji: "🎢", tier: "rare" },
  { id: "rug_survivor", name: "Rug Survivor", desc: "Lived through 10+ rug pulls", emoji: "🪤", tier: "epic" },
  { id: "grave_digger", name: "Grave Digger", desc: "Buried 100+ coins", emoji: "⚰️", tier: "epic" },
  { id: "undertaker", name: "The Undertaker", desc: "Buried $10k+ in coins that died", emoji: "🪦", tier: "epic" },
  { id: "rug_proof", name: "Rug Proof", desc: "Traded 50+ coins and never lost money on one that died", emoji: "🛡️", tier: "rare" },
  { id: "escape_artist", name: "Escape Artist", desc: "Got out of 5+ coins before they died", emoji: "🏃", tier: "rare" },
  { id: "bag_collector", name: "Bag Collector", desc: "Still holding 20+ bags", emoji: "🎒", tier: "common" },
  { id: "revenge_arc", name: "Revenge Arc", desc: "Aped a new coin within 10 minutes of a loss, 5+ times", emoji: "😤", tier: "common" },
  // Activity
  { id: "click_frenzy", name: "Click Frenzy", desc: "100+ trades in a single day", emoji: "⚡", tier: "rare" },
  { id: "human_hft", name: "Human HFT", desc: "1,000+ trades in a single day", emoji: "🤖", tier: "legendary" },
  { id: "no_days_off", name: "No Days Off", desc: "Traded 30 days in a row", emoji: "📆", tier: "rare" },
  { id: "speedrunner", name: "Speedrunner", desc: "Bought and sold out of a coin in under a minute", emoji: "⏱️", tier: "rare" },
  { id: "sniper", name: "Sniper", desc: "Bought 10+ coins within a minute of launch", emoji: "🔫", tier: "epic" },
  { id: "coin_collector", name: "Coin Collector", desc: "Traded 100+ different coins", emoji: "🪙", tier: "common" },
  { id: "index_fund", name: "Degen Index Fund", desc: "Traded 1,000+ different coins", emoji: "📚", tier: "epic" },
  { id: "volume_100k", name: "Six-Figure Volume", desc: "Traded $100k+ in volume", emoji: "💸", tier: "rare" },
  { id: "volume_1m", name: "Volume Millionaire", desc: "Traded $1M+ in volume", emoji: "🏦", tier: "epic" },
  { id: "high_roller", name: "High Roller", desc: "Made a single buy over $10k", emoji: "🎰", tier: "epic" },
  // Habits
  { id: "night_owl", name: "Night Owl", desc: "40%+ of trades between 1am and 5am (UTC)", emoji: "🦉", tier: "common" },
  { id: "early_bird", name: "Early Bird", desc: "40%+ of trades between 5am and 9am (UTC)", emoji: "🐦", tier: "common" },
  { id: "weekend_warrior", name: "Weekend Warrior", desc: "Half your trades on Saturdays and Sundays", emoji: "🏖️", tier: "common" },
  { id: "gas_lord", name: "Gas Lord", desc: "Spent $1k+ on network fees", emoji: "⛽", tier: "rare" },
  { id: "fee_machine", name: "Fee Machine", desc: "Paid $1k+ in trading-app fees", emoji: "🧾", tier: "rare" },
  { id: "airdrop_hunter", name: "Airdrop Hunter", desc: "Received 5+ airdrops", emoji: "🪂", tier: "common" },
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Below this many wallets, show tier labels instead of percentages. */
export const RARITY_MIN_WALLETS = 500;

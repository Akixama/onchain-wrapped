// Trading-app fees on Solana: Axiom, GMGN, Photon, Trojan... add ~1% to a trade as a separate transfer
// from the trader to a wallet the app owns, inside the same transaction.
//
// Sources for the wallets below:
// - Telegram bots: Dune spellbook (dbt_subprojects/solana/models/_sector/dex/bot_trades/solana/platforms).
// - Axiom, GMGN, Photon, Terminal: Bitquery's fee investigation (Oct 2026) named one wallet per app; the
//   rest were found on-chain: wallets that took ~1.00% (median) from 40-90 different traders, only inside
//   that app's own trading program. Checked 2026-10-27.
// The fee is already inside the trade's SOL cost, so this never changes PnL; it only shows the split.

export const FEE_WALLETS: Record<string, string> = {
  // Axiom (all paid through its program FLASHX8D...). Same-program wallets that take varied amounts
  // (speed tips) are left out on purpose.
  BfFX9rUm8qTZiZjmeq9BktWVTNuG3YWMc5AvkrCKJike: "Axiom",
  "2ApLdwLrGayEmxgpLX9BTR47Q2QprfMg5SpjrLeaK8s7": "Axiom",
  "5vPNE6VFyXmCmzmWotdxmRk57LEWiXxuAfZL3hKbi2LH": "Axiom",
  EqGzowSp6cKAsMSRyyrFTaBxnZEVeNY81LC18YFy8Cx9: "Axiom",
  ECDrSz47nXihe5kyK4oWEePPsPi9qz6u5d6Fa2sDj3uM: "Axiom",
  "3PvqoztjnRxaAiFmLuEfqZkU4GSbjUareks8S2xCZaTa": "Axiom",
  HkJYryz2BNeMQfuuSWDYktWt5fZLV26eK6nqu7EJycoG: "Axiom",
  "3Tu1Y9aNveLFN4WTAwnAwXL6tbUp5MMe3RxyybG4jTAS": "Axiom",
  "4kuG6NsAFJNwqEkac8GFDMMheCGKUPEbaRVHHyFHSwWz": "Axiom",
  // GMGN
  ByRRgnZenY6W2sddo1VJzX9o4sMU4gPDUkcmgrpGBxRy: "GMGN",
  dBhdrmwBkRa66XxBuAK4WZeZnsZ6bHeHCCLXa3a8bTJ: "GMGN",
  DymeoWc5WLNiQBaoLuxrxDnDRvLgGZ1QGsEoCAM7Jsrx: "GMGN",
  "3t9EKmRiAUcQUYzTZpNojzeGP1KBAVEEbDNmy6wECQpK": "GMGN",
  DXfkEGoo6WFsdL7x6gLZ7r6Hw2S6HrtrAQVPWYx2A1s9: "GMGN",
  "7sHXjs1j7sDJGVSMSPjD1b4v3FD6uRSvRWfhRdfv5BiA": "GMGN",
  HeZVpHj9jLwTVtMMbzQRf6mLtFPkWNSg11o68qrbUBa3: "GMGN",
  "6TxjC5wJzuuZgTtnTMipwwULEbMPx5JPW3QwWkdTGnrn": "GMGN",
  // Web terminals
  AVUCZyuT35YSuj4RH7fwiyPu82Djn2Hfg7y2ND2XcnZH: "Photon",
  J5XGHmzrRmnYWbmw45DbYkdZAU2bwERFZ11qCDXPvFB5: "Padre", // Pump.fun's Terminal (was Padre)
  // Telegram bots (Dune spellbook)
  "9yMwSPk9mrXSN7yDHUuZurAh1sjbJsfpUqjZ7SvVtdco": "Trojan",
  BBYXdwhqbCxVRVtnuMTTxh8biNisz3ZxsnHfr44jXytR: "Trojan",
  ZG98FUCjb8mJ824Gbs6RsgVmr1FhXb2oNiJHa2dwmPd: "BONKbot",
  "7HeD6sLLqAnKVRuSfc1Ko3BSPMNKWgGTiWLKXJF31vKM": "Bloom",
  "8r2hZoDfk5hDWJ1sDujAi2Qr45ZyZw5EQxAXiMZWLKh2": "Banana Gun",
  Cj297UauzMX64FU9dKJZRUBWszJ7tEWpVheasq4CfATV: "Banana Gun",
  HKMh8nV3ysSofRi23LsfVGLGQKB415QAEfZT96kCcVj4: "Banana Gun",
  "7tQiiBdKoScWQkB1RmVuML7DBGnR31cuKPEtMM7Vy5SA": "Banana Gun",
  "4BBNEVRgrxVKv9f7pMNE788XM1tt379X9vNjpDH2KCL7": "Banana Gun",
  "47hEzz83VFR23rLTEeVm9A7eFzjJwjvdupPPmX3cePqF": "Banana Gun",
  EMbqD9Y9jLXEa3RbCR8AsEW1kVa3EiJgDLVgvKh4qNFP: "Banana Gun",
  Lk693UiTzQC4vobasRS1QGcYA9D6RGYLjHp1bWreQtM: "Banana Gun",
  FRMxAnZgkW58zbYcE7Bxqsg99VWpJh6sMP5xLzAWNabN: "Maestro",
  MaestroUL88UBnZr3wfoN7hqmNWFi3ZYCGqZoJJHE36: "Maestro",
  "3kxSQybWEeQZsMuNWMRJH4TxrhwoDwfv41TNMLRzFP5A": "MevX",
  BS3CyJ9rRC4Tp8G7f86r6hGvuu3XdrVGNVpbNM9U5WRZ: "MevX",
  "4Lpvp1q69SHentfYcMBUrkgvppeEx6ovHCSYjg4UYXiq": "MevX",
  noVaE91mUL5jTb8e9Vf6dqJdNPzJpEQ3uAdnQ8h4nVz: "Nova",
  G9PhF9C9H83mAjjkdJz4MDqkufiTPMJkx7TnKE1kFyCp: "Pepe Boost",
  "9cSuF94JWPb1HQzWMcifJzkoggwAtfjsojcUqny5XuJy": "Shuriken",
  "97VmzkjX9w8gMFS2RnHTSjtMEDbifGXBq9pgosFdFnM": "TradeWiz",
  HEPL5rTb6n1Ax6jt9z2XMPFJcDe9bSWvWQpsK7AMcbZg: "SolTradingBot",
  K1LRSA1DSoKBtC5DkcvnermRQ62YxogWSCZZPWQrdG5: "SolTradingBot",
  F34kcgMgCF7mYWkwLN3WN7KrFprr2NbwxuLvXx4fbztj: "SolTradingBot",
  "96aFQc9qyqpjMfqdUeurZVYRrrwPJG2uPV6pceu4B1yb": "SolTradingBot",
  CPixcsP8LEMeUoavaHG3bdkywR8s4mZXNN3mYUgbXFev: "Magnum",
  "8dEe5BM7irAnHtJ6SSWwCRf7njgnyczS3jPrvJJs88U5": "Magnum",
  CWEfC6fLi552zE2KFxhPiBAZUWdT78gMd8NGENik2zfE: "AutoSnipe",
  "3Pu1V4duyLyVpAJue1kLAfr74nGjQ3JDzj3aJjnoEXuL": "Looter",
};

/** Each app's own trading program. Used only for older fee wallets not in the list above. */
const APP_PROGRAMS: Record<string, string> = {
  FLASHX8DrLbgeR8FcfNV1F5krxYcYMUdBkrP1EPBtxB9: "Axiom",
  term9YPb9mzAsABaqN71A4xdbxHmpBNZavpBiQKZzN3: "Padre",
  GMgnVFR8Jb39LoXsEVzb3DvBy3ywCmdmJquHUy1Lrkqb: "GMGN",
  GMGNreQcJFufBiCTLDBgKhYEfEe9B454UjpDr5CaSLA1: "GMGN",
  troyXT7Ty3s2rjJe4bqWaroUrS4Fjd8rbHHNHxcACF4: "Trojan",
  b1oomGGqPKGD6errbyfbVMBuzSC8WtAAYo8MwNafWW1: "Bloom",
};

const MIN_LAMPORTS = 1000; // smaller transfers are markers, not fees

export interface FeeTx {
  feePayer: string;
  nativeTransfers?: { fromUserAccount: string; toUserAccount: string; amount: number }[];
  tokenTransfers?: { fromUserAccount: string; toUserAccount: string; mint: string; tokenAmount: number }[];
  instructions?: { programId: string }[];
}

/**
 * The app fee the wallet paid in this swap, in SOL. `tradeSol` is the SOL side of the trade (for the
 * fallback's 1% check). Only the wallet's own payments count.
 */
export function appFeeOf(tx: FeeTx, wallet: string, tradeSol: number): { app: string; native: number } | null {
  if (tx.feePayer !== wallet) return null;
  const sent = (tx.nativeTransfers ?? []).filter((t) => t.fromUserAccount === wallet && t.toUserAccount !== wallet && t.amount >= MIN_LAMPORTS);
  const known = sent.filter((t) => FEE_WALLETS[t.toUserAccount]);
  if (known.length) {
    const byApp = new Map<string, number>();
    for (const t of known) byApp.set(FEE_WALLETS[t.toUserAccount], (byApp.get(FEE_WALLETS[t.toUserAccount]) ?? 0) + t.amount);
    const [app, lamports] = [...byApp].sort((a, b) => b[1] - a[1])[0];
    return { app, native: lamports / 1e9 };
  }
  // Fallback: the trade ran through an app's own program, and exactly one payment is ~1% of the trade.
  const app = (tx.instructions ?? []).map((i) => APP_PROGRAMS[i.programId]).find(Boolean);
  if (!app || !(tradeSol > 0)) return null;
  const tokenReceivers = new Set((tx.tokenTransfers ?? []).map((t) => t.toUserAccount));
  const near1 = sent.filter((t) => {
    const r = t.amount / 1e9 / tradeSol;
    return r >= 0.007 && r <= 0.0105 && !tokenReceivers.has(t.toUserAccount);
  });
  return near1.length === 1 ? { app, native: near1[0].amount / 1e9 } : null;
}
